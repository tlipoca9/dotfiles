import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	AssistantMessageComponent,
	ToolExecutionComponent,
} from "@earendil-works/pi-coding-agent";
import { stripTerminalSequences } from "@earendil-works/pi-tui";

const patchStateKey = Symbol.for("tlipoca9.pi.compact-tool-history.v5");

type AssistantUpdate = typeof AssistantMessageComponent.prototype.updateContent;
type AssistantMessage = Parameters<AssistantUpdate>[0];
type SetToolExpanded = typeof ToolExecutionComponent.prototype.setExpanded;
type ToolRender = typeof ToolExecutionComponent.prototype.render;

interface AssistantSnapshot {
	message: AssistantMessage;
	rendered: AssistantMessage;
	isStreaming: boolean;
}

interface PatchState {
	assistants: Set<AssistantMessageComponent>;
	assistantSnapshots: WeakMap<AssistantMessageComponent, AssistantSnapshot>;
	currentTools: ToolExecutionComponent[];
	enabled: boolean;
	expanded: WeakMap<ToolExecutionComponent, boolean>;
	hiddenTools: WeakSet<ToolExecutionComponent>;
	latestThinking?: AssistantMessageComponent;
	latestTool?: ToolExecutionComponent;
	originalAssistantUpdate: AssistantUpdate;
	originalSetExpanded: SetToolExpanded;
	originalToolRender: ToolRender;
	textSeen: WeakSet<AssistantMessageComponent>;
	tools: Set<ToolExecutionComponent>;
}

type ToolExecutionPrototype = typeof ToolExecutionComponent.prototype & {
	[key: symbol]: PatchState | undefined;
};

function hasThinking(message: AssistantMessage): boolean {
	return message.content.some(
		(content) => content.type === "thinking" && content.thinking.trim() !== "",
	);
}

function hasText(message: AssistantMessage): boolean {
	return message.content.some(
		(content) => content.type === "text" && content.text.trim() !== "",
	);
}

function filterThinking(message: AssistantMessage, showLatest: boolean): AssistantMessage {
	let latestThinking = -1;
	if (showLatest) {
		for (let index = message.content.length - 1; index >= 0; index--) {
			const content = message.content[index];
			if (content.type === "thinking" && content.thinking.trim() !== "") {
				latestThinking = index;
				break;
			}
		}
	}

	return {
		...message,
		content: message.content.map((content, index) =>
			content.type === "thinking" && index !== latestThinking
				? { ...content, thinking: "" }
				: content,
		),
	};
}

function renderAssistant(
	state: PatchState,
	component: AssistantMessageComponent,
	showLatest: boolean,
): void {
	const snapshot = state.assistantSnapshots.get(component);
	if (!snapshot) return;

	const rendered = filterThinking(snapshot.message, showLatest);
	snapshot.rendered = rendered;
	state.originalAssistantUpdate.call(component, rendered, snapshot.isStreaming);
}

function compactToolRender(lines: string[]): string[] {
	const summary = lines.find(
		(line) => stripTerminalSequences(line).trim() !== "",
	);
	return summary ? [summary] : [];
}

function closeToolInterval(state: PatchState): void {
	if (state.currentTools.length === 0) return;

	for (const tool of state.currentTools.slice(0, -1)) {
		state.hiddenTools.add(tool);
	}
	const intervalTools = state.currentTools;
	state.currentTools = [];
	state.latestTool = undefined;
	for (const tool of intervalTools) tool.invalidate();
}

function disablePatch(state: PatchState, preserveSnapshots: boolean): void {
	state.enabled = false;
	for (const tool of state.tools) tool.invalidate();

	for (const component of state.assistants) {
		const snapshot = state.assistantSnapshots.get(component);
		if (snapshot) {
			state.originalAssistantUpdate.call(
				component,
				snapshot.message,
				snapshot.isStreaming,
			);
		}
	}
	if (!preserveSnapshots) {
		state.assistants.clear();
		state.currentTools = [];
		state.latestThinking = undefined;
		state.latestTool = undefined;
		state.tools.clear();
	}
}

function installRenderPatch(): PatchState {
	const toolPrototype = ToolExecutionComponent.prototype as ToolExecutionPrototype;
	const installed = toolPrototype[patchStateKey];
	if (installed) {
		installed.enabled = true;
		for (const component of installed.assistants) {
			renderAssistant(
				installed,
				component,
				installed.latestThinking === component,
			);
		}
		for (const tool of installed.tools) tool.invalidate();
		return installed;
	}

	const assistantPrototype = AssistantMessageComponent.prototype;
	const state: PatchState = {
		assistants: new Set(),
		assistantSnapshots: new WeakMap(),
		currentTools: [],
		enabled: true,
		expanded: new WeakMap(),
		hiddenTools: new WeakSet(),
		originalAssistantUpdate: assistantPrototype.updateContent,
		originalSetExpanded: toolPrototype.setExpanded,
		originalToolRender: toolPrototype.render,
		textSeen: new WeakSet(),
		tools: new Set(),
	};

	assistantPrototype.updateContent = function updateAssistantContent(
		message: AssistantMessage,
		isStreaming?: boolean,
	): void {
		if (!state.enabled) {
			state.originalAssistantUpdate.call(this, message, isStreaming);
			return;
		}

		const existing = state.assistantSnapshots.get(this);
		const isInternalRerender = existing?.rendered === message;
		const source = isInternalRerender && existing ? existing.message : message;
		const snapshot: AssistantSnapshot = {
			message: source,
			rendered: source,
			isStreaming: isStreaming ?? existing?.isStreaming ?? false,
		};
		state.assistants.add(this);
		state.assistantSnapshots.set(this, snapshot);

		if (!isInternalRerender && hasText(source) && !state.textSeen.has(this)) {
			state.textSeen.add(this);
			closeToolInterval(state);
		}

		if (!isInternalRerender && hasThinking(source) && state.latestThinking !== this) {
			const previous = state.latestThinking;
			state.latestThinking = this;
			if (previous) renderAssistant(state, previous, false);
		}

		renderAssistant(state, this, state.latestThinking === this);
	};

	toolPrototype.setExpanded = function setToolExpanded(expanded: boolean): void {
		const isNew = !state.expanded.has(this);
		state.expanded.set(this, expanded);
		state.originalSetExpanded.call(this, expanded);

		if (state.enabled && isNew) {
			state.tools.add(this);
			state.currentTools.push(this);
			const previous = state.latestTool;
			state.latestTool = this;
			previous?.invalidate();
			this.invalidate();
		}
	};
	toolPrototype.render = function renderToolExecution(width: number): string[] {
		const rendered = state.originalToolRender.call(this, width);
		if (state.enabled && state.expanded.get(this) !== true) {
			if (state.hiddenTools.has(this)) return [];
			if (state.latestTool === this) return rendered;
			return compactToolRender(rendered);
		}
		return rendered;
	};

	toolPrototype[patchStateKey] = state;
	return state;
}

export default function toolCallVisibility(pi: ExtensionAPI): void {
	const patchState = installRenderPatch();

	pi.on("session_start", (_event, context) => {
		if (context.mode === "tui") context.ui.setToolsExpanded(false);
	});
	pi.on("session_shutdown", (event) => {
		disablePatch(patchState, event.reason === "reload");
	});

	pi.registerCommand("tool-calls", {
		description: "Show all tool calls or restore compact history: /tool-calls [show|hide]",
		handler: async (args, context) => {
			const action = args.trim().toLowerCase();
			if (action !== "" && action !== "show" && action !== "hide") {
				context.ui.notify("Usage: /tool-calls [show|hide]", "error");
				return;
			}

			const expanded = action === "show" || (action === "" && !context.ui.getToolsExpanded());
			context.ui.setToolsExpanded(expanded);
			context.ui.notify(
				expanded ? "All tool calls expanded" : "Restored compact tool history",
				"info",
			);
		},
	});
}
