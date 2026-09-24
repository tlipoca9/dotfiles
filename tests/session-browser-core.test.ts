import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import test from "node:test";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	buildSessionBrowserItems,
	cleanSessionText,
	DASHBOARD_COMMAND,
	filterSessionBrowserItems,
	readSessionBranch,
	relativeSessionTime,
	sessionBrowserLayout,
	shortestUniqueWorkspaceSuffixes,
	type SessionBrowserRecord,
} from "../home/dot_pi/private_agent/session-browser-core.ts";

const atomOneDarkTheme = JSON.parse(
	readFileSync(
		new URL("../home/dot_pi/private_agent/themes/atom-one-dark.json", import.meta.url),
		"utf8",
	),
) as {
	name: string;
	vars: Record<string, string>;
	colors: Record<string, string>;
};

function record(overrides: Partial<SessionBrowserRecord> = {}): SessionBrowserRecord {
	return {
		id: "session-1",
		path: "/sessions/session-1.jsonl",
		cwd: "/code/acme/console",
		modified: 1_000,
		messageCount: 8,
		firstMessage: "Initial request",
		recentUserText: ["Fix the session picker", "Review the workspace layout"],
		workspaceExists: true,
		...overrides,
	};
}

test("publishes Dashboard as the only named work browser entry", () => {
	assert.deepEqual(DASHBOARD_COMMAND, {
		name: "dashboard",
		description: "Browse and resume work across workspaces",
	});
});

test("uses Atom One Dark focus, selection, hierarchy, and status colors", () => {
	assert.equal(atomOneDarkTheme.name, "atom-one-dark");
	assert.deepEqual(
		{
			focus: atomOneDarkTheme.vars.focus,
			selection: atomOneDarkTheme.vars.selected,
			secondary: atomOneDarkTheme.vars.subtle,
			dim: atomOneDarkTheme.vars.dim,
			success: atomOneDarkTheme.vars.success,
			warning: atomOneDarkTheme.vars.warning,
			error: atomOneDarkTheme.vars.error,
		},
		{
			focus: "#528bff",
			selection: "#3a3f4b",
			secondary: "#828997",
			dim: "#5c6370",
			success: "#73c990",
			warning: "#e2c08d",
			error: "#ff6347",
		},
	);
	assert.equal(atomOneDarkTheme.colors.accent, "focus");
	assert.equal(atomOneDarkTheme.colors.borderAccent, "focus");
	assert.equal(atomOneDarkTheme.colors.selectedBg, "selected");
	assert.equal(atomOneDarkTheme.colors.muted, "subtle");
	assert.equal(atomOneDarkTheme.colors.dim, "dim");
});

test("uses an explicit name before recent user text and keeps a separate summary", () => {
	const [item] = buildSessionBrowserItems([
		record({ name: "Session navigation", recentUserText: ["Current request", "Earlier context"] }),
	]);
	assert.equal(item?.title, "Session navigation");
	assert.equal(item?.summary, "Current request");
});

test("falls back to recent user text without duplicating it as the summary", () => {
	const [item] = buildSessionBrowserItems([
		record({ recentUserText: ["  Investigate\nresume semantics  "] }),
	]);
	assert.equal(item?.title, "Investigate resume semantics");
	assert.equal(item?.summary, "");
});

test("removes complete ANSI and OSC sequences from session text", () => {
	assert.equal(cleanSessionText("\u001b[31mDanger\u001b[0m"), "Danger");
	assert.equal(cleanSessionText("\u001b]8;;https://example.com\u0007Link\u001b]8;;\u0007"), "Link");
});

test("search covers title, recent text, workspace name, and full cwd within the selected scope", () => {
	const items = buildSessionBrowserItems([
		record({ id: "one", cwd: "/code/acme/console", name: "Resume work", recentUserText: ["Missing cwd behavior"] }),
		record({ id: "two", cwd: "/code/tools/runner", name: "Terminal polish", recentUserText: ["Ghostty spacing"] }),
	]);
	assert.deepEqual(filterSessionBrowserItems(items, "recent", "ghostty").map((item) => item.id), ["two"]);
	assert.deepEqual(filterSessionBrowserItems(items, "recent", "console").map((item) => item.id), ["one"]);
	assert.deepEqual(filterSessionBrowserItems(items, "/code/tools/runner", "terminal").map((item) => item.id), ["two"]);
	assert.deepEqual(filterSessionBrowserItems(items, "/code/acme/console", "terminal"), []);
});

test("search indexes the visible text of ANSI-formatted recent messages", () => {
	const items = buildSessionBrowserItems([
		record({ recentUserText: ["Current title", "Earlier context", "Ghost\u001b[31mty issue"] }),
	]);
	assert.equal(filterSessionBrowserItems(items, "recent", "ghostty").length, 1);
});

test("keeps raw workspace identity while sanitizing its visible path", () => {
	const rawCwd = "/code/acme/\u001b]8;;tag\u0007console\u001b]8;;\u0007";
	const [item] = buildSessionBrowserItems([record({ cwd: rawCwd })]);
	assert.equal(item?.cwd, rawCwd);
	assert.equal(item?.displayCwd, "/code/acme/console");
	assert.equal(item?.workspaceName, "console");
	assert.equal(item?.workspaceSuffix, "…/acme/console");
});

test("reads the current JSONL branch without rewriting the session file", () => {
	const directory = mkdtempSync(join(tmpdir(), "pi-sessions-branch-"));
	const path = join(directory, "session.jsonl");
	const contents = [
		'{"type":"session","version":3,"id":"s","timestamp":"2026-01-01T00:00:00.000Z","cwd":"/tmp"}',
		'{"type":"message","id":"a","parentId":null,"message":{"role":"user","content":"root"}}',
		'{"type":"message","id":"abandoned","parentId":"a","message":{"role":"user","content":"old branch"}}',
		'{"type":"message","id":"current","parentId":"a","message":{"role":"user","content":"current branch"}}',
	].join("\n");
	writeFileSync(path, contents);
	try {
		assert.deepEqual(readSessionBranch(path).map((entry) => entry.id), ["a", "current"]);
		assert.equal(readFileSync(path, "utf8"), contents);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});

test("workspace labels use at least two path segments and expand only for collisions", () => {
	assert.deepEqual(
		shortestUniqueWorkspaceSuffixes([
			"/Users/me/code/acme/console",
			"/Users/me/work/acme/console",
			"/Users/me/code/tools/runner",
		]),
		["…/code/acme/console", "…/work/acme/console", "…/tools/runner"],
	);
});

test("responsive layouts preserve the approved 244, 120, and 80 column modes", () => {
	assert.deepEqual(sessionBrowserLayout(244), {
		shellWidth: 220,
		offset: 12,
		mode: "wide",
		browseWidth: 37,
		sessionsWidth: 183,
		detailWidth: 0,
	});
	assert.deepEqual(sessionBrowserLayout(120), {
		shellWidth: 112,
		offset: 4,
		mode: "medium",
		browseWidth: 32,
		sessionsWidth: 80,
		detailWidth: 0,
	});
	assert.deepEqual(sessionBrowserLayout(80), {
		shellWidth: 76,
		offset: 2,
		mode: "narrow",
		browseWidth: 76,
		sessionsWidth: 76,
		detailWidth: 76,
	});
});

test("relative timestamps remain compact and stable", () => {
	const now = 400 * 24 * 60 * 60 * 1_000;
	assert.equal(relativeSessionTime(now - 30_000, now), "now");
	assert.equal(relativeSessionTime(now - 5 * 60_000, now), "5m");
	assert.equal(relativeSessionTime(now - 3 * 3_600_000, now), "3h");
	assert.equal(relativeSessionTime(now - 14 * 86_400_000, now), "2w");
	assert.equal(relativeSessionTime(now - 400 * 86_400_000, now), "1y");
});
