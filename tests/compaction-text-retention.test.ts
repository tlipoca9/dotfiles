import assert from "node:assert/strict";
import test from "node:test";

import {
	buildContextEntries,
	type SessionEntry,
} from "@earendil-works/pi-coding-agent";

import compactionTextRetention, {
	retainRecentTextRounds,
} from "../home/dot_pi/private_agent/extensions/compaction-text-retention.ts";

let sequence = 0;

function entry(
	type: "user" | "assistant" | "toolResult",
	content: unknown,
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
				toolCallId: `tool-${sequence}`,
				toolName: "read",
				content: [{ type: "text", text: String(content) }],
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

function toolResult(text: string): SessionEntry {
	return entry("toolResult", text);
}

function scenario(): SessionEntry[] {
	sequence = 0;
	return [
		user("first request"),
		assistant({ type: "text", text: "round one" }),
		assistant({ type: "toolCall", id: "tool-1", name: "read", arguments: {} }),
		toolResult("first result"),
		assistant({ type: "text", text: "round two" }),
		user("second request"),
		assistant({ type: "text", text: "round three" }),
		assistant({ type: "toolCall", id: "tool-2", name: "read", arguments: {} }),
		toolResult("second result"),
		assistant({ type: "text", text: "round four" }),
		assistant({ type: "toolCall", id: "tool-3", name: "read", arguments: {} }),
		toolResult("trailing result"),
		user("trailing user information"),
	];
}

test("expands the compaction suffix to three text rounds and all trailing entries", () => {
	const entries = scenario();
	const expandedBoundary = retainRecentTextRounds(entries, entries[9]!.id);

	assert.equal(expandedBoundary, entries[2]!.id);

	const compaction: SessionEntry = {
		type: "compaction",
		id: "compaction",
		parentId: entries.at(-1)!.id,
		timestamp: new Date(99_000).toISOString(),
		summary: "memory summary",
		firstKeptEntryId: expandedBoundary,
		tokensBefore: 100_000,
	};
	const contextEntries = buildContextEntries([...entries, compaction]);

	assert.deepEqual(
		contextEntries.map((item) => item.id),
		["compaction", ...entries.slice(2).map((item) => item.id)],
	);
	assert.deepEqual(
		contextEntries
			.filter((item) => item.type === "message" && item.message.role === "assistant")
			.flatMap((item) =>
				item.type === "message" && item.message.role === "assistant"
					? item.message.content.flatMap((content) =>
							content.type === "text" ? [content.text] : [],
						)
					: [],
			),
		["round two", "round three", "round four"],
	);
	assert.deepEqual(
		contextEntries.slice(-3).map((item) => item.id),
		entries.slice(-3).map((item) => item.id),
	);
});

test("keeps an earlier token boundary and all available rounds", () => {
	const entries = scenario();
	assert.equal(
		retainRecentTextRounds(entries, entries[0]!.id),
		entries[0]!.id,
	);

	const shortEntries = entries.slice(5);
	assert.equal(
		retainRecentTextRounds(shortEntries, shortEntries.at(-1)!.id),
		shortEntries[0]!.id,
	);
});

test("updates the shared preparation before the later compaction provider runs", () => {
	const handlers: Array<(event: any) => unknown> = [];
	compactionTextRetention({
		on(name: string, handler: (event: any) => unknown) {
			assert.equal(name, "session_before_compact");
			handlers.push(handler);
		},
	} as never);

	const entries = scenario();
	const event = {
		branchEntries: entries,
		preparation: { firstKeptEntryId: entries[9]!.id },
	};
	handlers[0]!(event);

	assert.equal(event.preparation.firstKeptEntryId, entries[2]!.id);
});
