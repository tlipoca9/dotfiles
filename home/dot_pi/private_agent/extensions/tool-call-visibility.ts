import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	AssistantMessageComponent,
	ToolExecutionComponent,
} from "@earendil-works/pi-coding-agent";

const patchStateKey = Symbol.for("tlipoca9.pi.latest-progress.v1");

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
	active: boolean;
	assistants: Set<AssistantMessageComponent>;
	assistantSnapshots: WeakMap<AssistantMessageComponent, AssistantSnapshot>;
	enabled: boolean;
	expanded: WeakMap<ToolExecutionComponent, boolean>;
	latestThinking?: AssistantMessageComponent;
	latestTool?: ToolExecutionComponent;
	originalAssistantUpdate: AssistantUpdate;
	originalSetExpanded: SetToolExpanded;
	originalToolRender: ToolRender;
}

type ToolExecutionPrototype = typeof ToolExecutionComponent.prototype & {
	[key: symbol]: PatchState | undefined;
};

function hasThinking(message: AssistantMessage): boolean {
	return message.content.some(
		(content) => content.type === "thinking" && content.thinking.trim() !== "",
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

function clearProgress(state: PatchState): void {
	state.active = false;

	const latestTool = state.latestTool;
	state.latestTool = undefined;
	latestTool?.invalidate();

	const latestThinking = state.latestThinking;
	state.latestThinking = undefined;
	if (latestThinking) renderAssistant(state, latestThinking, false);
}

function disablePatch(state: PatchState, preserveSnapshots: boolean): void {
	state.enabled = false;
	state.active = false;
	state.latestTool?.invalidate();
	state.latestTool = undefined;
	state.latestThinking = undefined;

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
	if (!preserveSnapshots) state.assistants.clear();
}

function installRenderPatch(): PatchState {
	const toolPrototype = ToolExecutionComponent.prototype as ToolExecutionPrototype;
	const installed = toolPrototype[patchStateKey];
	if (installed) {
		installed.enabled = true;
		installed.active = false;
		for (const component of installed.assistants) {
			renderAssistant(installed, component, false);
		}
		return installed;
	}

	const assistantPrototype = AssistantMessageComponent.prototype;
	const state: PatchState = {
		active: false,
		assistants: new Set(),
		assistantSnapshots: new WeakMap(),
		enabled: true,
		expanded: new WeakMap(),
		originalAssistantUpdate: assistantPrototype.updateContent,
		originalSetExpanded: toolPrototype.setExpanded,
		originalToolRender: toolPrototype.render,
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
		const source = existing && existing.rendered === message ? existing.message : message;
		const snapshot: AssistantSnapshot = {
			message: source,
			rendered: source,
			isStreaming: isStreaming ?? existing?.isStreaming ?? false,
		};
		state.assistants.add(this);
		state.assistantSnapshots.set(this, snapshot);

		if (state.active && hasThinking(source) && state.latestThinking !== this) {
			const previous = state.latestThinking;
			state.latestThinking = this;
			if (previous) renderAssistant(state, previous, false);
		}

		renderAssistant(
			state,
			this,
			state.active && state.latestThinking === this,
		);
	};

	toolPrototype.setExpanded = function setToolExpanded(expanded: boolean): void {
		const isNew = !state.expanded.has(this);
		state.expanded.set(this, expanded);
		state.originalSetExpanded.call(this, expanded);

		if (state.enabled && isNew) {
			const previous = state.latestTool;
			state.latestTool = this;
			previous?.invalidate();
			this.invalidate();
		}
	};
	toolPrototype.render = function renderToolExecution(width: number): string[] {
		if (state.enabled && (!state.active || state.latestTool !== this)) return [];
		return state.originalToolRender.call(this, width);
	};

	toolPrototype[patchStateKey] = state;
	return state;
}

export default function toolCallVisibility(pi: ExtensionAPI): void {
	const patchState = installRenderPatch();

	pi.on("session_start", (_event, context) => {
		if (context.mode === "tui") context.ui.setToolsExpanded(false);
	});
	pi.on("agent_start", () => {
		clearProgress(patchState);
		patchState.active = true;
	});
	pi.on("agent_end", () => {
		clearProgress(patchState);
	});
	pi.on("session_shutdown", (event) => {
		disablePatch(patchState, event.reason === "reload");
	});

	pi.registerCommand("tool-calls", {
		description: "Expand or collapse the latest tool call: /tool-calls [show|hide]",
		handler: async (args, context) => {
			const action = args.trim().toLowerCase();
			if (action !== "" && action !== "show" && action !== "hide") {
				context.ui.notify("Usage: /tool-calls [show|hide]", "error");
				return;
			}

			const expanded = action === "show" || (action === "" && !context.ui.getToolsExpanded());
			context.ui.setToolsExpanded(expanded);
			context.ui.notify(`Latest tool call ${expanded ? "expanded" : "collapsed"}`, "info");
		},
	});
}
