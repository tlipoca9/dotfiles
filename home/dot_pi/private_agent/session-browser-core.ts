import { readFileSync } from "node:fs";
import {
	basename,
	resolve,
	sep,
} from "node:path";
import { stripVTControlCharacters } from "node:util";

export interface SessionBrowserRecord {
	id: string;
	path: string;
	cwd: string;
	name?: string;
	modified: number;
	messageCount: number;
	firstMessage: string;
	recentUserText: readonly string[];
	workspaceExists: boolean;
}

export interface SessionTreeEntry {
	id?: string;
	parentId?: string | null;
	type: string;
	[key: string]: unknown;
}

export interface SessionBrowserItem extends SessionBrowserRecord {
	title: string;
	summary: string;
	displayCwd: string;
	workspaceName: string;
	workspaceSuffix: string;
	searchText: string;
}

export interface SessionWorkspace {
	key: string;
	name: string;
	suffix: string;
	count: number;
}

export type SessionBrowserFocus = "browse" | "sessions" | "search" | "detail";

export interface SessionBrowserLayout {
	shellWidth: number;
	offset: number;
	mode: "wide" | "medium" | "narrow";
	browseWidth: number;
	sessionsWidth: number;
	detailWidth: number;
}

export const DASHBOARD_COMMAND = {
	name: "dashboard",
	description: "Browse and resume work across workspaces",
} as const;

const CONTROL_SEQUENCE = /[\u0000-\u001f\u007f-\u009f]/g;

export function cleanSessionText(value: string): string {
	return stripVTControlCharacters(value)
		.replace(CONTROL_SEQUENCE, " ")
		.replace(/\s+/g, " ")
		.trim();
}

export function readSessionBranch(path: string): readonly SessionTreeEntry[] {
	const entries: SessionTreeEntry[] = [];
	for (const line of readFileSync(path, "utf8").split("\n")) {
		if (!line.trim()) continue;
		try {
			const value: unknown = JSON.parse(line);
			if (
				value === null ||
				typeof value !== "object" ||
				Array.isArray(value) ||
				!("type" in value) ||
				typeof value.type !== "string" ||
				value.type === "session"
			) continue;
			entries.push(value as SessionTreeEntry);
		} catch {
			// Discovery remains best-effort when an individual JSONL line is malformed.
		}
	}
	const byId = new Map(
		entries.flatMap((entry) =>
			typeof entry.id === "string" ? [[entry.id, entry] as const] : [],
		),
	);
	const leaf = entries.at(-1);
	if (!leaf || typeof leaf.id !== "string" || !byId.has(leaf.id)) return entries;
	const branch: SessionTreeEntry[] = [];
	const visited = new Set<string>();
	let current: SessionTreeEntry | undefined = leaf;
	while (current && typeof current.id === "string" && !visited.has(current.id)) {
		visited.add(current.id);
		branch.push(current);
		current = typeof current.parentId === "string" ? byId.get(current.parentId) : undefined;
	}
	return branch.reverse();
}

export function sessionTitle(record: SessionBrowserRecord): string {
	const named = cleanSessionText(record.name ?? "");
	if (named) return named;
	const latest = cleanSessionText(record.recentUserText[0] ?? "");
	if (latest) return latest;
	const first = cleanSessionText(record.firstMessage);
	return first || "Untitled session";
}

export function sessionSummary(record: SessionBrowserRecord): string {
	const title = cleanSessionText(sessionTitle(record));
	for (const candidate of record.recentUserText) {
		const cleaned = cleanSessionText(candidate);
		if (cleaned && cleaned !== title) return cleaned;
	}
	return "";
}

function pathParts(value: string): string[] {
	return resolve(value || sep)
		.split(sep)
		.filter(Boolean);
}

export function shortestUniqueWorkspaceSuffixes(paths: readonly string[]): readonly string[] {
	const normalized = paths.map((value) => pathParts(value));
	return normalized.map((parts, index) => {
		const minimum = Math.min(2, parts.length);
		for (let length = minimum; length <= parts.length; length += 1) {
			const suffix = parts.slice(-length).join(sep);
			const unique = normalized.every(
				(other, otherIndex) =>
					otherIndex === index || other.slice(-length).join(sep) !== suffix,
			);
			if (unique) return parts.length === length ? `${sep}${suffix}` : `…${sep}${suffix}`;
		}
		return valueOrRoot(parts);
	});
}

function valueOrRoot(parts: readonly string[]): string {
	return parts.length ? `${sep}${parts.join(sep)}` : sep;
}

export function buildSessionBrowserItems(
	records: readonly SessionBrowserRecord[],
): readonly SessionBrowserItem[] {
	const paths = [...new Set(records.map((record) => resolve(record.cwd || sep)))];
	const displayPaths = paths.map((path) => cleanSessionText(path) || sep);
	const suffixes = shortestUniqueWorkspaceSuffixes(displayPaths);
	const suffixByPath = new Map(paths.map((path, index) => [path, suffixes[index] ?? path]));
	return records
		.map((record) => {
			const cwd = resolve(record.cwd || sep);
			const displayCwd = cleanSessionText(cwd) || sep;
			const title = sessionTitle(record);
			const summary = sessionSummary(record);
			const workspaceName = cleanSessionText(basename(cwd)) || displayCwd;
			const workspaceSuffix = suffixByPath.get(cwd) ?? cwd;
			return {
				...record,
				cwd,
				displayCwd,
				title,
				summary,
				workspaceName,
				workspaceSuffix,
				searchText: [
					record.name,
					title,
					summary,
					displayCwd,
					workspaceName,
					workspaceSuffix,
					...record.recentUserText,
				]
					.map((value) => cleanSessionText(value ?? ""))
					.filter(Boolean)
					.join("\n")
					.toLocaleLowerCase(),
			};
		})
		.sort((left, right) => right.modified - left.modified);
}

export function sessionWorkspaces(items: readonly SessionBrowserItem[]): readonly SessionWorkspace[] {
	const grouped = new Map<string, SessionWorkspace>();
	for (const item of items) {
		const current = grouped.get(item.cwd);
		grouped.set(item.cwd, {
			key: item.cwd,
			name: item.workspaceName,
			suffix: item.workspaceSuffix,
			count: (current?.count ?? 0) + 1,
		});
	}
	return [...grouped.values()].sort((left, right) => left.name.localeCompare(right.name));
}

export function filterSessionBrowserItems(
	items: readonly SessionBrowserItem[],
	scope: "recent" | string,
	query: string,
): readonly SessionBrowserItem[] {
	const needle = cleanSessionText(query).toLocaleLowerCase();
	return items.filter(
		(item) =>
			(scope === "recent" || item.cwd === scope) &&
			(!needle || item.searchText.includes(needle)),
	);
}

export function sessionBrowserLayout(width: number): SessionBrowserLayout {
	const available = Math.max(1, width);
	const shellWidth = Math.max(1, Math.min(220, available - (available >= 104 ? 8 : 4)));
	const offset = Math.max(0, Math.floor((available - shellWidth) / 2));
	if (available < 104) {
		return {
			shellWidth,
			offset,
			mode: "narrow",
			browseWidth: shellWidth,
			sessionsWidth: shellWidth,
			detailWidth: shellWidth,
		};
	}
	if (available < 180) {
		const browseWidth = Math.max(28, Math.floor(shellWidth * 0.29));
		return {
			shellWidth,
			offset,
			mode: "medium",
			browseWidth,
			sessionsWidth: shellWidth - browseWidth,
			detailWidth: 0,
		};
	}
	const browseWidth = Math.floor(shellWidth * (37 / 220));
	return {
		shellWidth,
		offset,
		mode: "wide",
		browseWidth,
		sessionsWidth: shellWidth - browseWidth,
		detailWidth: 0,
	};
}

export function relativeSessionTime(modified: number, now = Date.now()): string {
	const elapsed = Math.max(0, now - modified);
	const minutes = Math.floor(elapsed / 60_000);
	if (minutes < 1) return "now";
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h`;
	const days = Math.floor(hours / 24);
	if (days < 7) return `${days}d`;
	if (days < 30) return `${Math.floor(days / 7)}w`;
	if (days < 365) return `${Math.floor(days / 30)}mo`;
	return `${Math.floor(days / 365)}y`;
}
