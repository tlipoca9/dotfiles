import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
	getAgentDir,
	type SessionEntry,
} from "@earendil-works/pi-coding-agent";

const DEFAULT_OBSERVATIONS_POOL_MAX_TOKENS = 20_000;
const OM_FOLDED = "om.folded";
const OM_OBSERVATIONS_RECORDED = "om.observations.recorded";
const OM_REFLECTIONS_RECORDED = "om.reflections.recorded";
const OM_OBSERVATIONS_DROPPED = "om.observations.dropped";

const CONTEXT_USAGE_INSTRUCTIONS = `These are condensed memories from earlier in this session.

- Reflections: stable, long-lived facts about the user, project, decisions, and constraints. New reflection lines may include ids in brackets.
- Observations: timestamped events from the conversation history, in chronological order. Observation lines include ids in brackets.

Treat these as past records. When entries conflict, the most recent observation reflects the latest known state. Work that prior observations describe as completed should not be redone unless the user explicitly asks to revisit it.

When exact source context is needed for precision or traceability, use the recall tool with the relevant observation or reflection id. This is especially useful when a reflection materially affects a decision or is too compressed to continue confidently. Do not use recall as broad search or inject raw source unless it is needed.`;

export interface ObservationalMemoryObservation {
	id: string;
	content: string;
	timestamp: string;
	relevance: "low" | "medium" | "high" | "critical";
	sourceEntryIds: string[];
	tokenCount: number;
}

export interface ObservationalMemoryReflection {
	id: string;
	content: string;
	supportingObservationIds: string[];
	tokenCount: number;
}

export interface ObservationalMemoryDetails {
	type: typeof OM_FOLDED;
	version: 1;
	fullFold: boolean;
	observations: ObservationalMemoryObservation[];
	reflections: ObservationalMemoryReflection[];
}

interface LedgerEntry {
	type: string;
	id: string;
	customType?: string;
	data?: unknown;
	details?: unknown;
	firstKeptEntryId?: string;
}

interface Projection {
	observations: ObservationalMemoryObservation[];
	reflections: ObservationalMemoryReflection[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function isObservation(value: unknown): value is ObservationalMemoryObservation {
	return isRecord(value) &&
		typeof value.id === "string" &&
		typeof value.content === "string" &&
		typeof value.timestamp === "string" &&
		["low", "medium", "high", "critical"].includes(String(value.relevance)) &&
		Array.isArray(value.sourceEntryIds) &&
		typeof value.tokenCount === "number";
}

function isReflection(value: unknown): value is ObservationalMemoryReflection {
	return isRecord(value) &&
		typeof value.id === "string" &&
		typeof value.content === "string" &&
		Array.isArray(value.supportingObservationIds) &&
		typeof value.tokenCount === "number";
}

function isMemoryDetails(value: unknown): value is ObservationalMemoryDetails {
	return isRecord(value) &&
		value.type === OM_FOLDED &&
		value.version === 1 &&
		typeof value.fullFold === "boolean" &&
		Array.isArray(value.observations) &&
		value.observations.every(isObservation) &&
		Array.isArray(value.reflections) &&
		value.reflections.every(isReflection);
}

function coveredBefore(
	entry: LedgerEntry,
	indexes: ReadonlyMap<string, number>,
	boundaryIndex: number,
): boolean {
	if (!isRecord(entry.data) || typeof entry.data.coversUpToId !== "string") return false;
	const coverageIndex = indexes.get(entry.data.coversUpToId) ?? -1;
	return coverageIndex >= 0 && boundaryIndex >= 0 && coverageIndex <= boundaryIndex;
}

function foldProjection(
	entries: readonly LedgerEntry[],
	indexes: ReadonlyMap<string, number>,
	observationsBoundary: number,
	reflectionsBoundary: number,
	dropsBoundary: number,
): Projection {
	const observations: ObservationalMemoryObservation[] = [];
	const reflections: ObservationalMemoryReflection[] = [];
	const observationIds = new Set<string>();
	const reflectionIds = new Set<string>();
	const droppedObservationIds = new Set<string>();

	for (const entry of entries) {
		if (
			entry.type === "custom" &&
			entry.customType === OM_OBSERVATIONS_RECORDED &&
			coveredBefore(entry, indexes, observationsBoundary) &&
			isRecord(entry.data) &&
			Array.isArray(entry.data.observations)
		) {
			for (const observation of entry.data.observations) {
				if (!isObservation(observation) || observationIds.has(observation.id)) continue;
				observationIds.add(observation.id);
				observations.push(observation);
			}
			continue;
		}

		if (
			entry.type === "custom" &&
			entry.customType === OM_REFLECTIONS_RECORDED &&
			coveredBefore(entry, indexes, reflectionsBoundary) &&
			isRecord(entry.data) &&
			Array.isArray(entry.data.reflections)
		) {
			for (const reflection of entry.data.reflections) {
				if (!isReflection(reflection) || reflectionIds.has(reflection.id)) continue;
				reflectionIds.add(reflection.id);
				reflections.push(reflection);
			}
			continue;
		}

		if (
			entry.type === "custom" &&
			entry.customType === OM_OBSERVATIONS_DROPPED &&
			coveredBefore(entry, indexes, dropsBoundary) &&
			isRecord(entry.data) &&
			Array.isArray(entry.data.observationIds)
		) {
			for (const id of entry.data.observationIds) {
				if (typeof id === "string") droppedObservationIds.add(id);
			}
		}
	}

	return {
		observations: observations.filter(({ id }) => !droppedObservationIds.has(id)),
		reflections,
	};
}

function latestFullFoldBoundary(
	entries: readonly LedgerEntry[],
	indexes: ReadonlyMap<string, number>,
): number {
	for (let index = entries.length - 1; index >= 0; index--) {
		const entry = entries[index];
		if (
			entry?.type === "compaction" &&
			isMemoryDetails(entry.details) &&
			entry.details.fullFold &&
			entry.firstKeptEntryId
		) {
			return indexes.get(entry.firstKeptEntryId) ?? -1;
		}
	}
	return -1;
}

function configuredPoolMax(path: string): number | undefined {
	if (!existsSync(path)) return undefined;
	try {
		const settings = JSON.parse(readFileSync(path, "utf8")) as unknown;
		if (!isRecord(settings) || !isRecord(settings["observational-memory"])) return undefined;
		const value = settings["observational-memory"].observationsPoolMaxTokens;
		return typeof value === "number" && Number.isInteger(value) && value > 0
			? value
			: undefined;
	} catch {
		return undefined;
	}
}

export function observationsPoolMaxTokens(cwd?: string): number {
	return (cwd ? configuredPoolMax(join(cwd, ".pi", "settings.json")) : undefined) ??
		configuredPoolMax(join(getAgentDir(), "settings.json")) ??
		DEFAULT_OBSERVATIONS_POOL_MAX_TOKENS;
}

export function renderObservationalMemorySummary(
	reflections: readonly ObservationalMemoryReflection[],
	observations: readonly ObservationalMemoryObservation[],
): string {
	if (reflections.length === 0 && observations.length === 0) return "";
	const sections = [CONTEXT_USAGE_INSTRUCTIONS];
	if (reflections.length > 0) {
		sections.push(`## Reflections\n${reflections.map(({ id, content }) => `[${id}] ${content}`).join("\n")}`);
	}
	if (observations.length > 0) {
		sections.push(`## Observations\n${observations.map(({ id, timestamp, relevance, content }) =>
			`[${id}] ${timestamp} [${relevance}] ${content}`
		).join("\n")}`);
	}
	return sections.join("\n\n");
}

export function buildObservationalMemoryCompaction(
	entries: readonly SessionEntry[],
	firstKeptEntryId: string,
	poolMaxTokens: number,
): { details: ObservationalMemoryDetails; summary: string } {
	const ledgerEntries = entries as readonly LedgerEntry[];
	const indexes = new Map(ledgerEntries.map((entry, index) => [entry.id, index]));
	const firstKeptIndex = indexes.get(firstKeptEntryId) ?? -1;
	const maintenanceBoundary = latestFullFoldBoundary(ledgerEntries, indexes);
	const normalProjection = foldProjection(
		ledgerEntries,
		indexes,
		firstKeptIndex,
		maintenanceBoundary,
		maintenanceBoundary,
	);
	const fullFold = normalProjection.observations.reduce(
		(total, observation) => total + observation.tokenCount,
		0,
	) >= poolMaxTokens;
	const projection = fullFold
		? foldProjection(ledgerEntries, indexes, firstKeptIndex, firstKeptIndex, firstKeptIndex)
		: normalProjection;
	const details: ObservationalMemoryDetails = {
		type: OM_FOLDED,
		version: 1,
		fullFold,
		observations: projection.observations,
		reflections: projection.reflections,
	};
	return {
		details,
		summary: renderObservationalMemorySummary(projection.reflections, projection.observations),
	};
}
