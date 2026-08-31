import type {
	ExtensionAPI,
	SessionEntry,
} from "@earendil-works/pi-coding-agent";

export const MIN_RECENT_TEXT_ROUNDS = 3;

interface TextRound {
	boundaryIndex: number;
}

function assistantTextRounds(entries: readonly SessionEntry[]): TextRound[] {
	const rounds: TextRound[] = [];
	let activeRound = false;
	let pendingBoundaryIndex: number | undefined;

	// Only user messages and tool calls split contiguous assistant text into rounds.
	for (let entryIndex = 0; entryIndex < entries.length; entryIndex++) {
		const entry = entries[entryIndex];
		if (entry?.type !== "message") continue;

		if (entry.message.role === "user") {
			activeRound = false;
			pendingBoundaryIndex ??= entryIndex;
			continue;
		}
		if (entry.message.role !== "assistant") continue;

		for (const content of entry.message.content) {
			if (content.type === "toolCall") {
				activeRound = false;
				pendingBoundaryIndex ??= entryIndex;
				continue;
			}
			if (
				content.type === "text" &&
				content.text.trim() !== "" &&
				!activeRound
			) {
				rounds.push({
					boundaryIndex: pendingBoundaryIndex ?? entryIndex,
				});
				activeRound = true;
				pendingBoundaryIndex = undefined;
			}
		}
	}

	return rounds;
}

export function retainRecentTextRounds(
	entries: readonly SessionEntry[],
	currentFirstKeptEntryId: string,
	minimumRounds = MIN_RECENT_TEXT_ROUNDS,
): string {
	if (minimumRounds <= 0) return currentFirstKeptEntryId;

	const currentBoundaryIndex = entries.findIndex(
		(entry) => entry.id === currentFirstKeptEntryId,
	);
	if (currentBoundaryIndex < 0) return currentFirstKeptEntryId;

	const rounds = assistantTextRounds(entries);
	if (rounds.length === 0) return currentFirstKeptEntryId;

	const requiredRoundIndex = Math.max(0, rounds.length - minimumRounds);
	const requiredBoundaryIndex = rounds[requiredRoundIndex]?.boundaryIndex;
	if (requiredBoundaryIndex === undefined) return currentFirstKeptEntryId;

	const retainedBoundaryIndex = Math.min(
		currentBoundaryIndex,
		requiredBoundaryIndex,
	);
	return entries[retainedBoundaryIndex]?.id ?? currentFirstKeptEntryId;
}

export default function compactionTextRetention(pi: ExtensionAPI): void {
	pi.on("session_before_compact", (event) => {
		// Pi passes the same preparation object to later package handlers, including
		// observational-memory, which then persists this expanded raw-context boundary.
		event.preparation.firstKeptEntryId = retainRecentTextRounds(
			event.branchEntries,
			event.preparation.firstKeptEntryId,
		);
	});
}
