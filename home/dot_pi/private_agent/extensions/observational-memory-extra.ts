import type { AgentMessage } from "@earendil-works/pi-agent-core";
import {
	estimateTokens,
	type ExtensionAPI,
	sessionEntryToContextMessages,
	type SessionEntry,
} from "@earendil-works/pi-coding-agent";

import { registerCompactedHistoryTools } from "./lib/compacted-history.ts";

export const MIN_RECENT_TEXT_ROUNDS = 3;
export const MAX_FULL_TRAILING_TOOL_CALLS = 5;
export const RECENT_TEXT_TOKEN_BUDGET = 2_000;

const TOOL_TITLE_MAX_CHARS = 400;

type AssistantMessage = Extract<AgentMessage, { role: "assistant" }>;
type ToolCall = Extract<AssistantMessage["content"][number], { type: "toolCall" }>;

interface TextReference {
	contentIndex: number;
	entryIndex: number;
	text: string;
}

function assistantTextRounds(entries: readonly SessionEntry[]): TextReference[][] {
	const rounds: TextReference[][] = [];
	let activeRound: TextReference[] | undefined;

	for (let entryIndex = 0; entryIndex < entries.length; entryIndex++) {
		const entry = entries[entryIndex];
		if (entry?.type !== "message") continue;

		if (entry.message.role === "user") {
			activeRound = undefined;
			continue;
		}
		if (entry.message.role !== "assistant") continue;

		for (let contentIndex = 0; contentIndex < entry.message.content.length; contentIndex++) {
			const content = entry.message.content[contentIndex];
			if (content.type === "toolCall") {
				activeRound = undefined;
				continue;
			}
			if (content.type !== "text" || content.text.trim() === "") continue;

			if (!activeRound) {
				activeRound = [];
				rounds.push(activeRound);
			}
			activeRound.push({ entryIndex, contentIndex, text: content.text });
		}
	}

	return rounds;
}

function userText(message: AgentMessage): string | undefined {
	if (message.role !== "user") return undefined;
	if (typeof message.content === "string") return message.content;

	const text = message.content
		.map((content) => content.type === "text" ? content.text : "[image]")
		.join("\n")
		.trim();
	return text === "" ? undefined : text;
}

function retainedPreludeStartEntry(
	entries: readonly SessionEntry[],
	firstText: TextReference,
): number {
	for (let entryIndex = firstText.entryIndex; entryIndex >= 0; entryIndex--) {
		const entry = entries[entryIndex];
		if (entry?.type !== "message" || entry.message.role !== "assistant") continue;

		const lastContentIndex = entryIndex === firstText.entryIndex
			? firstText.contentIndex - 1
			: entry.message.content.length - 1;
		for (let contentIndex = lastContentIndex; contentIndex >= 0; contentIndex--) {
			const content = entry.message.content[contentIndex];
			if (content.type !== "text" || content.text.trim() === "") continue;
			return entryIndex === firstText.entryIndex ? entryIndex : entryIndex + 1;
		}
	}
	return 0;
}

function retainedPrelude(
	entries: readonly SessionEntry[],
	selectedRounds: readonly TextReference[][],
	latestText: TextReference,
): AgentMessage | undefined {
	const selectedTexts = new Map<number, Map<number, string>>();
	for (const round of selectedRounds) {
		for (const reference of round) {
			if (
				reference.entryIndex === latestText.entryIndex &&
				reference.contentIndex === latestText.contentIndex
			) continue;

			let entryTexts = selectedTexts.get(reference.entryIndex);
			if (!entryTexts) {
				entryTexts = new Map();
				selectedTexts.set(reference.entryIndex, entryTexts);
			}
			entryTexts.set(reference.contentIndex, reference.text);
		}
	}

	const firstText = selectedRounds[0]?.[0];
	if (!firstText) return undefined;

	const transcript: string[] = [];
	for (
		let entryIndex = retainedPreludeStartEntry(entries, firstText);
		entryIndex <= latestText.entryIndex;
		entryIndex++
	) {
		const entry = entries[entryIndex];
		if (entry?.type !== "message") continue;

		const retainedAssistantTexts = selectedTexts.get(entryIndex);
		if (entry.message.role === "assistant" && retainedAssistantTexts) {
			for (const text of retainedAssistantTexts.values()) {
				transcript.push(`[Assistant]\n${text}`);
			}
			continue;
		}

		const text = userText(entry.message);
		if (text) transcript.push(`[User]\n${text}`);
	}

	if (transcript.length === 0) return undefined;
	return {
		role: "custom",
		customType: "tlipoca9.observational-memory-extra.retained-text",
		content: [
			"The following verbatim assistant text rounds and their preceding or intervening user messages were retained from earlier conversation history:",
			"",
			"<retained-text-rounds>",
			transcript.join("\n\n"),
			"</retained-text-rounds>",
		].join("\n"),
		display: false,
		timestamp: Date.parse(entries[firstText.entryIndex]!.timestamp),
	};
}

function retainedTextTokens(
	entries: readonly SessionEntry[],
	selectedRounds: readonly TextReference[][],
): number {
	const latestText = selectedRounds.at(-1)?.at(-1);
	if (!latestText) return 0;
	const prelude = retainedPrelude(entries, selectedRounds, latestText);
	return (prelude ? estimateTokens(prelude) : 0) + estimateTokens({
		role: "custom",
		customType: "tlipoca9.observational-memory-extra.retained-text-estimate",
		content: latestText.text,
		display: false,
		timestamp: Date.parse(entries[latestText.entryIndex]!.timestamp),
	});
}

function selectRecentTextRounds(
	entries: readonly SessionEntry[],
	rounds: readonly TextReference[][],
	minimumRounds: number,
	tokenBudget: number,
): TextReference[][] {
	let firstRound = Math.max(0, rounds.length - minimumRounds);
	while (firstRound > 0) {
		const candidate = rounds.slice(firstRound - 1);
		if (retainedTextTokens(entries, candidate) > tokenBudget) break;
		firstRound -= 1;
	}
	return rounds.slice(firstRound);
}

function safeJson(value: unknown): string {
	try {
		return JSON.stringify(value);
	} catch {
		return "[unserializable]";
	}
}

function toolCallTitle(content: ToolCall): string {
	const args = Object.entries(content.arguments)
		.map(([key, value]) => `${key}=${safeJson(value)}`)
		.join(", ");
	const title = `[Assistant tool call]: ${content.name}(${args})`;
	return title.length <= TOOL_TITLE_MAX_CHARS
		? title
		: `${title.slice(0, TOOL_TITLE_MAX_CHARS - 1)}…`;
}

function toolCallIds(messages: readonly AgentMessage[]): string[] {
	return messages.flatMap((message) =>
		message.role === "assistant"
			? message.content.flatMap((content) =>
					content.type === "toolCall" ? [content.id] : [],
				)
			: [],
	);
}

function compactTrailingTools(
	messages: readonly AgentMessage[],
	maxCalls: number,
): AgentMessage[] {
	const callIds = toolCallIds(messages);
	const fullToolCallIds = new Set(maxCalls > 0 ? callIds.slice(-maxCalls) : []);
	return messages.flatMap((message): AgentMessage[] => {
		if (message.role === "toolResult") {
			return fullToolCallIds.has(message.toolCallId) ? [message] : [];
		}
		if (message.role !== "assistant") return [message];

		return [{
			...message,
			content: message.content.map((content) =>
				content.type === "toolCall" && !fullToolCallIds.has(content.id)
					? { type: "text" as const, text: toolCallTitle(content) }
					: content,
			),
		}];
	});
}

function messagesAfterLatestText(
	entries: readonly SessionEntry[],
	latestText: TextReference,
	fullToolCallCount: number,
): AgentMessage[] {
	const rawSuffix: AgentMessage[] = [];
	const anchor = entries[latestText.entryIndex];
	if (anchor?.type !== "message" || anchor.message.role !== "assistant") {
		return rawSuffix;
	}

	rawSuffix.push({
		...anchor.message,
		content: anchor.message.content.slice(latestText.contentIndex),
	});

	for (let entryIndex = latestText.entryIndex + 1; entryIndex < entries.length; entryIndex++) {
		const entry = entries[entryIndex];
		if (!entry || entry.type === "compaction") continue;
		rawSuffix.push(...sessionEntryToContextMessages(entry));
	}

	return compactTrailingTools(rawSuffix, fullToolCallCount);
}

export function selectCompactedContext(
	entries: readonly SessionEntry[],
	messages: readonly AgentMessage[],
	minimumRounds = MIN_RECENT_TEXT_ROUNDS,
	fullToolCallCount = MAX_FULL_TRAILING_TOOL_CALLS,
	textTokenBudget = RECENT_TEXT_TOKEN_BUDGET,
): AgentMessage[] {
	const summary = messages.findLast((message) => message.role === "compactionSummary");
	if (!summary || minimumRounds <= 0) return [...messages];

	const rounds = assistantTextRounds(entries);
	const selectedRounds = selectRecentTextRounds(
		entries,
		rounds,
		minimumRounds,
		textTokenBudget,
	);
	const latestText = selectedRounds.at(-1)?.at(-1);
	if (!latestText) return [summary];

	const prelude = retainedPrelude(entries, selectedRounds, latestText);
	return [
		summary,
		...(prelude ? [prelude] : []),
		...messagesAfterLatestText(
			entries,
			latestText,
			fullToolCallCount,
		),
	];
}

export default function observationalMemoryExtra(pi: ExtensionAPI): void {
	registerCompactedHistoryTools(pi);

	pi.on("context", (event, context) => ({
		messages: selectCompactedContext(
			context.sessionManager.getBranch(),
			event.messages,
		),
	}));
}
