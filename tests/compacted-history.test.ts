import assert from "node:assert/strict";
import test from "node:test";

import type { SessionEntry } from "@earendil-works/pi-coding-agent";

import {
	compactedSourceEntries,
	recallCompactedHistory,
	searchCompactedHistory,
} from "../home/dot_pi/private_agent/extensions/lib/compacted-history.ts";

function message(
	id: string,
	role: "user" | "toolResult",
	text: string,
): SessionEntry {
	return {
		type: "message",
		id,
		parentId: null,
		timestamp: new Date(Number(id.replace(/\D/g, "")) * 1000).toISOString(),
		message: role === "user"
			? { role, content: [{ type: "text", text }], timestamp: 1 }
			: {
					role,
					toolCallId: `call-${id}`,
					toolName: "bash",
					content: [{ type: "text", text }],
					isError: false,
					timestamp: 1,
				},
	} as SessionEntry;
}

function history(): SessionEntry[] {
	const first = message("entry-1", "user", "首次部署失败 TLS handshake timeout");
	const second = message("entry-2", "toolResult", "切换网络后部署成功 request-id-42");
	const compaction: SessionEntry = {
		type: "compaction",
		id: "compaction",
		parentId: second.id,
		timestamp: new Date(3_000).toISOString(),
		summary: "deployment memory",
		firstKeptEntryId: second.id,
		tokensBefore: 10_000,
	};
	return [
		first,
		second,
		compaction,
		message("entry-4", "user", "压缩后新消息不应被历史搜索命中"),
	];
}

test("searches only original entries before the latest compaction", () => {
	const entries = history();
	assert.deepEqual(compactedSourceEntries(entries).map((entry) => entry.id), ["entry-1", "entry-2"]);

	const matches = searchCompactedHistory(entries, "部署 成功");
	assert.equal(matches.length, 1);
	assert.equal(matches[0]?.id, "entry-2");
	assert.match(matches[0]?.snippet ?? "", /request-id-42/);
	assert.deepEqual(searchCompactedHistory(entries, "压缩后新消息"), []);
});

test("recalls exact stored JSON in bounded, resumable pages", () => {
	const first = recallCompactedHistory(history(), "entry-2", 0, 80);

	assert.equal(first.found, true);
	assert.equal(first.offset, 0);
	assert.equal(first.nextOffset, 80);
	assert.match(first.content, /\[Source entry id: entry-2; characters 0-80/);

	const second = recallCompactedHistory(history(), "entry-2", first.nextOffset, 1_000);
	assert.equal(second.found, true);
	assert.equal(second.nextOffset, undefined);
	assert.match(`${first.content}${second.content}`, /切换网络后部署成功 request-id-42/);
	assert.match(`${first.content}${second.content}`, /"toolName": "bash"/);

	assert.equal(recallCompactedHistory(history(), "missing").found, false);
});

test("returns no searchable sources before the first compaction", () => {
	const entries = [message("entry-1", "user", "still active")];
	assert.deepEqual(compactedSourceEntries(entries), []);
	assert.deepEqual(searchCompactedHistory(entries, "active"), []);
});
