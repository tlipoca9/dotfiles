import assert from "node:assert/strict";
import test from "node:test";

import {
	buildSessionContext,
	type SessionEntry,
} from "@earendil-works/pi-coding-agent";

import observationalMemoryExtra, {
	selectCompactedContext,
} from "../home/dot_pi/private_agent/extensions/observational-memory-extra.ts";

let sequence = 0;

function entry(
	type: "user" | "assistant" | "toolResult",
	content: unknown,
	toolCallId?: string,
): SessionEntry {
	sequence += 1;
	const id = `entry-${sequence}`;
	const parentId = sequence === 1 ? null : `entry-${sequence - 1}`;
	const timestamp = new Date(sequence * 1000).toISOString();

	if (type === "toolResult") {
		return {
			type: "message",
			id,
			parentId,
			timestamp,
			message: {
				role: "toolResult",
				toolCallId: toolCallId ?? `tool-${sequence}`,
				toolName: "read",
				content: [{ type: "text", text: String(content) }],
				isError: false,
				timestamp: sequence * 1000,
			},
		} as SessionEntry;
	}

	return {
		type: "message",
		id,
		parentId,
		timestamp,
		message: {
			role: type,
			content,
			timestamp: sequence * 1000,
			...(type === "assistant"
				? {
						provider: "test",
						model: "test",
						stopReason: "stop",
						usage: {
							input: 0,
							output: 0,
							cacheRead: 0,
							cacheWrite: 0,
							totalTokens: 0,
							cost: {
								input: 0,
								output: 0,
								cacheRead: 0,
								cacheWrite: 0,
								total: 0,
							},
						},
					}
				: {}),
		},
	} as SessionEntry;
}

function user(text: string): SessionEntry {
	return entry("user", [{ type: "text", text }]);
}

function assistant(...content: unknown[]): SessionEntry {
	return entry("assistant", content);
}

function toolResult(id: string, text: string): SessionEntry {
	return entry("toolResult", text, id);
}

function scenario(): SessionEntry[] {
	sequence = 0;
	const entries = [
		user("first request"),
		assistant({ type: "text", text: "round one" }),
		assistant({ type: "toolCall", id: "tool-1", name: "read", arguments: {} }),
		toolResult("tool-1", "first result"),
		assistant({ type: "text", text: "round two" }),
		user("second request"),
		assistant({ type: "text", text: "round three" }),
		assistant({ type: "toolCall", id: "tool-2", name: "read", arguments: {} }),
		toolResult("tool-2", "second result"),
		assistant({ type: "text", text: "round four" }),
	];
	for (let index = 3; index <= 9; index++) {
		entries.push(
			assistant({
				type: "toolCall",
				id: `tool-${index}`,
				name: "read",
				arguments: { path: `file-${index}.txt` },
			}),
			toolResult(`tool-${index}`, `trailing result ${index}`),
		);
	}
	entries.push(user("trailing user information"));
	return entries;
}

function withCompaction(entries: SessionEntry[], firstKeptIndex: number): SessionEntry[] {
	return [
		...entries,
		{
			type: "compaction",
			id: "compaction",
			parentId: entries.at(-1)!.id,
			timestamp: new Date(99_000).toISOString(),
			summary: "memory summary",
			firstKeptEntryId: entries[firstKeptIndex]!.id,
			tokensBefore: 100_000,
		} as SessionEntry,
	];
}

function visibleText(messages: readonly any[]): string {
	return messages.map((message) => {
		if (message.role === "custom") return message.content;
		if (message.role === "compactionSummary") return message.summary;
		if (typeof message.content === "string") return message.content;
		return message.content?.map((content: any) =>
			content.type === "text" ? content.text : content.type === "toolCall" ? content.id : "",
		).join("\n") ?? "";
	}).join("\n");
}

test("projects compacted context without Pi's raw token suffix", () => {
	const history = scenario();
	const entries = withCompaction(history, 2);
	const base = buildSessionContext(entries).messages;
	const selected = selectCompactedContext(entries, base);

	assert.equal(selected[0]?.role, "compactionSummary");
	assert.equal(selected[1]?.role, "custom");

	const text = visibleText(selected);
	assert.match(text, /first request/);
	assert.doesNotMatch(text, /first result|tool-1/);
	assert.match(text, /round one/);
	assert.match(text, /round two/);
	assert.match(text, /second request/);
	assert.match(text, /round three/);
	assert.doesNotMatch(text, /second result|tool-2/);
	assert.match(text, /round four/);
	assert.match(text, /read\(path="file-3\.txt"\)/);
	assert.match(text, /read\(path="file-4\.txt"\)/);
	assert.doesNotMatch(text, /trailing result 3|trailing result 4/);
	assert.match(text, /tool-5|file-5\.txt/);
	assert.match(text, /trailing result 5/);
	assert.match(text, /trailing result 9/);
	assert.match(text, /trailing user information/);

	const retainedToolCalls = selected.flatMap((message) =>
		message.role === "assistant"
			? message.content.flatMap((content) =>
					content.type === "toolCall" ? [content.id] : [],
				)
			: [],
	);
	assert.deepEqual(retainedToolCalls, ["tool-5", "tool-6", "tool-7", "tool-8", "tool-9"]);
	assert.deepEqual(
		selected.flatMap((message) => message.role === "toolResult" ? [message.toolCallId] : []),
		retainedToolCalls,
	);
	assert.ok(selected.length < base.length);
});

test("expands beyond three text rounds while the retained transcript fits 2k tokens", () => {
	const history = scenario();
	const entries = withCompaction(history, 0);
	const text = visibleText(selectCompactedContext(entries, buildSessionContext(entries).messages));

	assert.match(text, /round one/);
	assert.match(text, /round two/);
	assert.match(text, /round three/);
	assert.match(text, /round four/);
});

test("keeps three text rounds even when adding an older round would exceed 2k tokens", () => {
	sequence = 0;
	const history = [
		assistant({ type: "text", text: `old-${"x".repeat(12_000)}` }),
		user("boundary one"),
		assistant({ type: "text", text: "recent one" }),
		user("boundary two"),
		assistant({ type: "text", text: "recent two" }),
		user("boundary three"),
		assistant({ type: "text", text: "recent three" }),
	];
	const entries = withCompaction(history, 0);
	const text = visibleText(selectCompactedContext(entries, buildSessionContext(entries).messages));

	assert.doesNotMatch(text, /old-/);
	assert.match(text, /recent one/);
	assert.match(text, /recent two/);
	assert.match(text, /recent three/);
});

test("treats consecutive and interleaved user messages and tool calls as boundaries without empty text rounds", () => {
	sequence = 0;
	const history = [
		assistant({ type: "text", text: `discarded-${"x".repeat(12_000)}` }),
		user("start recent rounds"),
		assistant({ type: "text", text: "recent one" }),
		user("first consecutive user message"),
		user("second consecutive user message"),
		assistant({ type: "text", text: "recent two" }),
		assistant({ type: "toolCall", id: "older-tool-a", name: "read", arguments: { path: "a" } }),
		toolResult("older-tool-a", "older result a"),
		user("first interleaved user message"),
		assistant(
			{ type: "toolCall", id: "older-tool-b", name: "read", arguments: { path: "b" } },
			{ type: "toolCall", id: "older-tool-c", name: "read", arguments: { path: "c" } },
		),
		toolResult("older-tool-b", "older result b"),
		toolResult("older-tool-c", "older result c"),
		user("second interleaved user message"),
		assistant({ type: "text", text: "recent three" }),
	];
	const entries = withCompaction(history, 0);
	const text = visibleText(selectCompactedContext(entries, buildSessionContext(entries).messages));

	assert.doesNotMatch(text, /discarded-/);
	assert.match(text, /start recent rounds/);
	assert.match(text, /recent one/);
	assert.match(text, /first consecutive user message/);
	assert.match(text, /second consecutive user message/);
	assert.match(text, /recent two/);
	assert.match(text, /first interleaved user message/);
	assert.match(text, /second interleaved user message/);
	assert.doesNotMatch(text, /older-tool-[abc]|older result [abc]/);
	assert.match(text, /recent three/);
});

test("ignores the compaction first-kept boundary instead of retaining its 20k window", () => {
	const history = scenario();
	const earlyBoundary = withCompaction(history, 0);
	const lateBoundary = withCompaction(history, 9);
	const earlySelected = selectCompactedContext(
		earlyBoundary,
		buildSessionContext(earlyBoundary).messages,
	);
	const lateSelected = selectCompactedContext(
		lateBoundary,
		buildSessionContext(lateBoundary).messages,
	);

	assert.deepEqual(earlySelected, lateSelected);
});

test("leaves uncompacted context unchanged", () => {
	const entries = scenario();
	const messages = buildSessionContext(entries).messages;
	assert.deepEqual(selectCompactedContext(entries, messages), messages);
});

test("keeps the latest tool call and result complete without a detail budget", () => {
	sequence = 0;
	const history = [
		user("request"),
		assistant({ type: "text", text: "round one" }),
		assistant({ type: "toolCall", id: "huge-tool", name: "read", arguments: { path: "large.log" } }),
		toolResult("huge-tool", `head-${"x".repeat(30_000)}-tail`),
	];
	const entries = withCompaction(history, 0);
	const selected = selectCompactedContext(
		entries,
		buildSessionContext(entries).messages,
		3,
		5,
	);
	const text = visibleText(selected);
	assert.match(text, /head-/);
	assert.match(text, /-tail/);
	assert.doesNotMatch(text, /omitted by compaction/);
});

test("context hook projects from the live branch", () => {
	const handlers = new Map<string, (event: any, context: any) => unknown>();
	const tools: string[] = [];
	observationalMemoryExtra({
		on(name: string, candidate: (event: any, context: any) => unknown) {
			handlers.set(name, candidate);
		},
		registerTool(tool: { name: string }) {
			tools.push(tool.name);
		},
	} as never);
	const handler = handlers.get("context");
	assert.ok(handler);
	assert.equal(handlers.has("session_before_compact"), false);
	assert.deepEqual(tools, ["history_search", "history_recall"]);

	const history = scenario();
	const entries = withCompaction(history, 0);
	const result = handler(
		{ messages: buildSessionContext(entries).messages },
		{ sessionManager: { getBranch: () => entries } },
	) as { messages: readonly any[] };
	const text = visibleText(result.messages);

	assert.doesNotMatch(text, /first result|second result|trailing result 3|trailing result 4/);
	assert.match(text, /trailing result 5|trailing result 9/);
});
