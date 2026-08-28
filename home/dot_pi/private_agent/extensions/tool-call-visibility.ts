import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { ToolExecutionComponent } from "@earendil-works/pi-coding-agent";

const patchStateKey = Symbol.for("tlipoca9.pi.tool-call-visibility");

type ToolRender = typeof ToolExecutionComponent.prototype.render;
type SetToolExpanded = typeof ToolExecutionComponent.prototype.setExpanded;

interface PatchState {
	enabled: boolean;
	expanded: WeakMap<ToolExecutionComponent, boolean>;
	originalRender: ToolRender;
	originalSetExpanded: SetToolExpanded;
}

type ToolExecutionPrototype = typeof ToolExecutionComponent.prototype & {
	[key: symbol]: PatchState | undefined;
};

function installRenderPatch(): PatchState {
	const prototype = ToolExecutionComponent.prototype as ToolExecutionPrototype;
	const installed = prototype[patchStateKey];
	if (installed) {
		installed.enabled = true;
		return installed;
	}

	const state: PatchState = {
		enabled: true,
		expanded: new WeakMap(),
		originalRender: prototype.render,
		originalSetExpanded: prototype.setExpanded,
	};

	prototype.setExpanded = function setToolExpanded(expanded: boolean): void {
		state.expanded.set(this, expanded);
		state.originalSetExpanded.call(this, expanded);
	};
	prototype.render = function renderToolExecution(width: number): string[] {
		if (state.enabled && state.expanded.get(this) !== true) return [];
		return state.originalRender.call(this, width);
	};
	prototype[patchStateKey] = state;
	return state;
}

export default function toolCallVisibility(pi: ExtensionAPI): void {
	const patchState = installRenderPatch();

	pi.on("session_start", (_event, context) => {
		if (context.mode === "tui") context.ui.setToolsExpanded(false);
	});

	// Keep the inert wrapper installed so /reload never stacks prototype patches.
	pi.on("session_shutdown", () => {
		patchState.enabled = false;
	});

	pi.registerCommand("tool-calls", {
		description: "Show or hide tool calls: /tool-calls [show|hide]",
		handler: async (args, context) => {
			const action = args.trim().toLowerCase();
			if (action !== "" && action !== "show" && action !== "hide") {
				context.ui.notify("Usage: /tool-calls [show|hide]", "error");
				return;
			}

			const expanded = action === "show" || (action === "" && !context.ui.getToolsExpanded());
			context.ui.setToolsExpanded(expanded);
			context.ui.notify(`Tool calls ${expanded ? "shown" : "hidden"}`, "info");
		},
	});
}
