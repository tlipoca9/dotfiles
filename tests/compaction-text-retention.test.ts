import assert from "node:assert/strict";
import test from "node:test";

import {
	buildSessionContext,
	type SessionEntry,
} from "@earendil-works/pi-coding-agent";

import compactionTextRetention, {
	selectCompactedContext,
} from "../home/dot_pi/private_agent/extensions/compaction-text-retention.ts";
import {
	buildObservationalMemoryCompaction,
} from "../home/dot_pi/private_agent/extensions/lib/observational-memory-compaction.ts";

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
	assert.doesNotMatch(text, /first request|first result|tool-1/);
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
	compactionTextRetention({
		on(name: string, candidate: (event: any, context: any) => unknown) {
			handlers.set(name, candidate);
		},
		registerTool(tool: { name: string }) {
			tools.push(tool.name);
		},
	} as never);
	const handler = handlers.get("context");
	assert.ok(handler);
	assert.ok(handlers.has("session_before_compact"));
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

test("creates Pi compaction with a handoff summary from gpt-5.6-sol at high reasoning", async () => {
	const handlers = new Map<string, (event: any, context: any) => unknown>();
	compactionTextRetention({
		on(name: string, candidate: (event: any, context: any) => unknown) {
			handlers.set(name, candidate);
		},
		registerTool() {},
	} as never);
	const handler = handlers.get("session_before_compact");
	assert.ok(handler);

	const previousHistory = scenario();
	const entries = withCompaction(previousHistory, previousHistory.length - 1);
	const postCompactionUser = user("post-compaction request");
	postCompactionUser.parentId = "compaction";
	entries.push(
		postCompactionUser,
		assistant({ type: "text", text: `post-compaction old round ${"x".repeat(12_000)}` }),
		user("post-compaction boundary one"),
		assistant({ type: "text", text: "post-compaction recent one" }),
		user("post-compaction boundary two"),
		assistant({ type: "text", text: "post-compaction recent two" }),
		user("post-compaction boundary three"),
		assistant({ type: "text", text: "post-compaction recent three" }),
	);
	const model = {
		provider: "openai-codex",
		api: "openai-codex-responses",
		id: "gpt-5.6-sol",
		name: "GPT-5.6 Sol",
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 400_000,
		maxTokens: 32_000,
	};
	const summary = [
		"# Handoff",
		"## Objective",
		"Continue the task.",
	].join("\n");
	let request: any;
	let options: any;
	const usage = {
		input: 100,
		output: 20,
		cacheRead: 0,
		cacheWrite: 0,
		totalTokens: 120,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
	};
	const result = await handler(
		{
			branchEntries: entries,
			preparation: {
				firstKeptEntryId: entries[0]!.id,
				tokensBefore: 123_456,
			},
			customInstructions: "focus on rollout",
			signal: new AbortController().signal,
		},
		{
			modelRegistry: {
				find(provider: string, id: string) {
					assert.equal(provider, "openai-codex");
					assert.equal(id, "gpt-5.6-sol");
					return model;
				},
				async complete(selectedModel: unknown, selectedRequest: unknown, selectedOptions: unknown) {
					assert.equal(selectedModel, model);
					request = selectedRequest;
					options = selectedOptions;
					return {
						role: "assistant",
						content: [{ type: "text", text: summary }],
						provider: "openai-codex",
						api: "openai-codex-responses",
						model: "gpt-5.6-sol",
						stopReason: "stop",
						usage,
						timestamp: Date.now(),
					};
				},
			},
			ui: { notify() {} },
		},
	) as any;

	assert.equal(result.compaction.summary, summary);
	assert.equal(result.compaction.firstKeptEntryId, entries.at(-1)!.id);
	assert.equal(result.compaction.tokensBefore, 123_456);
	assert.equal(result.compaction.usage, usage);
	assert.equal(options.reasoning, "high");
	assert.equal(options.cacheRetention, "none");
	assert.equal(options.maxTokens, 16_000);
	assert.ok(options.signal instanceof AbortSignal);
	assert.match(request.systemPrompt, /compact handoff document/);
	assert.match(request.systemPrompt, /Redact secrets/);
	assert.doesNotMatch(request.systemPrompt, /Suggested skills|available skills/i);
	assert.doesNotMatch(request.systemPrompt, /## Pitfalls/);
	assert.match(request.systemPrompt, /Do not add a Pitfalls/);
	assert.match(request.messages[0].content[0].text, /memory summary/);
	assert.doesNotMatch(request.messages[0].content[0].text, /Available Skills|available_skills/);
	assert.match(request.messages[0].content[0].text, /post-compaction old round/);
	assert.doesNotMatch(request.messages[0].content[0].text, /first request/);
	assert.match(request.messages[0].content[0].text, /## Compaction Focus\n\nfocus on rollout/);
});

test("merges observational-memory into the handoff and preserves folded details", async () => {
	sequence = 0;
	const source = user("remember the selected architecture");
	const observationId = "aaaaaaaaaaaa";
	const reflectionId = "bbbbbbbbbbbb";
	const observationEntry = {
		type: "custom",
		id: "om-observation",
		parentId: source.id,
		timestamp: new Date(2_000).toISOString(),
		customType: "om.observations.recorded",
		data: {
			coversUpToId: source.id,
			observations: [{
				id: observationId,
				content: "User selected architecture A.",
				timestamp: "2026-08-31 20:00",
				relevance: "high",
				sourceEntryIds: [source.id],
				tokenCount: 8,
			}],
		},
	} as SessionEntry;
	const reflectionEntry = {
		type: "custom",
		id: "om-reflection",
		parentId: observationEntry.id,
		timestamp: new Date(3_000).toISOString(),
		customType: "om.reflections.recorded",
		data: {
			coversUpToId: source.id,
			reflections: [{
				id: reflectionId,
				content: "Architecture A is the durable project choice.",
				supportingObservationIds: [observationId],
				tokenCount: 9,
			}],
		},
	} as SessionEntry;
	const previousFold = {
		type: "compaction",
		id: "om-full-fold",
		parentId: reflectionEntry.id,
		timestamp: new Date(4_000).toISOString(),
		summary: "old OM summary",
		firstKeptEntryId: source.id,
		tokensBefore: 10,
		details: {
			type: "om.folded",
			version: 1,
			fullFold: true,
			observations: [],
			reflections: [],
		},
	} as SessionEntry;
	const entries = [source, observationEntry, reflectionEntry, previousFold];

	const projected = buildObservationalMemoryCompaction(entries, source.id, 20_000);
	assert.match(projected.summary, new RegExp(`\\[${reflectionId}\\].*Architecture A`));
	assert.match(projected.summary, new RegExp(`\\[${observationId}\\].*\\[high\\]`));

	const handlers = new Map<string, (event: any, context: any) => unknown>();
	compactionTextRetention({
		on(name: string, candidate: (event: any, context: any) => unknown) {
			handlers.set(name, candidate);
		},
		registerTool() {},
	} as never);
	const handler = handlers.get("session_before_compact");
	assert.ok(handler);
	let modelInput = "";
	const result = await handler(
		{
			branchEntries: entries,
			preparation: { firstKeptEntryId: source.id, tokensBefore: 100 },
			signal: new AbortController().signal,
		},
		{
			cwd: "/nonexistent-project",
			modelRegistry: {
				find: () => ({
					provider: "openai-codex",
					api: "openai-codex-responses",
					id: "gpt-5.6-sol",
					name: "GPT-5.6 Sol",
					input: ["text"],
					cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
					contextWindow: 400_000,
					maxTokens: 32_000,
				}),
				complete: async (_model: unknown, request: any) => {
					modelInput = request.messages[0].content[0].text;
					return {
						content: [{ type: "text", text: "# Handoff\n\n## Objective\nContinue." }],
						stopReason: "stop",
						usage: { totalTokens: 1 },
					};
				},
			},
			ui: { notify() {} },
		},
	) as any;

	assert.match(modelInput, /## Observational Memory/);
	assert.match(modelInput, new RegExp(observationId));
	assert.match(result.compaction.summary, /# Handoff/);
	assert.match(result.compaction.summary, /# Observational Memory/);
	assert.doesNotMatch(result.compaction.summary, /Suggested skills/);
	assert.match(result.compaction.summary, new RegExp(reflectionId));
	assert.equal(result.compaction.details.type, "om.folded");
	assert.deepEqual(result.compaction.details.observations, projected.details.observations);
	assert.deepEqual(result.compaction.details.reflections, projected.details.reflections);
});

test("cancels compaction instead of falling back to Pi's summary", async () => {
	const handlers = new Map<string, (event: any, context: any) => unknown>();
	compactionTextRetention({
		on(name: string, candidate: (event: any, context: any) => unknown) {
			handlers.set(name, candidate);
		},
		registerTool() {},
	} as never);
	const handler = handlers.get("session_before_compact");
	assert.ok(handler);

	const notices: string[] = [];
	const result = await handler(
		{
			branchEntries: scenario(),
			preparation: { firstKeptEntryId: "entry-1", tokensBefore: 100 },
			signal: new AbortController().signal,
		},
		{
			modelRegistry: { find: () => undefined },
			ui: { notify: (message: string) => notices.push(message) },
		},
	) as any;

	assert.deepEqual(result, { cancel: true });
	assert.match(notices.join("\n"), /default summary was not used/);

	const failedResult = await handler(
		{
			branchEntries: scenario(),
			preparation: { firstKeptEntryId: "entry-1", tokensBefore: 100 },
			signal: new AbortController().signal,
		},
		{
			modelRegistry: {
				find: () => ({
					provider: "openai-codex",
					api: "openai-codex-responses",
					id: "gpt-5.6-sol",
					name: "GPT-5.6 Sol",
					input: ["text"],
					cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
					contextWindow: 400_000,
					maxTokens: 32_000,
				}),
				complete: async () => {
					throw new Error("provider unavailable");
				},
			},
			ui: { notify: (message: string) => notices.push(message) },
		},
	) as any;

	assert.deepEqual(failedResult, { cancel: true });
	assert.match(notices.join("\n"), /provider unavailable/);
});
