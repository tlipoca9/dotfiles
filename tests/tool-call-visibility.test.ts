import assert from "node:assert/strict";
import test from "node:test";

import {
	AssistantMessageComponent,
	initTheme,
	ToolExecutionComponent,
} from "@earendil-works/pi-coding-agent";

import toolCallVisibility from "../home/dot_pi/private_agent/extensions/tool-call-visibility.ts";

type Handler = (...args: any[]) => unknown;

function extensionHarness() {
	const events = new Map<string, Handler>();
	let command: { handler: Handler } | undefined;
	const api = {
		on(name: string, handler: Handler) {
			events.set(name, handler);
		},
		registerCommand(name: string, value: { handler: Handler }) {
			assert.equal(name, "tool-calls");
			command = value;
		},
	};
	toolCallVisibility(api as never);
	return {
		command: () => {
			assert.ok(command);
			return command;
		},
		event: (name: string) => {
			const handler = events.get(name);
			assert.ok(handler, `missing ${name} handler`);
			return handler;
		},
	};
}

function tool(name: string): ToolExecutionComponent {
	const component = new ToolExecutionComponent(
		name,
		`${name}-id`,
		{ value: name },
		{},
		undefined,
		{ requestRender() {} } as never,
		process.cwd(),
	);
	component.updateResult({
		content: [{ type: "text", text: `${name}-result` }],
		isError: false,
	});
	component.setExpanded(false);
	return component;
}

test("tool visibility preserves thinking and compacts completed tool history", async () => {
	initTheme("dark", false);
	const originalSetExpanded = ToolExecutionComponent.prototype.setExpanded;
	const first = extensionHarness();
	const patchedSetExpanded = ToolExecutionComponent.prototype.setExpanded;
	assert.notEqual(patchedSetExpanded, originalSetExpanded);

	const expanded: boolean[] = [];
	const notifications: Array<[string, string]> = [];
	let toolsExpanded = false;
	const commandContext = {
		ui: {
			getToolsExpanded: () => toolsExpanded,
			setToolsExpanded(value: boolean) {
				toolsExpanded = value;
				expanded.push(value);
			},
			notify(message: string, level: string) {
				notifications.push([message, level]);
			},
		},
	};
	await first.command().handler("show", commandContext);
	await first.command().handler("hide", commandContext);
	await first.command().handler("invalid", commandContext);
	assert.deepEqual(expanded, [true, false]);
	assert.deepEqual(notifications, [
		["All tool calls expanded", "info"],
		["Restored compact tool history", "info"],
		["Usage: /tool-calls [show|hide]", "error"],
	]);

	first.event("session_start")({}, {
		mode: "tui",
		ui: { setToolsExpanded: (value: boolean) => expanded.push(value) },
	});
	assert.equal(expanded.at(-1), false);

	first.event("agent_start")();
	const firstAssistant = new AssistantMessageComponent();
	firstAssistant.updateContent({
		role: "assistant",
		content: [
			{ type: "thinking", thinking: "first first-step reasoning" },
			{ type: "thinking", thinking: "second first-step reasoning" },
		],
		stopReason: "toolUse",
		timestamp: Date.now(),
	} as never, true);
	const older = tool("older_tool");

	const secondAssistant = new AssistantMessageComponent();
	secondAssistant.updateContent({
		role: "assistant",
		content: [
			{ type: "thinking", thinking: "first second-step reasoning" },
			{ type: "text", text: "visible answer" },
			{ type: "thinking", thinking: "second second-step reasoning" },
		],
		stopReason: "stop",
		timestamp: Date.now(),
	} as never, true);
	const latest = tool("latest_tool");
	assert.equal(older.render(80).length, 1);
	assert.match(older.render(80)[0] ?? "", /older_tool/);
	older.setExpanded(true);
	assert.ok(older.render(80).length > 1);
	older.setExpanded(false);
	assert.equal(older.render(80).length, 1);
	assert.ok(latest.render(80).length > 1);
	assert.match(latest.render(80).join("\n"), /latest_tool/);

	const firstStep = firstAssistant.render(80).join("\n");
	assert.match(firstStep, /first first-step reasoning/);
	assert.match(firstStep, /second first-step reasoning/);
	const secondStep = secondAssistant.render(80).join("\n");
	assert.match(secondStep, /first second-step reasoning/);
	assert.match(secondStep, /visible answer/);
	assert.match(secondStep, /second second-step reasoning/);

	first.event("agent_end")();
	assert.equal(latest.render(80).length, 1);
	assert.match(latest.render(80)[0] ?? "", /latest_tool/);
	assert.match(firstAssistant.render(80).join("\n"), /first first-step reasoning/);
	assert.match(firstAssistant.render(80).join("\n"), /second first-step reasoning/);
	assert.match(secondAssistant.render(80).join("\n"), /first second-step reasoning/);
	assert.match(secondAssistant.render(80).join("\n"), /second second-step reasoning/);

	first.event("session_shutdown")({ reason: "reload" });
	const second = extensionHarness();
	assert.equal(ToolExecutionComponent.prototype.setExpanded, patchedSetExpanded);
	second.event("agent_start")();
	const afterReload = tool("after_reload");
	assert.match(afterReload.render(80).join("\n"), /after_reload/);
	second.event("session_shutdown")({ reason: "exit" });
});
