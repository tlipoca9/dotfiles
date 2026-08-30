import assert from "node:assert/strict";
import test from "node:test";

import { type KeyId, matchesKey, stripTerminalSequences } from "@earendil-works/pi-tui";

import { Dashboard } from "../home/dot_pi/private_agent/extensions/dashboard.ts";
import {
	buildSessionBrowserItems,
	type SessionBrowserRecord,
} from "../home/dot_pi/private_agent/session-browser-core.ts";

const keyMap: Record<string, readonly KeyId[]> = {
	"tui.input.submit": ["enter"],
	"tui.input.tab": ["tab"],
	"tui.select.cancel": ["escape", "ctrl+c"],
	"tui.select.confirm": ["enter"],
	"tui.select.up": ["up"],
	"tui.select.down": ["down"],
	"tui.select.pageUp": ["pageUp"],
	"tui.select.pageDown": ["pageDown"],
};

function record(id: string, cwd: string, modified: number): SessionBrowserRecord {
	return {
		id,
		path: `/sessions/${id}.jsonl`,
		cwd,
		modified,
		messageCount: 4,
		firstMessage: `Work ${id}`,
		recentUserText: [`Work ${id}`],
		workspaceExists: true,
	};
}

function harness(columns: number, records?: readonly SessionBrowserRecord[]): {
	dashboard: Dashboard;
	results: Array<{ sessionPath: string } | undefined>;
	frame: () => string;
} {
	const terminal = { columns, rows: 62 };
	const tui = { terminal, requestRender() {} };
	const theme = {
		fg: (_color: string, value: string) => value,
		bg: (_color: string, value: string) => `\u001b[48;5;238m${value}\u001b[0m`,
		bold: (value: string) => value,
	};
	const keybindings = {
		matches(data: string, binding: string) {
			return (keyMap[binding] ?? []).some((key) => matchesKey(data, key));
		},
	};
	const results: Array<{ sessionPath: string } | undefined> = [];
	const items = buildSessionBrowserItems(
		records ?? [
			record("alpha", "/code/acme/alpha", 3_000),
			record("beta", "/code/acme/beta", 2_000),
			record("gamma", "/code/tools/gamma", 1_000),
		],
	);
	const dashboard = new Dashboard(
		tui as never,
		theme as never,
		keybindings as never,
		(result) => results.push(result),
		items,
	);
	return {
		dashboard,
		results,
		frame: () => stripTerminalSequences(dashboard.render(columns).join("\n")),
	};
}

test("Vim j/k and Kitty CSI-u move the work selection without changing arrow behavior", () => {
	for (const width of [244, 120]) {
		const literal = harness(width);
		literal.dashboard.handleInput("j");
		literal.dashboard.handleInput("j");
		literal.dashboard.handleInput("k");
		literal.dashboard.handleInput("\r");
		assert.deepEqual(literal.results, [{ sessionPath: "/sessions/beta.jsonl" }]);
	}

	const kitty = harness(120);
	kitty.dashboard.handleInput("\u001b[106;1u");
	kitty.dashboard.handleInput("\r");
	assert.deepEqual(kitty.results, [{ sessionPath: "/sessions/beta.jsonl" }]);

	const arrow = harness(120);
	arrow.dashboard.handleInput("\u001b[B");
	arrow.dashboard.handleInput("\r");
	assert.deepEqual(arrow.results, [{ sessionPath: "/sessions/beta.jsonl" }]);
});

test("Vim h/l move focus between workspace navigation and work", () => {
	for (const width of [244, 120]) {
		const { dashboard, results } = harness(width);
		dashboard.handleInput("h");
		dashboard.handleInput("j");
		dashboard.handleInput("j");
		dashboard.handleInput("l");
		dashboard.handleInput("\r");
		assert.deepEqual(results, [{ sessionPath: "/sessions/beta.jsonl" }]);
	}
});

test("narrow Dashboard uses l or Enter for detail and h to return to the list", () => {
	const vim = harness(80);
	vim.dashboard.handleInput("l");
	assert.match(vim.frame(), /WORK ·/);
	assert.deepEqual(vim.results, []);
	vim.dashboard.handleInput("h");
	assert.doesNotMatch(vim.frame(), /WORK ·/);

	const enter = harness(80);
	enter.dashboard.handleInput("\r");
	assert.match(enter.frame(), /WORK ·/);
	assert.deepEqual(enter.results, []);
});

test("search editor owns h/j/k/l instead of triggering Vim navigation", () => {
	const { dashboard, frame, results } = harness(120);
	dashboard.handleInput("/");
	for (const key of "hjkl") dashboard.handleInput(key);
	assert.match(frame(), /hjkl/);
	dashboard.handleInput("\r");
	assert.deepEqual(results, []);
});

test("narrow l keeps empty and no-match Dashboard states visible", () => {
	const empty = harness(80, []);
	empty.dashboard.handleInput("l");
	assert.match(empty.frame(), /No recent work/);

	const noMatch = harness(80);
	noMatch.dashboard.handleInput("/");
	for (const key of "no-such-work") noMatch.dashboard.handleInput(key);
	noMatch.dashboard.handleInput("\r");
	noMatch.dashboard.handleInput("l");
	assert.match(noMatch.frame(), /No matches/);
});
