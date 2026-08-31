import { Type } from "typebox";
import {
	defineTool,
	type ExtensionAPI,
	type SessionEntry,
} from "@earendil-works/pi-coding-agent";

const DEFAULT_SEARCH_LIMIT = 8;
const MAX_SEARCH_LIMIT = 10;
const SEARCH_SNIPPET_CHARS = 600;
const DEFAULT_RECALL_CHARS = 8_000;
const MAX_RECALL_CHARS = 24_000;

function contentText(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content.map((block) => {
		if (!block || typeof block !== "object") return "";
		const typed = block as Record<string, unknown>;
		if (typed.type === "text") return String(typed.text ?? "");
		if (typed.type === "thinking") return String(typed.thinking ?? "");
		if (typed.type === "toolCall") {
			return `${String(typed.name ?? "tool")}(${JSON.stringify(typed.arguments ?? {})})`;
		}
		if (typed.type === "image") return "[image]";
		return JSON.stringify(typed);
	}).filter(Boolean).join("\n");
}

export function compactedSourceEntries(
	entries: readonly SessionEntry[],
): SessionEntry[] {
	let compactionIndex = -1;
	for (let index = entries.length - 1; index >= 0; index--) {
		if (entries[index]?.type === "compaction") {
			compactionIndex = index;
			break;
		}
	}
	if (compactionIndex < 0) return [];

	return entries.slice(0, compactionIndex).filter((entry) =>
		entry.type === "message" ||
		entry.type === "custom_message" ||
		entry.type === "branch_summary"
	);
}

export function searchableEntryText(entry: SessionEntry): string {
	if (entry.type === "message") {
		const message = entry.message;
		if (message.role === "toolResult") {
			return [message.toolName, message.toolCallId, contentText(message.content)].join("\n");
		}
		if ("content" in message) return contentText(message.content);
		if (message.role === "bashExecution") {
			return [message.command, message.output].join("\n");
		}
		if (message.role === "branchSummary" || message.role === "compactionSummary") {
			return message.summary;
		}
		return "";
	}
	if (entry.type === "custom_message") {
		return [entry.customType, contentText(entry.content)].join("\n");
	}
	if (entry.type === "branch_summary") return entry.summary;
	return "";
}

function entryRole(entry: SessionEntry): string {
	if (entry.type === "message") return entry.message.role;
	if (entry.type === "custom_message") return `custom:${entry.customType}`;
	return entry.type;
}

function searchTerms(query: string): string[] {
	const normalized = query.trim().toLocaleLowerCase();
	if (normalized === "") return [];
	const split = normalized.split(/\s+/).filter(Boolean);
	return split.length > 1 ? split : [normalized];
}

function snippetAround(text: string, query: string): string {
	const normalizedText = text.toLocaleLowerCase();
	const normalizedQuery = query.trim().toLocaleLowerCase();
	const terms = searchTerms(query);
	let matchIndex = normalizedText.indexOf(normalizedQuery);
	if (matchIndex < 0) {
		matchIndex = terms.reduce((best, term) => {
			const index = normalizedText.indexOf(term);
			return index < 0 ? best : best < 0 ? index : Math.min(best, index);
		}, -1);
	}
	if (matchIndex < 0) matchIndex = 0;

	const start = Math.max(0, matchIndex - Math.floor(SEARCH_SNIPPET_CHARS / 3));
	const end = Math.min(text.length, start + SEARCH_SNIPPET_CHARS);
	return `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
}

export interface HistorySearchMatch {
	id: string;
	role: string;
	timestamp: string;
	snippet: string;
}

export function searchCompactedHistory(
	entries: readonly SessionEntry[],
	query: string,
	limit = DEFAULT_SEARCH_LIMIT,
): HistorySearchMatch[] {
	const normalizedQuery = query.trim().toLocaleLowerCase();
	const terms = searchTerms(query);
	if (terms.length === 0) return [];

	return compactedSourceEntries(entries)
		.map((entry, order) => {
			const text = searchableEntryText(entry);
			const normalizedText = text.toLocaleLowerCase();
			if (!terms.every((term) => normalizedText.includes(term))) return undefined;
			return {
				entry,
				order,
				score: normalizedText.includes(normalizedQuery) ? terms.length + 2 : terms.length,
				text,
			};
		})
		.filter((item): item is NonNullable<typeof item> => item !== undefined)
		.sort((left, right) => right.score - left.score || right.order - left.order)
		.slice(0, Math.max(1, Math.min(MAX_SEARCH_LIMIT, limit)))
		.map(({ entry, text }) => ({
			id: entry.id,
			role: entryRole(entry),
			timestamp: entry.timestamp,
			snippet: snippetAround(text, query),
		}));
}

export function recallCompactedHistory(
	entries: readonly SessionEntry[],
	entryId: string,
	offset = 0,
	maxChars = DEFAULT_RECALL_CHARS,
): {
	content: string;
	found: boolean;
	nextOffset?: number;
	offset: number;
	totalChars: number;
} {
	const sources = new Map(compactedSourceEntries(entries).map((entry) => [entry.id, entry]));
	const entry = sources.get(entryId);
	if (!entry) return { content: "", found: false, offset: 0, totalChars: 0 };

	const raw = JSON.stringify(entry, null, 2);
	const boundedOffset = Math.max(0, Math.min(raw.length, offset));
	const boundedChars = Math.max(1, Math.min(MAX_RECALL_CHARS, maxChars));
	const end = Math.min(raw.length, boundedOffset + boundedChars);
	return {
		content: `[Source entry id: ${entryId}; characters ${boundedOffset}-${end} of ${raw.length}]\n${raw.slice(boundedOffset, end)}`,
		found: true,
		...(end < raw.length ? { nextOffset: end } : {}),
		offset: boundedOffset,
		totalChars: raw.length,
	};
}

function registerHistorySearch(pi: ExtensionAPI): void {
	pi.registerTool(defineTool({
		name: "history_search",
		label: "Search compacted history",
		description:
			"Search original entries that remain stored in the current Pi session but have been removed from active context by compaction. " +
			"Use this when compacted memory does not expose a relevant recall id or exact wording, command, error, or path is needed.",
		promptGuidelines: [
			"Use recall first when a relevant observational-memory id is already available.",
			"Use history_search for focused lexical lookup, then history_recall only for the specific entry ids needed.",
			"Do not browse compacted history speculatively or retrieve broad ranges.",
		],
		parameters: Type.Object({
			query: Type.String({ minLength: 1, description: "Focused words or exact phrase to find in compacted source entries." }),
			limit: Type.Optional(Type.Integer({ minimum: 1, maximum: MAX_SEARCH_LIMIT })),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, context) {
			const matches = searchCompactedHistory(
				context.sessionManager.getBranch(),
				params.query,
				params.limit ?? DEFAULT_SEARCH_LIMIT,
			);
			const text = matches.length === 0
				? `No compacted source entries matched: ${params.query}`
				: matches.map((match) =>
					`[${match.id}] ${match.timestamp} ${match.role}\n${match.snippet}`
				).join("\n\n");
			return { content: [{ type: "text", text }], details: { query: params.query, matches } };
		},
	}));
}

function registerHistoryRecall(pi: ExtensionAPI): void {
	pi.registerTool(defineTool({
		name: "history_recall",
		label: "Recall compacted source entries",
		description:
			"Read stored JSON for one compacted current-session entry id returned by history_search. " +
			"Large entries are paged with nextOffset so their complete original content remains recoverable without flooding context.",
		promptGuidelines: [
			"Call history_recall only with a focused id returned by history_search.",
			"If the returned section is insufficient and nextOffset is present, request the next page with that offset.",
		],
		parameters: Type.Object({
			entryId: Type.String({ minLength: 1 }),
			offset: Type.Optional(Type.Integer({ minimum: 0 })),
			maxChars: Type.Optional(Type.Integer({ minimum: 1_000, maximum: MAX_RECALL_CHARS })),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, context) {
			const result = recallCompactedHistory(
				context.sessionManager.getBranch(),
				params.entryId,
				params.offset ?? 0,
				params.maxChars ?? DEFAULT_RECALL_CHARS,
			);
			return {
				content: [{
					type: "text",
					text: result.found
						? result.content
						: `Compacted entry id not found on the current branch: ${params.entryId}`,
				}],
				details: result,
			};
		},
	}));
}

export function registerCompactedHistoryTools(pi: ExtensionAPI): void {
	registerHistorySearch(pi);
	registerHistoryRecall(pi);
}
