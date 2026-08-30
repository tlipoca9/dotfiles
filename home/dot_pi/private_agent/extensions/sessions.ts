import { existsSync } from "node:fs";

import {
	type ExtensionAPI,
	type SessionInfo,
	SessionManager,
	type Theme,
} from "@earendil-works/pi-coding-agent";
import {
	type Component,
	type Focusable,
	Input,
	type KeybindingsManager,
	matchesKey,
	stripTerminalSequences,
	type TUI,
	truncateToWidth,
	visibleWidth,
	wrapTextWithAnsi,
} from "@earendil-works/pi-tui";

import {
	buildSessionBrowserItems,
	filterSessionBrowserItems,
	readSessionBranch,
	relativeSessionTime,
	type SessionBrowserFocus,
	type SessionBrowserItem,
	sessionBrowserLayout,
	type SessionBrowserRecord,
	type SessionTreeEntry,
	sessionWorkspaces,
	type SessionWorkspace,
} from "../session-browser-core.ts";

type BrowserResult = { sessionPath: string } | undefined;

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function messageText(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.flatMap((part) =>
			isRecord(part) && part.type === "text" && typeof part.text === "string"
				? [part.text]
				: [],
		)
		.join("\n");
}

function recentUserText(entries: readonly SessionTreeEntry[], limit = 4): readonly string[] {
	const result: string[] = [];
	for (let index = entries.length - 1; index >= 0 && result.length < limit; index -= 1) {
		const entry = entries[index];
		if (entry?.type !== "message" || !isRecord(entry.message) || entry.message.role !== "user") continue;
		const text = messageText(entry.message.content).trim();
		if (text) result.push(text);
	}
	return result;
}

function toBrowserRecord(session: SessionInfo): SessionBrowserRecord {
	let recent: readonly string[] = [];
	try {
		recent = recentUserText(readSessionBranch(session.path));
	} catch {
		// SessionInfo still provides a safe fallback when a single transcript cannot be read.
	}
	return {
		id: session.id,
		path: session.path,
		cwd: session.cwd || "/",
		...(session.name ? { name: session.name } : {}),
		modified: session.modified.getTime(),
		messageCount: session.messageCount,
		firstMessage: session.firstMessage,
		recentUserText: recent,
		workspaceExists: Boolean(session.cwd) && existsSync(session.cwd),
	};
}

function plainWidth(value: string): number {
	return visibleWidth(stripTerminalSequences(value));
}

function padded(value: string, width: number): string {
	if (width <= 0) return "";
	const truncated = truncateToWidth(value, width, "…");
	return `${truncated}${" ".repeat(Math.max(0, width - plainWidth(truncated)))}`;
}

function joinColumns(columns: readonly string[][], widths: readonly number[], divider: string): string[] {
	const height = Math.max(0, ...columns.map((column) => column.length));
	return Array.from({ length: height }, (_, row) =>
		columns
			.map((column, index) =>
				padded(
					column[row] ?? "",
					Math.max(0, (widths[index] ?? 0) - (index < columns.length - 1 ? 1 : 0)),
				),
			)
			.join(divider),
	);
}

function selectedLine(theme: Theme, value: string, width: number, selected: boolean): string {
	const line = padded(value, width);
	return selected ? theme.bg("selectedBg", line) : line;
}

class SessionsBrowser implements Component, Focusable {
	readonly #tui: TUI;
	readonly #theme: Theme;
	readonly #keybindings: KeybindingsManager;
	readonly #done: (result: BrowserResult) => void;
	readonly #items: readonly SessionBrowserItem[];
	readonly #workspaces: readonly SessionWorkspace[];
	readonly #search = new Input();

	focused = false;
	#focus: SessionBrowserFocus = "sessions";
	#scope: "recent" | string = "recent";
	#browseIndex = 0;
	#selectedId: string | undefined;

	constructor(
		tui: TUI,
		theme: Theme,
		keybindings: KeybindingsManager,
		done: (result: BrowserResult) => void,
		items: readonly SessionBrowserItem[],
	) {
		this.#tui = tui;
		this.#theme = theme;
		this.#keybindings = keybindings;
		this.#done = done;
		this.#items = items;
		this.#workspaces = sessionWorkspaces(items);
		this.#selectedId = items[0]?.id;
		this.#search.focused = false;
	}

	invalidate(): void {}

	dispose(): void {
		this.#search.focused = false;
	}

	#requestRender(): void {
		this.#tui.requestRender();
	}

	#choices(): readonly ({ key: "recent"; name: "Recent work"; suffix: ""; count: number } | SessionWorkspace)[] {
		return [
			{ key: "recent", name: "Recent work", suffix: "", count: this.#items.length },
			...this.#workspaces,
		];
	}

	#filtered(): readonly SessionBrowserItem[] {
		return filterSessionBrowserItems(this.#items, this.#scope, this.#search.getValue());
	}

	#selected(): SessionBrowserItem | undefined {
		const filtered = this.#filtered();
		return filtered.find((item) => item.id === this.#selectedId) ?? filtered[0];
	}

	#syncSelection(): void {
		const filtered = this.#filtered();
		if (!filtered.some((item) => item.id === this.#selectedId)) this.#selectedId = filtered[0]?.id;
	}

	#moveSelection(delta: number): void {
		const filtered = this.#filtered();
		if (!filtered.length) return;
		const current = Math.max(0, filtered.findIndex((item) => item.id === this.#selectedId));
		const next = Math.max(0, Math.min(filtered.length - 1, current + delta));
		this.#selectedId = filtered[next]?.id;
	}

	#moveWorkspace(delta: number): void {
		const choices = this.#choices();
		this.#browseIndex = Math.max(0, Math.min(choices.length - 1, this.#browseIndex + delta));
		this.#scope = choices[this.#browseIndex]?.key ?? "recent";
		this.#syncSelection();
	}

	#closeSearch(): void {
		this.#search.setValue("");
		this.#search.focused = false;
		this.#focus = "sessions";
		this.#syncSelection();
	}

	handleInput(data: string): void {
		if (this.#focus === "search") {
			if (this.#keybindings.matches(data, "tui.select.cancel")) {
				this.#closeSearch();
				this.#requestRender();
				return;
			}
			if (this.#keybindings.matches(data, "tui.select.up")) this.#moveSelection(-1);
			else if (this.#keybindings.matches(data, "tui.select.down")) this.#moveSelection(1);
			else if (this.#keybindings.matches(data, "tui.input.submit")) {
				this.#search.focused = false;
				this.#focus = "sessions";
			} else {
				this.#search.handleInput(data);
				this.#syncSelection();
			}
			this.#requestRender();
			return;
		}

		if (this.#keybindings.matches(data, "tui.select.cancel")) {
			if (this.#focus === "detail") this.#focus = "sessions";
			else this.#done(undefined);
			this.#requestRender();
			return;
		}

		const layout = sessionBrowserLayout(this.#tui.terminal.columns);
		if (this.#keybindings.matches(data, "tui.input.tab")) {
			this.#focus = this.#focus === "browse" ? "sessions" : "browse";
			this.#requestRender();
			return;
		}
		if (matchesKey(data, "/") && this.#focus === "sessions" && this.#items.length) {
			this.#focus = "search";
			this.#search.focused = true;
			this.#requestRender();
			return;
		}

		const page = Math.max(1, Math.floor((this.#tui.terminal.rows - 10) / 3));
		if (this.#keybindings.matches(data, "tui.select.up")) {
			if (this.#focus === "browse") this.#moveWorkspace(-1);
			else this.#moveSelection(-1);
		} else if (this.#keybindings.matches(data, "tui.select.down")) {
			if (this.#focus === "browse") this.#moveWorkspace(1);
			else this.#moveSelection(1);
		} else if (this.#keybindings.matches(data, "tui.select.pageUp")) {
			this.#moveSelection(-page);
		} else if (this.#keybindings.matches(data, "tui.select.pageDown")) {
			this.#moveSelection(page);
		} else if (this.#keybindings.matches(data, "tui.select.confirm")) {
			if (this.#focus === "browse") this.#focus = "sessions";
			else {
				const selected = this.#selected();
				if (!selected) return;
				if (layout.mode === "narrow" && this.#focus !== "detail") this.#focus = "detail";
				else if (selected.workspaceExists) this.#done({ sessionPath: selected.path });
			}
		}
		this.#requestRender();
	}

	#paneHeader(title: string, meta: string, width: number, focused: boolean): string[] {
		const left = focused ? this.#theme.fg("accent", this.#theme.bold(title)) : this.#theme.bold(title);
		const right = this.#theme.fg("dim", meta);
		const gap = Math.max(1, width - 6 - plainWidth(left) - plainWidth(right));
		return ["", padded(`   ${left}${" ".repeat(gap)}${right}   `, width), this.#theme.fg("border", "─".repeat(width))];
	}

	#browsePane(width: number, height: number): string[] {
		const focused = this.#focus === "browse";
		const lines = this.#paneHeader("Browse", `${this.#workspaces.length} workspaces`, width, focused);
		const choices = this.#choices();
		const recent = choices[0];
		if (recent) {
			const selected = this.#browseIndex === 0;
			const marker = selected ? this.#theme.fg("borderAccent", "▎") : " ";
			const name = selected ? this.#theme.fg("borderAccent", recent.name) : recent.name;
			const count = this.#theme.fg("dim", String(recent.count));
			const gap = Math.max(1, width - 8 - plainWidth(name) - plainWidth(count));
			lines.push(selectedLine(this.#theme, `  ${marker}${name}${" ".repeat(gap)}${count}   `, width, selected));
		}
		lines.push("", this.#theme.fg("dim", "   WORKSPACES"), "");
		const workspaceCapacity = Math.max(1, Math.floor((height - lines.length) / 3));
		const selectedWorkspace = Math.max(0, this.#browseIndex - 1);
		const workspaceStart = Math.max(
			0,
			Math.min(
				selectedWorkspace - Math.floor(workspaceCapacity / 2),
				this.#workspaces.length - workspaceCapacity,
			),
		);
		for (let index = workspaceStart + 1; index <= Math.min(this.#workspaces.length, workspaceStart + workspaceCapacity); index += 1) {
			const workspace = choices[index];
			if (!workspace) continue;
			const selected = index === this.#browseIndex;
			const marker = selected ? this.#theme.fg("borderAccent", "▎") : " ";
			const name = selected ? this.#theme.fg("borderAccent", workspace.name) : workspace.name;
			lines.push(selectedLine(this.#theme, `  ${marker}${name}`, width, selected));
			lines.push(selectedLine(this.#theme, `  ${marker}${this.#theme.fg("dim", workspace.suffix)}`, width, selected));
			lines.push(selectedLine(this.#theme, `  ${marker}`, width, selected));
		}
		return lines.slice(0, height).concat(Array.from({ length: Math.max(0, height - lines.length) }, () => ""));
	}

	#sessionsHeader(width: number): string[] {
		const scope = this.#scope === "recent"
			? "Recent work"
			: this.#workspaces.find((workspace) => workspace.key === this.#scope)?.name ?? "Sessions";
		if (this.#focus === "search") {
			const inputWidth = Math.max(3, width - 7);
			const input = (this.#search.render(inputWidth)[0] ?? "").slice(2);
			return ["", padded(`   ${this.#theme.fg("accent", "/")} ${input}`, width), this.#theme.fg("border", "─".repeat(width))];
		}
		const hint = this.#items.length ? `${this.#theme.fg("accent", "/")} ${this.#theme.fg("dim", "search")}` : "";
		return this.#paneHeader(scope, hint, width, this.#focus === "sessions");
	}

	#sessionsPane(width: number, height: number, expandSelected = true): string[] {
		const lines = this.#sessionsHeader(width);
		const filtered = this.#filtered();
		if (!filtered.length) {
			lines.push(this.#theme.fg("dim", `   ${this.#items.length ? "No matches" : "No sessions yet"}`));
			return lines.concat(Array.from({ length: Math.max(0, height - lines.length) }, () => "")).slice(0, height);
		}
		const selectedItem = this.#selected();
		const selectedPathLines = expandSelected && selectedItem
			? wrapTextWithAnsi(selectedItem.displayCwd, Math.max(1, width - 4)).slice(0, 2)
			: [];
		const expandedLines = expandSelected ? 1 + selectedPathLines.length : 0;
		const capacity = Math.max(1, Math.floor((height - lines.length - expandedLines) / 3));
		const selectedIndex = Math.max(0, filtered.findIndex((item) => item.id === selectedItem?.id));
		const start = Math.max(0, Math.min(selectedIndex - Math.floor(capacity / 2), filtered.length - capacity));
		for (const item of filtered.slice(start, start + capacity)) {
			const selected = item.id === this.#selected()?.id;
			const marker = selected ? this.#theme.fg("borderAccent", "▎") : " ";
			const title = selected ? this.#theme.fg("borderAccent", item.title) : item.title;
			const time = this.#theme.fg("dim", relativeSessionTime(item.modified));
			const titleWidth = Math.max(1, width - 9 - plainWidth(time));
			const clippedTitle = truncateToWidth(title, titleWidth, "…");
			const gap = Math.max(1, width - 6 - plainWidth(marker) - plainWidth(clippedTitle) - plainWidth(time));
			lines.push(selectedLine(this.#theme, `  ${marker}${clippedTitle}${" ".repeat(gap)}${time}   `, width, selected));
			const workspace = this.#scope === "recent" ? `${this.#theme.fg("mdLink", item.workspaceName)}  ` : "";
			lines.push(selectedLine(this.#theme, `  ${marker}${workspace}${this.#theme.fg("muted", item.summary)}`, width, selected));
			if (selected && expandSelected) {
				const action = item.workspaceExists
					? this.#theme.fg("borderAccent", this.#theme.bold("enter  Resume session →"))
					: this.#theme.fg("warning", "! Workspace missing");
				for (const pathLine of selectedPathLines) {
					lines.push(selectedLine(this.#theme, `  ${marker}${this.#theme.fg("mdLink", pathLine)}`, width, true));
				}
				lines.push(selectedLine(this.#theme, `  ${marker}${this.#theme.fg("dim", `${item.messageCount} messages`)}   ${action}`, width, true));
			}
			lines.push(selectedLine(this.#theme, `  ${marker}`, width, selected));
		}
		return lines.concat(Array.from({ length: Math.max(0, height - lines.length) }, () => "")).slice(0, height);
	}

	#detailPane(width: number, height: number, narrow: boolean): string[] {
		const selected = this.#selected();
		if (!selected) return Array.from({ length: height }, () => "");
		const inset = narrow ? 3 : 6;
		const contentWidth = Math.max(1, width - inset * 2);
		const line = (value = "") => `${" ".repeat(inset)}${padded(value, contentWidth)}${" ".repeat(inset)}`;
		const title = wrapTextWithAnsi(this.#theme.bold(selected.title), contentWidth).slice(0, 2);
		const path = wrapTextWithAnsi(this.#theme.fg("mdLink", selected.displayCwd), contentWidth);
		const summary = wrapTextWithAnsi(this.#theme.fg("muted", selected.summary), contentWidth).slice(0, narrow ? 2 : 3);
		const lines = [
			"",
			"",
			line(this.#theme.fg("dim", `SESSION · ${relativeSessionTime(selected.modified)}`)),
			"",
			...title.map(line),
			"",
			...path.map(line),
			"",
			"",
			...summary.map(line),
			"",
			"",
			line(this.#theme.fg("dim", `${selected.messageCount} messages`)),
			"",
			"",
		];
		if (selected.workspaceExists) lines.push(line(this.#theme.fg("borderAccent", this.#theme.bold("Resume session →"))));
		else lines.push(line(this.#theme.fg("warning", "! Workspace missing")));
		return lines.concat(Array.from({ length: Math.max(0, height - lines.length) }, () => "")).slice(0, height);
	}

	#footer(width: number, layoutMode: "wide" | "medium" | "narrow"): string[] {
		if (!this.#items.length) return ["", ""];
		let hints: readonly [string, string][];
		const selected = this.#selected();
		if (this.#focus === "search") hints = [["esc", "close search"]];
		else if (this.#focus === "detail")
			hints = selected?.workspaceExists ? [["enter", "resume"], ["esc", "sessions"]] : [["esc", "sessions"]];
		else if (this.#focus === "browse") hints = [["↑/↓", "filter"], ["tab", "sessions"]];
		else {
			const sessionHints: [string, string][] = [["↑/↓", "move"], ["/", "search"]];
			if (selected?.workspaceExists) {
				sessionHints.push(["enter", layoutMode === "narrow" ? "details" : "resume"]);
			}
			sessionHints.push(["tab", "workspace"]);
			hints = sessionHints;
		}
		const text = hints
			.map(([key, label]) => `${this.#theme.fg("accent", key)} ${this.#theme.fg("dim", label)}`)
			.join(this.#theme.fg("dim", "   "));
		return [this.#theme.fg("border", "─".repeat(width)), padded(`   ${text}`, width)];
	}

	render(width: number): string[] {
		const layout = sessionBrowserLayout(width);
		const height = Math.max(12, this.#tui.terminal.rows - 2);
		const bodyHeight = Math.max(6, height - 2);
		const divider = this.#theme.fg("border", "│");
		let body: string[];
		if (layout.mode === "wide") {
			body = joinColumns(
				[
					this.#browsePane(layout.browseWidth - 1, bodyHeight),
					this.#sessionsPane(layout.sessionsWidth, bodyHeight),
				],
				[layout.browseWidth, layout.sessionsWidth],
				divider,
			);
		} else if (layout.mode === "medium") {
			body = joinColumns(
				[
					this.#browsePane(layout.browseWidth - 1, bodyHeight),
					this.#sessionsPane(layout.sessionsWidth, bodyHeight),
				],
				[layout.browseWidth, layout.sessionsWidth],
				divider,
			);
		} else if (this.#focus === "browse") body = this.#browsePane(layout.shellWidth, bodyHeight);
		else if (this.#focus === "detail") body = this.#detailPane(layout.shellWidth, bodyHeight, true);
		else body = this.#sessionsPane(layout.shellWidth, bodyHeight, false);

		const shell = [...body, ...this.#footer(layout.shellWidth, layout.mode)].slice(0, height);
		return shell.map((line) => `${" ".repeat(layout.offset)}${padded(line, layout.shellWidth)}`);
	}
}

async function loadSessions(): Promise<readonly SessionBrowserItem[]> {
	const sessions = await SessionManager.listAll();
	return buildSessionBrowserItems(sessions.map(toBrowserRecord));
}

export default function sessionsExtension(pi: ExtensionAPI): void {
	pi.registerCommand("sessions", {
		description: "Browse and resume sessions across workspaces",
		handler: async (_args, ctx) => {
			if (ctx.mode !== "tui") {
				ctx.ui.notify("Sessions requires interactive mode", "warning");
				return;
			}
			let items: readonly SessionBrowserItem[];
			try {
				items = await loadSessions();
			} catch (error) {
				ctx.ui.notify(
					`Couldn’t load sessions: ${error instanceof Error ? error.message : String(error)}`,
					"error",
				);
				return;
			}
			const result = await ctx.ui.custom<BrowserResult>((tui, theme, keybindings, done) =>
				new SessionsBrowser(
					tui,
					theme,
					keybindings as unknown as KeybindingsManager,
					done,
					items,
				),
			);
			if (!result) return;
			try {
				await ctx.switchSession(result.sessionPath);
			} catch (error) {
				ctx.ui.notify(
					`Couldn’t resume session: ${error instanceof Error ? error.message : String(error)}`,
					"error",
				);
			}
		},
	});
}

export { loadSessions, recentUserText, SessionsBrowser, toBrowserRecord };
