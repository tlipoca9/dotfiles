import { homedir } from "node:os";
import { basename, resolve } from "node:path";

import {
	SessionManager,
	type ExtensionAPI,
	type ExtensionCommandContext,
	type SessionInfo,
	type Theme,
} from "@earendil-works/pi-coding-agent";
import {
	type Focusable,
	matchesKey,
	truncateToWidth,
	visibleWidth,
	wrapTextWithAnsi,
} from "@earendil-works/pi-tui";

const RECENT_WORK = "__recent_work__";
const MAX_VISIBLE_SESSIONS = 8;
const MAX_VISIBLE_WORKSPACES = 6;

interface WorkspaceSummary {
	id: string;
	cwd: string;
	name: string;
	path: string;
	latest: number;
	count: number;
}

type SessionSelection = string | undefined;
type FocusArea = "workspaces" | "sessions" | "search";

function normalizePath(value: string): string {
	return resolve(value || "/");
}

function homeRelative(value: string): string {
	const normalized = normalizePath(value);
	const userHome = normalizePath(homedir());
	return normalized === userHome
		? "~"
		: normalized.startsWith(`${userHome}/`)
			? `~/${normalized.slice(userHome.length + 1)}`
			: normalized;
}

function uniquePathSuffix(target: string, allPaths: readonly string[]): string {
	const rendered = allPaths.map(homeRelative);
	const wanted = homeRelative(target);
	const wantedParts = wanted.split("/").filter(Boolean);
	for (let length = 2; length <= wantedParts.length; length++) {
		const candidate = wantedParts.slice(-length).join("/");
		const matches = rendered.filter((value) => value.endsWith(candidate));
		if (matches.length === 1) return wanted.startsWith("~/") ? `~/${candidate}` : `…/${candidate}`;
	}
	return wanted;
}

function redact(value: string): string {
	return value
		.replace(/\bBearer\s+\S+/gi, "Bearer [redacted]")
		.replace(/\b(?:sk|ghp|github_pat|xox[baprs]|tai_pat)[-_\w]{8,}\b/gi, "[redacted]")
		.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
}

function firstLine(value: string): string {
	const withoutAmbientContext = value
		.replace(/<skill\b[\s\S]*?<\/skill>/gi, "")
		.replace(/<in-app-browser-context\b[\s\S]*?<\/in-app-browser-context>/gi, "");
	return redact(withoutAmbientContext)
		.split(/\r?\n/)
		.map((line) => line.trim())
		.find((line) => Boolean(line) && !line.startsWith("<") && !line.startsWith("## My request")) ?? "";
}

function titleFor(session: SessionInfo): string {
	return session.name?.trim() || firstLine(session.firstMessage) || "Untitled session";
}

function summaryFor(session: SessionInfo): string {
	const first = firstLine(session.firstMessage);
	return session.name?.trim() && first !== session.name.trim() ? first : "";
}

function relativeTime(date: Date, now = Date.now()): string {
	const elapsed = Math.max(0, now - date.getTime());
	const minutes = Math.floor(elapsed / 60_000);
	if (minutes < 1) return "now";
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h`;
	const days = Math.floor(hours / 24);
	if (days < 7) return `${days}d`;
	return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function workspaceSummaries(sessions: readonly SessionInfo[]): WorkspaceSummary[] {
	const byCwd = new Map<string, SessionInfo[]>();
	for (const session of sessions) {
		const cwd = normalizePath(session.cwd || "/");
		const group = byCwd.get(cwd) ?? [];
		group.push(session);
		byCwd.set(cwd, group);
	}
	const paths = [...byCwd.keys()];
	return paths
		.map((cwd) => {
			const group = byCwd.get(cwd)!;
			return {
				id: cwd,
				cwd,
				name: basename(cwd) || cwd,
				path: uniquePathSuffix(cwd, paths),
				latest: Math.max(...group.map((session) => session.modified.getTime())),
				count: group.length,
			};
		})
		.sort((left, right) => right.latest - left.latest);
}

function padAnsi(value: string, width: number): string {
	const clipped = truncateToWidth(value, Math.max(0, width));
	return clipped + " ".repeat(Math.max(0, width - visibleWidth(clipped)));
}

function pathTail(value: string, width: number): string {
	if (visibleWidth(value) <= width) return value;
	let tail = "";
	for (const character of [...value].reverse()) {
		if (visibleWidth(`…${character}${tail}`) > width) break;
		tail = `${character}${tail}`;
	}
	return `…${tail}`;
}

function alignRight(left: string, right: string, width: number): string {
	const clippedRight = truncateToWidth(right, Math.max(1, width - 1));
	const leftWidth = Math.max(1, width - visibleWidth(clippedRight) - 1);
	const clippedLeft = truncateToWidth(left, leftWidth);
	return `${clippedLeft}${" ".repeat(Math.max(1, width - visibleWidth(clippedLeft) - visibleWidth(clippedRight)))}${clippedRight}`;
}

function fill(theme: Theme, value: string, width: number, selected: boolean): string {
	const padded = padAnsi(value, width);
	return selected ? theme.bg("selectedBg", padded) : padded;
}

function joinColumns(theme: Theme, columns: string[][], widths: number[]): string[] {
	const height = Math.max(...columns.map((column) => column.length));
	const separator = theme.fg("borderMuted", "│");
	return Array.from({ length: height }, (_, row) =>
		columns.map((column, index) => padAnsi(column[row] ?? "", widths[index]!)).join(separator),
	);
}

class WorkspaceSessionsComponent implements Focusable {
	focused = false;

	private focus: FocusArea = "sessions";
	private query = "";
	private selectedSession = 0;
	private selectedWorkspace = 0;
	private workspaceOffset = 0;
	private sessionOffset = 0;
	private readonly sessions: SessionInfo[];
	private readonly workspaces: WorkspaceSummary[];

	constructor(
		sessions: SessionInfo[],
		private readonly currentSessionPath: string | undefined,
		private readonly theme: Theme,
		private readonly done: (result: SessionSelection) => void,
		private readonly viewportHeight?: () => number,
	) {
		this.sessions = [...sessions].sort((left, right) => right.modified.getTime() - left.modified.getTime());
		this.workspaces = workspaceSummaries(this.sessions);
		const current = currentSessionPath ? this.sessions.findIndex((session) => normalizePath(session.path) === normalizePath(currentSessionPath)) : -1;
		if (current >= 0) this.selectedSession = current;
	}

	private workspaceIds(): string[] {
		return [RECENT_WORK, ...this.workspaces.map((workspace) => workspace.id)];
	}

	private currentWorkspaceId(): string {
		return this.workspaceIds()[this.selectedWorkspace] ?? RECENT_WORK;
	}

	private visibleSessions(): SessionInfo[] {
		const workspaceId = this.currentWorkspaceId();
		const query = this.query.trim().toLocaleLowerCase();
		return this.sessions.filter((session) => {
			if (workspaceId !== RECENT_WORK && normalizePath(session.cwd) !== workspaceId) return false;
			if (!query) return true;
			return [session.name, session.cwd, session.firstMessage]
				.filter((value): value is string => typeof value === "string")
				.some((value) => value.toLocaleLowerCase().includes(query));
		});
	}

	private selected(): SessionInfo | undefined {
		return this.visibleSessions()[this.selectedSession];
	}

	private visibleRowLimit(maximum: number): number {
		const height = this.viewportHeight?.();
		if (height === undefined) return maximum;
		return Math.min(maximum, Math.max(1, Math.floor((height - 6) / 2)));
	}

	private keepWorkspaceVisible(): void {
		const visible = this.visibleRowLimit(MAX_VISIBLE_WORKSPACES);
		if (this.selectedWorkspace < this.workspaceOffset) this.workspaceOffset = this.selectedWorkspace;
		if (this.selectedWorkspace >= this.workspaceOffset + visible) {
			this.workspaceOffset = this.selectedWorkspace - visible + 1;
		}
	}

	private keepSessionVisible(): void {
		const visible = this.visibleRowLimit(MAX_VISIBLE_SESSIONS);
		if (this.selectedSession < this.sessionOffset) this.sessionOffset = this.selectedSession;
		if (this.selectedSession >= this.sessionOffset + visible) {
			this.sessionOffset = this.selectedSession - visible + 1;
		}
	}

	private move(delta: number): void {
		if (this.focus === "workspaces") {
			const count = this.workspaceIds().length;
			this.selectedWorkspace = Math.max(0, Math.min(count - 1, this.selectedWorkspace + delta));
			this.selectedSession = 0;
			this.sessionOffset = 0;
			this.keepWorkspaceVisible();
			return;
		}
		const count = this.visibleSessions().length;
		this.selectedSession = Math.max(0, Math.min(count - 1, this.selectedSession + delta));
		this.keepSessionVisible();
	}

	handleInput(data: string): void {
		if (this.focus === "search") {
			if (matchesKey(data, "escape")) {
				this.focus = "sessions";
				if (!this.query) return;
				this.query = "";
				this.selectedSession = 0;
				this.sessionOffset = 0;
				return;
			}
			if (matchesKey(data, "return")) {
				this.focus = "sessions";
				return;
			}
			if (matchesKey(data, "backspace")) {
				this.query = this.query.slice(0, -1);
				this.selectedSession = 0;
				this.sessionOffset = 0;
				return;
			}
			if (data.length === 1 && data.charCodeAt(0) >= 32) {
				this.query += data;
				this.selectedSession = 0;
				this.sessionOffset = 0;
			}
			return;
		}

		if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) {
			this.done(undefined);
			return;
		}
		if (matchesKey(data, "tab")) {
			this.focus = this.focus === "workspaces" ? "sessions" : "workspaces";
			return;
		}
		if (data === "/") {
			this.focus = "search";
			return;
		}
		if (matchesKey(data, "up") || data === "k") {
			this.move(-1);
			return;
		}
		if (matchesKey(data, "down") || data === "j") {
			this.move(1);
			return;
		}
		if (matchesKey(data, "return")) {
			const selected = this.selected();
			if (selected) this.done(selected.path);
		}
	}

	private renderWorkspaces(width: number): string[] {
		const th = this.theme;
		const rows = [
			alignRight(th.bold("Browse"), th.fg("dim", `${this.workspaces.length} workspaces`), width),
			"",
		];
		const ids = this.workspaceIds();
		const visible = ids.slice(
			this.workspaceOffset,
			this.workspaceOffset + this.visibleRowLimit(MAX_VISIBLE_WORKSPACES),
		);
		for (const id of visible) {
			const absoluteIndex = ids.indexOf(id);
			const selected = absoluteIndex === this.selectedWorkspace;
			const active = selected && this.focus === "workspaces";
			if (id === RECENT_WORK) {
				const label = `${active ? "│" : " "} ${selected ? th.fg("accent", "Recent work") : "Recent work"}`;
				rows.push(fill(th, label, width, selected), fill(th, th.fg("dim", `   ${this.sessions.length} sessions`), width, selected));
				continue;
			}
			const workspace = this.workspaces.find((candidate) => candidate.id === id)!;
			const name = selected ? th.fg("accent", workspace.name) : th.fg("text", workspace.name);
			rows.push(
				fill(th, `${active ? "│" : " "} ${name} ${th.fg("dim", String(workspace.count))}`, width, selected),
				fill(th, th.fg("dim", `   ${pathTail(workspace.path, Math.max(1, width - 3))}`), width, selected),
			);
		}
		return rows;
	}

	private renderSessions(width: number): string[] {
		const th = this.theme;
		const sessions = this.visibleSessions();
		const workspace = this.currentWorkspaceId() === RECENT_WORK
			? "Recent work"
			: this.workspaces.find((candidate) => candidate.id === this.currentWorkspaceId())?.name ?? "Sessions";
		const search = this.focus === "search"
			? `${th.fg("accent", "/")} ${this.query || th.fg("dim", "filter")}`
			: `${th.fg("accent", "/")} ${th.fg("dim", "search")}`;
		const rows = [
			`${th.bold(workspace)}${" ".repeat(Math.max(1, width - visibleWidth(workspace) - visibleWidth(search)))}${search}`,
			"",
		];
		const visible = sessions.slice(
			this.sessionOffset,
			this.sessionOffset + this.visibleRowLimit(MAX_VISIBLE_SESSIONS),
		);
		for (const session of visible) {
			const absoluteIndex = sessions.indexOf(session);
			const selected = absoluteIndex === this.selectedSession;
			const active = selected && this.focus === "sessions";
			const current = this.currentSessionPath && normalizePath(session.path) === normalizePath(this.currentSessionPath);
			const time = relativeTime(session.modified);
			const prefix = active ? "│ " : "  ";
			const marker = current ? th.fg("success", "●") : th.fg("dim", "·");
			const title = selected ? th.fg("accent", titleFor(session)) : th.fg("text", titleFor(session));
			const left = truncateToWidth(`${prefix}${marker} ${title}`, Math.max(1, width - visibleWidth(time) - 1));
			const first = `${left}${" ".repeat(Math.max(1, width - visibleWidth(left) - visibleWidth(time)))}${th.fg("dim", time)}`;
			const workspaceName = basename(session.cwd) || session.cwd;
			const summary = summaryFor(session);
			const second = th.fg("dim", `    ${workspaceName}${summary ? `  ${summary}` : ""}`);
			rows.push(fill(th, first, width, selected), fill(th, second, width, selected));
		}
		if (visible.length === 0) rows.push(th.fg("dim", "  No matching sessions"));
		return rows;
	}

	private renderPreview(width: number): string[] {
		const th = this.theme;
		const session = this.selected();
		if (!session) return [th.fg("dim", "SESSION"), "", th.fg("dim", "No session selected")];
		const rows = [
			th.fg("dim", `SESSION · ${relativeTime(session.modified)}`),
			"",
			...wrapTextWithAnsi(th.bold(titleFor(session)), width),
			"",
			...wrapTextWithAnsi(th.fg("mdLink", homeRelative(session.cwd)), width),
			"",
		];
		const summary = summaryFor(session) || firstLine(session.firstMessage);
		if (summary) rows.push(...wrapTextWithAnsi(th.fg("muted", summary), width), "");
		rows.push(th.fg("dim", `${session.messageCount} messages`));
		return rows;
	}

	render(width: number): string[] {
		const th = this.theme;
		this.keepWorkspaceVisible();
		this.keepSessionVisible();
		const usableWidth = Math.max(48, width);
		const showPreview = usableWidth >= 112;
		const leftWidth = Math.min(30, Math.max(24, Math.floor(usableWidth * 0.22)));
		const middleWidth = showPreview
			? Math.min(48, Math.max(38, Math.floor(usableWidth * 0.38)))
			: usableWidth - leftWidth - 1;
		const previewWidth = usableWidth - leftWidth - middleWidth - 2;
		const columns = [this.renderWorkspaces(leftWidth), this.renderSessions(middleWidth)];
		const widths = [leftWidth, middleWidth];
		if (showPreview) {
			columns.push(this.renderPreview(previewWidth));
			widths.push(previewWidth);
		}
		const contentHeight = Math.max(1, (this.viewportHeight?.() ?? 0) - 4);
		const renderedColumns = joinColumns(th, columns, widths).slice(0, contentHeight);
		while (renderedColumns.length < contentHeight) renderedColumns.push(" ".repeat(usableWidth));
		const chip = th.bg("selectedBg", th.fg("borderAccent", th.bold(" SESSIONS ")));
		const header = `${th.bold("π")}  ${chip}  ${th.fg("muted", "all workspaces")}`;
		const line = th.fg("borderMuted", "─".repeat(usableWidth));
		const hotkey = (key: string, label: string) => `${th.fg("accent", th.bold(key))} ${th.fg("dim", label)}`;
		const footer = this.focus === "search"
			? `${hotkey("type", "filter")}   ${hotkey("enter", "results")}   ${hotkey("esc", "clear")}`
			: `${hotkey("↑↓", "move")}   ${hotkey("tab", "workspace / sessions")}   ${hotkey("/", "filter")}   ${hotkey("enter", "resume")}   ${hotkey("esc", "close")}`;
		return [padAnsi(header, usableWidth), line, ...renderedColumns, line, padAnsi(footer, usableWidth)];
	}

	invalidate(): void {}
	dispose(): void {}
}

async function openSessions(ctx: ExtensionCommandContext): Promise<void> {
	if (ctx.mode !== "tui") {
		ctx.ui.notify("Sessions workspace is available in TUI mode", "warning");
		return;
	}
	let sessions: SessionInfo[];
	try {
		sessions = await SessionManager.listAll();
	} catch (error) {
		ctx.ui.notify(`Unable to index sessions: ${error instanceof Error ? error.message : String(error)}`, "error");
		return;
	}
	if (sessions.length === 0) {
		ctx.ui.notify("No saved sessions yet", "info");
		return;
	}
	const selected = await ctx.ui.custom<SessionSelection>(
		(tui, theme, _keybindings, done) =>
			new WorkspaceSessionsComponent(
				sessions,
				ctx.sessionManager.getSessionFile(),
				theme,
				done,
				() => tui.terminal.rows,
			),
	{
		overlay: true,
		overlayOptions: { width: "100%", maxHeight: "100%", anchor: "top-left" },
	},
	);
	if (!selected) return;
	if (ctx.sessionManager.getSessionFile() && normalizePath(selected) === normalizePath(ctx.sessionManager.getSessionFile()!)) return;
	try {
		await ctx.switchSession(selected);
	} catch (error) {
		ctx.ui.notify(`Unable to resume session: ${error instanceof Error ? error.message : String(error)}`, "error");
	}
}

export default function workspaceSessions(pi: ExtensionAPI): void {
	pi.registerCommand("sessions", {
		description: "Browse recent work across workspaces and resume a session",
		handler: async (_args, ctx) => openSessions(ctx),
	});
}

export {
	WorkspaceSessionsComponent,
	homeRelative,
	relativeTime,
	pathTail,
	summaryFor,
	titleFor,
	uniquePathSuffix,
	workspaceSummaries,
};
