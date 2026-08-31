import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { ToolExecutionComponent } from "@earendil-works/pi-coding-agent";
import { stripTerminalSequences } from "@earendil-works/pi-tui";

const patchStateKey = Symbol.for("tlipoca9.pi.compact-tool-history.v3");

type SetToolExpanded = typeof ToolExecutionComponent.prototype.setExpanded;
type ToolRender = typeof ToolExecutionComponent.prototype.render;

interface PatchState {
	active: boolean;
	enabled: boolean;
	expanded: WeakMap<ToolExecutionComponent, boolean>;
	latestTool?: ToolExecutionComponent;
	originalSetExpanded: SetToolExpanded;
	originalToolRender: ToolRender;
}

type ToolExecutionPrototype = typeof ToolExecutionComponent.prototype & {
	[key: symbol]: PatchState | undefined;
};

function compactToolRender(lines: string[]): string[] {
	const summary = lines.find(
		(line) => stripTerminalSequences(line).trim() !== "",
	);
	return summary ? [summary] : [];
}

function clearProgress(state: PatchState): void {
	state.active = false;

	const latestTool = state.latestTool;
	state.latestTool = undefined;
	latestTool?.invalidate();
}

function disablePatch(state: PatchState): void {
	state.enabled = false;
	state.active = false;
	state.latestTool?.invalidate();
	state.latestTool = undefined;
}

function installRenderPatch(): PatchState {
	const toolPrototype = ToolExecutionComponent.prototype as ToolExecutionPrototype;
	const installed = toolPrototype[patchStateKey];
	if (installed) {
		installed.enabled = true;
		installed.active = false;
		return installed;
	}

	const state: PatchState = {
		active: false,
		enabled: true,
		expanded: new WeakMap(),
		originalSetExpanded: toolPrototype.setExpanded,
		originalToolRender: toolPrototype.render,
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
		const rendered = state.originalToolRender.call(this, width);
		if (
			state.enabled &&
			state.expanded.get(this) !== true &&
			(!state.active || state.latestTool !== this)
		) {
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
	pi.on("agent_start", () => {
		clearProgress(patchState);
		patchState.active = true;
	});
	pi.on("agent_end", () => {
		clearProgress(patchState);
	});
	pi.on("session_shutdown", () => {
		disablePatch(patchState);
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
