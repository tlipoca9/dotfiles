import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";

import {
	type ExtensionAPI,
	type ExtensionContext,
	type RootViewActions,
	type RootViewComposer,
	type SessionEntry,
	type SessionInfo,
	SessionManager,
	type Theme,
} from "@earendil-works/pi-coding-agent";
import {
	BubbleBinding,
	BubbleList,
	BubbleSpinner,
	BubbleTextInput,
	BubbleTimeline,
	BubbleViewport,
	compositeBubbleLayer,
	type Component,
	matchesKey,
	renderBubbleHelp,
	stripTerminalSequences,
	type TUI,
	truncateToWidth,
	visibleWidth,
	wrapTextWithAnsi,
} from "@earendil-works/pi-tui";

const MAIN_TARGET = "__main_agent__";
const ACTIVE_STATES = new Set([
	"pending",
	"queued",
	"running",
	"paused",
	"stopping",
]);
const POLL_INTERVAL_MS = 500;

interface WorkspaceConfig {
	maxVisibleSubagents: number;
	recentOutputLines: number;
}

interface AsyncStartedEvent {
	id?: string;
	asyncDir?: string;
	agent?: string;
	agents?: string[];
	goal?: string;
	task?: string;
}

interface AsyncStatusStep {
	childId?: string;
	agent?: string;
	description?: string;
	label?: string;
	phase?: string;
	status?: string;
	runId?: string;
	workflowKey?: string;
	model?: string;
	thinking?: string;
	effort?: string;
	currentTool?: string;
	recentOutput?: string[] | string;
	startedAt?: number;
	tokens?: { total?: number };
}

interface AsyncStatus {
	state?: string;
	mode?: string;
	agent?: string;
	agents?: string[];
	goal?: string;
	task?: string;
	currentTool?: string;
	recentOutput?: string[] | string;
	startedAt?: number;
	steps?: AsyncStatusStep[];
}

interface TrackedRun {
	id: string;
	asyncDir: string;
	goal: string;
	agents: string[];
	startedAt: number;
	status?: AsyncStatus;
}

interface AgentRow {
	key: string;
	runId: string;
	index: number;
	childId?: string;
	agent: string;
	goal: string;
	state: string;
	model?: string;
	thinking?: string;
	currentTool?: string;
	recentOutput: string[];
	startedAt: number;
	tokens?: number;
	childCount: number;
}

type QueueMode = "auto" | "steer";

interface QueuedMessage {
	id: string;
	targetKey: string;
	text: string;
	sourceText: string;
	mode: QueueMode;
	createdAt: number;
	state: "queued" | "editing" | "sending" | "failed";
	error?: string;
}

interface WorkspaceSummary {
	id: string;
	cwd: string;
	name: string;
	path: string;
	latest: number;
	count: number;
}

interface WorkspaceScope {
	id: string;
	label: string;
	path?: string;
	count: number;
}

interface ActivityLine {
	id: string;
	label: string;
	state: "done" | "running" | "error";
}

interface PerformanceSample {
	requestStartedAt?: number;
	firstTokenAt?: number;
	lastTokenAt?: number;
	ttftMs?: number;
	tokensPerSecond?: number;
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	cost: number;
}

interface SubagentUiEvent {
	version?: number;
	kind?: string;
	runId?: string;
	childId?: string;
	stepIndex?: number;
	agent?: string;
	model?: string;
	thinking?: string;
	delta?: string;
	replace?: boolean;
	text?: string;
	toolCallId?: string;
	toolName?: string;
	summary?: string;
	isError?: boolean;
}

type RpcMethod = "status" | "steer" | "stop";

type RpcReply =
	| { success: true; data: unknown }
	| { success: false; error: { code?: string; message?: string } };

type Screen = "overview" | "conversation" | "agent";
type ConversationFocus = "composer" | "agents" | "queue" | "stop" | "redirect";
type OverviewFocus = "workspaces" | "sessions" | "search" | "detail";

function configPath(): string {
	return join(
		process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent"),
		"extensions",
		"workspace-ui.json",
	);
}

async function listWorkspaceSessions(): Promise<SessionInfo[]> {
	const root = join(
		process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent"),
		"sessions",
	);
	const directories = (await readdir(root, { withFileTypes: true }))
		.filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
		.map((entry) => join(root, entry.name));
	const sessions = (
		await Promise.all(
			directories.map((directory) => SessionManager.listAll(directory)),
		)
	).flat();
	return sessions.sort(
		(left, right) => right.modified.getTime() - left.modified.getTime(),
	);
}

function positiveInteger(value: unknown, fallback: number): number {
	return typeof value === "number" && Number.isInteger(value) && value > 0
		? value
		: fallback;
}

function loadConfig(): WorkspaceConfig {
	try {
		const parsed = JSON.parse(
			readFileSync(configPath(), "utf8"),
		) as Partial<WorkspaceConfig>;
		return {
			maxVisibleSubagents: positiveInteger(parsed.maxVisibleSubagents, 8),
			recentOutputLines: positiveInteger(parsed.recentOutputLines, 3),
		};
	} catch {
		return { maxVisibleSubagents: 8, recentOutputLines: 3 };
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanText(value: unknown): string {
	if (typeof value !== "string") return "";
	const sanitized = stripTerminalSequences(value)
		.replace(/<skill\b[\s\S]*?<\/skill>/gi, "")
		.replace(
			/<in-app-browser-context\b[\s\S]*?<\/in-app-browser-context>/gi,
			"",
		)
		.replace(/\bBearer\s+\S+/gi, "Bearer [redacted]")
		.replace(
			/\b(?:sk|ghp|github_pat|xox[baprs]|tai_pat)[-_\w]{8,}\b/gi,
			"[redacted]",
		);
	return [...sanitized]
		.filter((character) => {
			const code = character.codePointAt(0) ?? 0;
			return (
				code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127)
			);
		})
		.join("")
		.trim();
}

function firstLine(value: unknown): string {
	return (
		cleanText(value)
			.split(/\r?\n/)
			.map((line) => line.trim())
			.find(
				(line) =>
					Boolean(line) &&
					!line.startsWith("<") &&
					!line.startsWith("## My request"),
			) ?? ""
	);
}

function outputLines(
	value: string[] | string | undefined,
	limit: number,
): string[] {
	const source = Array.isArray(value)
		? value
		: typeof value === "string"
			? value.split(/\r?\n/)
			: [];
	return source.map(cleanText).filter(Boolean).slice(-limit);
}

function normalizePath(value: string): string {
	return resolve(value || "/");
}

function homeRelative(value: string): string {
	const normalized = normalizePath(value);
	const home = normalizePath(homedir());
	if (normalized === home) return "~";
	return normalized.startsWith(`${home}/`)
		? `~/${normalized.slice(home.length + 1)}`
		: normalized;
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

function uniquePathSuffix(target: string, allPaths: readonly string[]): string {
	const rendered = allPaths.map(homeRelative);
	const wanted = homeRelative(target);
	const parts = wanted.split("/").filter(Boolean);
	for (let length = 2; length <= parts.length; length++) {
		const candidate = parts.slice(-length).join("/");
		if (rendered.filter((value) => value.endsWith(candidate)).length === 1) {
			return wanted.startsWith("~/") ? `~/${candidate}` : `…/${candidate}`;
		}
	}
	return wanted;
}

function relativeTime(date: Date, now = Date.now()): string {
	const minutes = Math.floor(Math.max(0, now - date.getTime()) / 60_000);
	if (minutes < 1) return "now";
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h`;
	const days = Math.floor(hours / 24);
	if (days < 7) return `${days}d`;
	return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatDuration(startedAt: number, now = Date.now()): string {
	const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));
	if (seconds < 60) return `${seconds.toString().padStart(2, "0")}s`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m`;
	return `${Math.floor(minutes / 60)}h`;
}

function compactTokens(value: number): string {
	if (value < 1_000) return String(value);
	if (value < 1_000_000)
		return `${(value / 1_000).toFixed(value < 10_000 ? 1 : 0)}k`;
	return `${(value / 1_000_000).toFixed(1)}m`;
}

function shortModel(value: string | undefined): string {
	if (!value) return "";
	return value.includes("/") ? value.slice(value.lastIndexOf("/") + 1) : value;
}

function plainMarkdown(value: string): string {
	return cleanText(value)
		.replace(/^#{1,6}\s+/gm, "")
		.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
		.replace(/\*\*([^*]+)\*\*/g, "$1")
		.replace(/__([^_]+)__/g, "$1")
		.replace(/`([^`]+)`/g, "$1")
		.replace(/^```\w*$/gm, "")
		.trim();
}

function pad(value: string, width: number): string {
	const clipped = truncateToWidth(value, Math.max(0, width));
	return clipped + " ".repeat(Math.max(0, width - visibleWidth(clipped)));
}

function alignRight(left: string, right: string, width: number): string {
	const clippedRight = truncateToWidth(right, Math.max(1, width - 1));
	const leftWidth = Math.max(1, width - visibleWidth(clippedRight) - 1);
	const clippedLeft = truncateToWidth(left, leftWidth);
	return `${clippedLeft}${" ".repeat(Math.max(1, width - visibleWidth(clippedLeft) - visibleWidth(clippedRight)))}${clippedRight}`;
}

function joinColumns(
	theme: Theme,
	columns: string[][],
	widths: number[],
	height: number,
): string[] {
	const separator = theme.fg("borderMuted", "│");
	return Array.from({ length: height }, (_, row) =>
		columns
			.map((column, index) => pad(column[row] ?? "", widths[index] ?? 0))
			.join(separator),
	);
}

function workspaceSummaries(
	sessions: readonly SessionInfo[],
): WorkspaceSummary[] {
	const groups = new Map<string, SessionInfo[]>();
	for (const session of sessions) {
		const cwd = normalizePath(session.cwd || "/");
		groups.set(cwd, [...(groups.get(cwd) ?? []), session]);
	}
	const paths = [...groups.keys()];
	return paths
		.map((cwd) => {
			const items = groups.get(cwd) ?? [];
			return {
				id: cwd,
				cwd,
				name: basename(cwd) || cwd,
				path: uniquePathSuffix(cwd, paths),
				latest: Math.max(...items.map((session) => session.modified.getTime())),
				count: items.length,
			};
		})
		.sort((left, right) => right.latest - left.latest);
}

function titleFor(session: SessionInfo): string {
	return (
		session.name?.trim() ||
		firstLine(session.firstMessage) ||
		"Untitled session"
	);
}

function summaryFor(session: SessionInfo): string {
	const first = firstLine(session.firstMessage);
	return session.name?.trim() && first !== session.name.trim() ? first : "";
}

function readStatus(run: TrackedRun): AsyncStatus | undefined {
	try {
		const parsed = JSON.parse(
			readFileSync(join(run.asyncDir, "status.json"), "utf8"),
		);
		return isRecord(parsed) ? (parsed as AsyncStatus) : undefined;
	} catch {
		return run.status;
	}
}

function rowsForRun(run: TrackedRun, config: WorkspaceConfig): AgentRow[] {
	const status = run.status ?? {};
	const steps = status.steps;
	if (steps?.length) {
		return steps.flatMap((step, index) => {
			const state = step.status || status.state || "running";
			if (!ACTIVE_STATES.has(state)) return [];
			return [
				{
					key: `${run.id}:${index}`,
					runId: run.id,
					index,
					childId:
						step.childId || step.workflowKey || step.runId || `step:${index}`,
					agent:
						cleanText(step.agent) ||
						run.agents[index] ||
						run.agents[0] ||
						"subagent",
					goal: firstLine(
						step.description ||
							step.label ||
							step.phase ||
							status.goal ||
							status.task ||
							run.goal,
					),
					state,
					model: cleanText(step.model) || undefined,
					thinking: cleanText(step.thinking || step.effort) || undefined,
					currentTool:
						cleanText(step.currentTool || status.currentTool) || undefined,
					recentOutput: outputLines(
						step.recentOutput || status.recentOutput,
						config.recentOutputLines,
					),
					startedAt: step.startedAt || status.startedAt || run.startedAt,
					tokens: step.tokens?.total,
					childCount: steps.length,
				},
			];
		});
	}
	const state = status?.state || "running";
	if (!ACTIVE_STATES.has(state)) return [];
	const agents = run.agents.length ? run.agents : [status?.agent || "subagent"];
	return agents.map((agent, index) => ({
		key: `${run.id}:${index}`,
		runId: run.id,
		index,
		agent: cleanText(agent) || "subagent",
		goal: firstLine(status?.goal || status?.task || run.goal),
		state,
		currentTool: cleanText(status?.currentTool) || undefined,
		recentOutput: outputLines(status?.recentOutput, config.recentOutputLines),
		startedAt: status?.startedAt || run.startedAt,
		childCount: agents.length,
	}));
}

class WorkspaceStore {
	private readonly runs = new Map<string, TrackedRun>();
	readonly queue: QueuedMessage[] = [];
	readonly activity: ActivityLine[] = [];
	readonly performance: PerformanceSample = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
	readonly completedActivities: Array<{ text: string; activity: ActivityLine[] }> = [];
	sessions: SessionInfo[] = [];
	modelId = "";
	thinking = "";
	streamingText = "";

	constructor(readonly config: WorkspaceConfig) {}

	track(event: AsyncStartedEvent): void {
		const id = cleanText(event.id);
		const asyncDir = typeof event.asyncDir === "string" ? event.asyncDir : "";
		if (!id || !asyncDir) return;
		const agents = Array.isArray(event.agents)
			? event.agents.map(cleanText).filter(Boolean)
			: event.agent
				? [cleanText(event.agent)]
				: [];
		this.runs.set(id, {
			id,
			asyncDir,
			goal: firstLine(event.goal || event.task),
			agents,
			startedAt: Date.now(),
		});
	}

	recover(raw: unknown): void {
		if (!isRecord(raw) || !isRecord(raw.asyncSnapshot) || !Array.isArray(raw.asyncSnapshot.runs)) return;
		for (const candidate of raw.asyncSnapshot.runs) {
			if (!isRecord(candidate) || typeof candidate.id !== "string" || (candidate.state !== "running" && candidate.state !== "queued")) continue;
			const children = Array.isArray(candidate.children) ? candidate.children.filter(isRecord) : [];
			const steps: AsyncStatusStep[] = children.map((child, index) => ({
				workflowKey: typeof child.id === "string" ? child.id : `step:${index}`,
				agent: typeof child.label === "string" ? child.label : "subagent",
				status: child.state === "queued" ? "pending" : "running",
				startedAt: typeof child.startedAt === "number" ? child.startedAt : undefined,
				currentTool: isRecord(child.activity) && typeof child.activity.currentTool === "string" ? child.activity.currentTool : undefined,
			}));
			this.runs.set(candidate.id, {
				id: candidate.id,
				asyncDir: "",
				goal: typeof candidate.label === "string" ? candidate.label : "",
				agents: steps.map((step) => step.agent ?? "subagent"),
				startedAt: typeof candidate.startedAt === "number" ? candidate.startedAt : Date.now(),
				status: { state: candidate.state, steps },
			});
		}
	}

	refreshRuns(): void {
		for (const run of this.runs.values()) run.status = readStatus(run);
	}

	agents(): AgentRow[] {
		return [...this.runs.values()]
			.flatMap((run) => rowsForRun(run, this.config))
			.sort((left, right) => right.startedAt - left.startedAt);
	}

	queueMessage(
		targetKey: string,
		text: string,
		sourceText = text,
		existingId?: string,
	): QueuedMessage {
		const existing = existingId
			? this.queue.find((item) => item.id === existingId)
			: undefined;
		if (existing) {
			existing.targetKey = targetKey;
			existing.text = text;
			existing.sourceText = sourceText;
			existing.state = "queued";
			existing.error = undefined;
			return existing;
		}
		const item: QueuedMessage = {
			id: randomUUID(),
			targetKey,
			text,
			sourceText,
			mode: "auto",
			createdAt: Date.now(),
			state: "queued",
		};
		this.queue.push(item);
		return item;
	}

	addActivity(id: string, label: string, state: ActivityLine["state"]): void {
		const existing = this.activity.find((item) => item.id === id);
		if (existing) {
			existing.label = label;
			existing.state = state;
		} else {
			this.activity.push({ id, label, state });
		}
		while (this.activity.length > 12) this.activity.shift();
	}

	finishAssistant(text: string): void {
		if (text && this.activity.length) {
			this.completedActivities.push({ text, activity: this.activity.map((item) => ({ ...item })) });
			while (this.completedActivities.length > 24) this.completedActivities.shift();
		}
		this.activity.length = 0;
	}
}

function rpc(
	pi: ExtensionAPI,
	method: RpcMethod,
	params: Record<string, unknown>,
): Promise<unknown> {
	const requestId = randomUUID();
	return new Promise((resolve, reject) => {
		let settled = false;
		const unsubscribe = pi.events.on(
			`subagents:rpc:v1:reply:${requestId}`,
			(raw) => {
				if (settled) return;
				settled = true;
				clearTimeout(timer);
				unsubscribe?.();
				if (!isRecord(raw))
					return reject(new Error("pi-subagents returned an invalid reply"));
				const reply = raw as RpcReply;
				if (reply.success) resolve(reply.data);
				else
					reject(
						new Error(reply.error?.message || "pi-subagents request failed"),
					);
			},
		);
		const timer = setTimeout(() => {
			if (settled) return;
			settled = true;
			unsubscribe?.();
			reject(new Error("pi-subagents did not reply within 10 seconds"));
		}, 10_000);
		pi.events.emit("subagents:rpc:v1:request", {
			version: 1,
			requestId,
			method,
			params,
			source: { extension: "workspace-shell" },
		});
	});
}

function messageText(
	entry: SessionEntry,
): { role: string; text: string } | undefined {
	if (entry.type === "compaction" || entry.type === "branch_summary") {
		return { role: "EVENT", text: entry.summary };
	}
	if (entry.type === "custom_message" && entry.display) {
		const text =
			typeof entry.content === "string"
				? entry.content
				: entry.content
						.flatMap((part) => ("text" in part ? [part.text] : []))
						.join("\n");
		return { role: "EVENT", text };
	}
	if (entry.type !== "message") return undefined;
	const message = entry.message;
	if (message.role === "user") {
		const text =
			typeof message.content === "string"
				? message.content
				: message.content
						.flatMap((part) => (part.type === "text" ? [part.text] : []))
						.join("\n");
		return { role: "YOU", text };
	}
	if (message.role === "assistant") {
		const text = message.content
			.flatMap((part) => (part.type === "text" ? [part.text] : []))
			.join("\n");
		return text ? { role: "PI", text } : undefined;
	}
	if (message.role === "bashExecution")
		return { role: "SHELL", text: `$ ${message.command}` };
	return undefined;
}

class WorkspaceShell implements Component {
	private screen: Screen;
	private conversationFocus: ConversationFocus = "composer";
	private overviewFocus: OverviewFocus = "sessions";
	private readonly spinner = new BubbleSpinner();
	private readonly childTimelines = new Map<string, BubbleTimeline>();
	private readonly childTurns = new Map<string, number>();
	private readonly hiddenAgentKeys = new Set<string>();
	private readonly search = new BubbleTextInput({
		placeholder: "filter by intent, workspace, or path",
	});
	private readonly transcript = new BubbleViewport(8);
	private workspaceList = new BubbleList<WorkspaceScope>({
		height: 6,
		filterValue: (item) => `${item.label} ${item.path ?? ""}`,
		itemKey: (item) => item.id,
	});
	private sessionList = new BubbleList<SessionInfo>({
		height: 8,
		filterValue: (item) => `${titleFor(item)} ${summaryFor(item)} ${item.cwd}`,
		itemKey: (item) => item.path,
	});
	private agentList = new BubbleList<AgentRow>({
		height: 8,
		filterValue: (item) => `${item.agent} ${item.goal}`,
		itemKey: (item) => item.key,
	});
	private selectedQueue = 0;
	private editingQueueId: string | undefined;
	private confirmStopKey: string | undefined;
	private redirectQueueId: string | undefined;
	private readonly drafts = new Map<string, string>();
	private readonly stoppedEvents: string[] = [];
	private statusMessage = "";
	private statusUntil = 0;
	private sessionLoadError = "";
	private timer: ReturnType<typeof setInterval>;

	constructor(
		private readonly pi: ExtensionAPI,
		private readonly ctx: ExtensionContext,
		private readonly store: WorkspaceStore,
		private readonly tui: TUI,
		private readonly theme: Theme,
		private readonly actions: RootViewActions,
		private readonly composer: RootViewComposer,
		initialScreen: Screen,
	) {
		this.screen = initialScreen;
		this.composer.setSubmitHandler((text) => this.submitComposer(text));
		this.updateSessions();
		this.updateAgents();
		this.transcript.goToEnd();
		this.timer = setInterval(() => {
			this.store.refreshRuns();
			this.updateAgents();
			this.tui.requestRender();
		}, POLL_INTERVAL_MS);
	}

	setSessions(sessions: SessionInfo[]): void {
		this.sessionLoadError = "";
		this.store.sessions = [...sessions].sort(
			(left, right) => right.modified.getTime() - left.modified.getTime(),
		);
		this.updateSessions();
		this.tui.requestRender();
	}

	setSessionLoadError(error: unknown): void {
		this.sessionLoadError =
			error instanceof Error ? error.message : String(error);
		this.tui.requestRender();
	}

	requestRender(): void {
		this.tui.requestRender();
	}

	showConversation(): void {
		this.screen = "conversation";
		this.tui.requestRender();
	}

	recoverSubagents(raw: unknown): void {
		this.store.recover(raw);
		this.updateAgents();
		this.tui.requestRender();
	}

	applySubagentEvent(event: SubagentUiEvent): void {
		if (event.version !== 1 || !event.runId || typeof event.stepIndex !== "number") return;
		const row = this.store.agents().find((agent) => agent.runId === event.runId && (agent.index === event.stepIndex || agent.childId === event.childId));
		if (!row) return;
		if (event.model) row.model = event.model;
		if (event.thinking) row.thinking = event.thinking;
		let timeline = this.childTimelines.get(row.key);
		if (!timeline) {
			timeline = new BubbleTimeline();
			this.childTimelines.set(row.key, timeline);
		}
		const turn = this.childTurns.get(row.key) ?? 0;
		const textId = `${row.key}:turn:${turn}`;
		if (event.kind === "message-delta" && event.delta !== undefined) timeline.streamText(textId, event.delta, event.replace === true);
		else if (event.kind === "message-end") timeline.endText(textId, event.text);
		else if (event.kind === "tool-start" && event.toolCallId && event.toolName) timeline.startTool({ id: event.toolCallId, name: event.toolName, summary: event.summary, textId });
		else if (event.kind === "tool-update" && event.toolCallId) timeline.updateTool(event.toolCallId, event.summary);
		else if (event.kind === "tool-end" && event.toolCallId) timeline.endTool(event.toolCallId, event.isError === true);
		else if (event.kind === "turn-end") {
			this.childTurns.set(row.key, turn + 1);
			void this.flushTargetQueue(row.key);
		}
		this.tui.requestRender();
	}

	handleChildStatus(raw: Record<string, unknown>): void {
		if (raw.version !== 1 || raw.status !== "stopped" || typeof raw.runId !== "string") return;
		const row = this.store.agents().find((agent) => agent.runId === raw.runId && (agent.childId === raw.childId || agent.index === raw.stepIndex));
		if (!row) return;
		this.hiddenAgentKeys.add(row.key);
		this.stoppedEvents.push(`${row.agent} stopped by you · completed work kept`);
		if (this.screen === "agent" && this.agentList.selected()?.key === row.key) this.screen = "conversation";
		this.updateAgents();
		this.tui.requestRender();
	}

	private async flushTargetQueue(targetKey: string): Promise<void> {
		const item = this.store.queue.find((candidate) => candidate.targetKey === targetKey && candidate.state === "queued");
		if (!item) return;
		item.state = "sending";
		try {
			await this.sendToSubagent(item, "auto");
			this.removeQueue(item.id);
		} catch (error) {
			item.state = "failed";
			item.error = error instanceof Error ? error.message : String(error);
		}
		this.tui.requestRender();
	}

	async flushMainQueue(): Promise<void> {
		const item = this.store.queue.find(
			(candidate) => candidate.targetKey === MAIN_TARGET,
		);
		if (item?.state !== "queued") return;
		item.state = "sending";
		try {
			await this.actions.submit(item.text);
			this.removeQueue(item.id);
		} catch (error) {
			item.state = "failed";
			item.error = error instanceof Error ? error.message : String(error);
		}
		this.tui.requestRender();
	}

	private setStatus(message: string): void {
		this.statusMessage = message;
		this.statusUntil = Date.now() + 2200;
	}

	private updateAgents(): void {
		this.agentList.setItems(this.store.agents().filter((agent) => !this.hiddenAgentKeys.has(agent.key)));
		this.agentList.setHeight(this.store.config.maxVisibleSubagents);
	}

	private updateSessions(): void {
		const workspaces = workspaceSummaries(this.store.sessions);
		const scopes: WorkspaceScope[] = [
			{ id: "recent", label: "Recent work", count: this.store.sessions.length },
			...workspaces.map((workspace) => ({
				id: workspace.id,
				label: workspace.name,
				path: workspace.path,
				count: workspace.count,
			})),
		];
		const selectedId = this.workspaceList.selected()?.id ?? "recent";
		this.workspaceList.setItems(scopes);
		while (
			this.workspaceList.selected()?.id !== selectedId &&
			this.workspaceList.selectedIndex() < scopes.length - 1
		) {
			this.workspaceList.move(1);
		}
		this.applySessionScope();
	}

	private applySessionScope(): void {
		const scope = this.workspaceList.selected()?.id ?? "recent";
		const sessions =
			scope === "recent"
				? this.store.sessions
				: this.store.sessions.filter(
						(session) => normalizePath(session.cwd) === scope,
					);
		this.sessionList.setItems(sessions);
		this.sessionList.setFilter(this.search.text());
	}

	private currentTarget(): string {
		return this.screen === "agent"
			? (this.agentList.selected()?.key ?? MAIN_TARGET)
			: MAIN_TARGET;
	}

	private saveDraft(): void {
		this.drafts.set(this.currentTarget(), this.composer.getText());
	}

	private restoreDraft(): void {
		this.composer.setText(this.drafts.get(this.currentTarget()) ?? "");
	}

	private targetQueue(): QueuedMessage[] {
		const target = this.currentTarget();
		return this.store.queue.filter((item) => item.targetKey === target);
	}

	private selectedQueued(): QueuedMessage | undefined {
		return this.targetQueue()[this.selectedQueue];
	}

	private removeQueue(id: string): void {
		const index = this.store.queue.findIndex((item) => item.id === id);
		if (index >= 0) this.store.queue.splice(index, 1);
		this.selectedQueue = Math.max(
			0,
			Math.min(this.selectedQueue, this.targetQueue().length - 1),
		);
	}

	private reorderQueue(delta: number): void {
		const item = this.selectedQueued();
		if (!item) return;
		const siblings = this.targetQueue();
		const siblingIndex = siblings.indexOf(item);
		const nextSiblingIndex = Math.max(
			0,
			Math.min(siblings.length - 1, siblingIndex + delta),
		);
		const target = siblings[nextSiblingIndex];
		if (!target || target === item) return;
		const from = this.store.queue.indexOf(item);
		const to = this.store.queue.indexOf(target);
		this.store.queue[from] = target;
		this.store.queue[to] = item;
		this.selectedQueue = nextSiblingIndex;
	}

	private async redirectSelected(): Promise<void> {
		const item = this.selectedQueued();
		if (!item) return;
		item.mode = "steer";
		item.state = "sending";
		try {
			if (item.targetKey === MAIN_TARGET) {
				this.pi.sendUserMessage(item.text, {
					deliverAs: "steer",
					expandPromptTemplates: true,
				});
			} else {
				await this.sendToSubagent(item, "steer");
			}
			this.removeQueue(item.id);
			this.setStatus("Redirected now");
		} catch (error) {
			item.state = "failed";
			item.error = error instanceof Error ? error.message : String(error);
		}
		this.redirectQueueId = undefined;
		this.conversationFocus = "queue";
		this.tui.requestRender();
	}

	private async sendSelected(): Promise<void> {
		const item = this.selectedQueued();
		if (!item || item.targetKey === MAIN_TARGET) return;
		item.mode = "auto";
		item.state = "sending";
		try {
			await this.sendToSubagent(item, "auto");
			this.removeQueue(item.id);
			this.setStatus("Sent to subagent");
		} catch (error) {
			item.state = "failed";
			item.error = error instanceof Error ? error.message : String(error);
		}
		this.tui.requestRender();
	}

	private async sendToSubagent(
		item: QueuedMessage,
		mode: QueueMode,
	): Promise<void> {
		const target = this.store
			.agents()
			.find((row) => row.key === item.targetKey);
		if (!target) throw new Error("Target subagent is no longer active");
		await rpc(this.pi, "steer", {
			id: target.runId,
			message: item.text,
			mode,
			...(target.childCount > 1 ? { index: target.index } : {}),
		});
	}

	private async stopSelected(): Promise<void> {
		const target = this.store
			.agents()
			.find((row) => row.key === this.confirmStopKey);
		this.confirmStopKey = undefined;
		this.conversationFocus = "agents";
		if (!target) return;
		try {
			await rpc(this.pi, "stop", {
				id: target.runId,
				...(target.childCount > 1 && target.childId
					? { childId: target.childId }
					: {}),
			});
			this.stoppedEvents.push(
				`${target.agent} stopped by you · completed work kept`,
			);
			this.screen = "conversation";
			this.setStatus(`Stopping ${target.agent}`);
		} catch (error) {
			this.setStatus(error instanceof Error ? error.message : String(error));
		}
		this.tui.requestRender();
	}

	private async submitComposer(rawText: string): Promise<void> {
		const sourceText = rawText.trim();
		if (!sourceText) return;
		const expandedText = sourceText.startsWith("/") ? this.actions.expandPrompt(sourceText) : sourceText;
		if (sourceText.startsWith("/") && expandedText === sourceText) {
			await this.actions.submit(sourceText);
			return;
		}
		const text = expandedText;
		if (!text) return;
		const target = this.currentTarget();
		if (this.editingQueueId) {
			this.store.queueMessage(target, text, sourceText, this.editingQueueId);
			this.editingQueueId = undefined;
			this.composer.addToHistory(sourceText);
			this.composer.setText("");
			this.conversationFocus = "queue";
			return;
		}
		this.composer.addToHistory(sourceText);
		this.composer.setText("");
		this.drafts.delete(target);
		if (target === MAIN_TARGET && this.ctx.isIdle()) {
			await this.actions.submit(text);
			return;
		}
		this.store.queueMessage(target, text, sourceText);
		this.selectedQueue = this.targetQueue().length - 1;
		this.conversationFocus = "queue";
	}

	private handleQueueInput(data: string): void {
		const queue = this.targetQueue();
		if (matchesKey(data, "escape")) {
			this.conversationFocus = "composer";
			return;
		}
		if (matchesKey(data, "up") || data === "k")
			this.selectedQueue = Math.max(0, this.selectedQueue - 1);
		else if (matchesKey(data, "down") || data === "j")
			this.selectedQueue = Math.min(queue.length - 1, this.selectedQueue + 1);
		else if (data === "K" || matchesKey(data, "alt+up")) this.reorderQueue(-1);
		else if (data === "J" || matchesKey(data, "alt+down")) this.reorderQueue(1);
		else if (matchesKey(data, "enter")) {
			const item = this.selectedQueued();
			if (!item) return;
			item.state = "editing";
			this.editingQueueId = item.id;
			this.composer.setText(item.sourceText);
			this.conversationFocus = "composer";
		} else if (data === "r") {
			const item = this.selectedQueued();
			if (item) {
				this.redirectQueueId = item.id;
				this.conversationFocus = "redirect";
			}
		} else if (data === "s" && this.currentTarget() !== MAIN_TARGET) {
			void this.sendSelected();
		} else if (data === "x") {
			const item = this.selectedQueued();
			if (item) this.removeQueue(item.id);
		}
	}

	private handleOverviewInput(data: string): void {
		if (this.overviewFocus === "detail") {
			if (matchesKey(data, "escape")) this.overviewFocus = "sessions";
			else if (matchesKey(data, "enter")) {
				const selected = this.sessionList.selected();
				if (selected) void this.actions.resumeSession(selected.path);
			}
			return;
		}
		if (this.overviewFocus === "search") {
			if (matchesKey(data, "escape")) {
				this.search.clear();
				this.overviewFocus = "sessions";
				this.applySessionScope();
				return;
			}
			if (matchesKey(data, "enter")) {
				this.overviewFocus = "sessions";
				return;
			}
			this.search.handleInput(data);
			this.applySessionScope();
			return;
		}
		if (matchesKey(data, "escape")) {
			this.screen = "conversation";
			return;
		}
		if (matchesKey(data, "tab")) {
			this.overviewFocus =
				this.overviewFocus === "workspaces" ? "sessions" : "workspaces";
			return;
		}
		if (data === "/") {
			this.overviewFocus = "search";
			return;
		}
		const delta =
			matchesKey(data, "up") || data === "k"
				? -1
				: matchesKey(data, "down") || data === "j"
					? 1
					: 0;
		if (delta) {
			if (this.overviewFocus === "workspaces") {
				this.workspaceList.move(delta);
				this.applySessionScope();
			} else this.sessionList.move(delta);
			return;
		}
		if (matchesKey(data, "enter")) {
			const selected = this.sessionList.selected();
			if (selected) {
				if (this.tui.terminal.columns < 104) this.overviewFocus = "detail";
				else void this.actions.resumeSession(selected.path);
			}
		}
	}

	private handleConversationInput(data: string): void {
		if (this.redirectQueueId) {
			if (matchesKey(data, "enter")) void this.redirectSelected();
			else {
				this.redirectQueueId = undefined;
				this.conversationFocus = "queue";
			}
			return;
		}
		if (this.confirmStopKey) {
			if (matchesKey(data, "enter")) void this.stopSelected();
			else {
				this.confirmStopKey = undefined;
				this.conversationFocus = "agents";
			}
			return;
		}
		if (this.conversationFocus === "queue") {
			this.handleQueueInput(data);
			return;
		}
		if (this.conversationFocus === "agents") {
			if (matchesKey(data, "escape") || matchesKey(data, "tab"))
				this.conversationFocus = "composer";
			else if (matchesKey(data, "up") || data === "k") this.agentList.move(-1);
			else if (matchesKey(data, "down") || data === "j") this.agentList.move(1);
			else if (matchesKey(data, "pageUp")) this.agentList.page(-1);
			else if (matchesKey(data, "pageDown")) this.agentList.page(1);
			else if (matchesKey(data, "enter") && this.agentList.selected()) {
				this.saveDraft();
				this.screen = "agent";
				this.conversationFocus = "composer";
				this.restoreDraft();
			} else if (data === "x" && this.agentList.selected()) {
				this.confirmStopKey = this.agentList.selected()?.key;
				this.conversationFocus = "stop";
			}
			return;
		}
		if (matchesKey(data, "escape")) {
			if (this.editingQueueId) {
				const editing = this.store.queue.find(
					(item) => item.id === this.editingQueueId,
				);
				if (editing) editing.state = "queued";
				this.editingQueueId = undefined;
				this.composer.setText("");
				this.conversationFocus = "queue";
				return;
			}
			if (this.screen === "agent") {
				this.saveDraft();
				this.screen = "conversation";
				this.restoreDraft();
			} else this.screen = "overview";
			return;
		}
		if (
			matchesKey(data, "tab") &&
			this.screen === "conversation" &&
			this.store.agents().length
		) {
			this.conversationFocus = "agents";
			return;
		}
		if (
			matchesKey(data, "up") &&
			!this.composer.getText() &&
			this.targetQueue().length
		) {
			this.selectedQueue = this.targetQueue().length - 1;
			this.conversationFocus = "queue";
			return;
		}
		if (
			matchesKey(data, "ctrl+x") &&
			this.screen === "agent" &&
			this.agentList.selected()
		) {
			this.confirmStopKey = this.agentList.selected()?.key;
			this.conversationFocus = "stop";
			return;
		}
		this.composer.handleInput(data);
	}

	handleInput(data: string): void {
		if (matchesKey(data, "ctrl+c") && !this.ctx.isIdle()) {
			this.actions.abort();
			return;
		}
		if (matchesKey(data, "ctrl+d") && this.composer.getText() === "") {
			this.actions.shutdown();
			return;
		}
		if (this.screen === "overview") this.handleOverviewInput(data);
		else this.handleConversationInput(data);
		this.tui.requestRender();
	}

	private header(
		title: string,
		crumb: string,
		meta: string,
		width: number,
	): string[] {
		const chip = this.theme.bg(
			"selectedBg",
			this.theme.fg("borderAccent", this.theme.bold(` ${title} `)),
		);
		const left = `${this.theme.bold("π")}  ${chip}  ${this.theme.fg("muted", crumb)}`;
		return [
			alignRight(left, this.theme.fg("dim", meta), width),
			this.theme.fg("borderMuted", "─".repeat(width)),
		];
	}

	private help(bindings: BubbleBinding[], width: number): string {
		return renderBubbleHelp(bindings, width, {
			key: (value) => this.theme.fg("accent", this.theme.bold(value)),
			description: (value) => this.theme.fg("dim", value),
			separator: (value) => this.theme.fg("borderMuted", value),
			ellipsis: (value) => this.theme.fg("dim", value),
		});
	}

	private overviewHelp(width: number): string {
		if (this.overviewFocus === "detail") return this.help([
			new BubbleBinding({ keys: ["enter"], help: { key: "enter", description: "resume" } }),
			new BubbleBinding({ keys: ["escape"], help: { key: "esc", description: "list" } }),
		], width);
		const searching = this.overviewFocus === "search";
		return this.help(
			[
				new BubbleBinding({
					keys: ["up", "down"],
					help: { key: "↑/↓", description: "move" },
					enabled: () => !searching,
				}),
				new BubbleBinding({
					keys: ["tab"],
					help: {
						key: "tab",
						description:
							this.overviewFocus === "workspaces" ? "sessions" : "workspaces",
					},
					enabled: () => !searching,
				}),
				new BubbleBinding({
					keys: ["/"],
					help: { key: "/", description: "filter" },
					enabled: () => !searching,
				}),
				new BubbleBinding({
					keys: ["enter"],
					help: { key: "enter", description: searching ? "results" : "resume" },
				}),
				new BubbleBinding({
					keys: ["escape"],
					help: {
						key: "esc",
						description: searching ? "clear" : "conversation",
					},
				}),
			],
			width,
		);
	}

	private conversationHelp(width: number): string {
		if (this.redirectQueueId) {
			return this.help(
				[
					new BubbleBinding({
						keys: ["enter"],
						help: { key: "enter", description: "redirect now" },
					}),
					new BubbleBinding({
						keys: ["escape"],
						help: { key: "any other key", description: "cancel" },
					}),
				],
				width,
			);
		}
		if (this.confirmStopKey) {
			return this.help(
				[
					new BubbleBinding({
						keys: ["enter"],
						help: { key: "enter", description: "stop" },
					}),
					new BubbleBinding({
						keys: ["escape"],
						help: { key: "any other key", description: "cancel" },
					}),
				],
				width,
			);
		}
		if (this.conversationFocus === "queue") {
			return this.help(
				[
					new BubbleBinding({
						keys: ["up", "down"],
						help: { key: "↑/↓", description: "select" },
					}),
					new BubbleBinding({
						keys: ["alt+up", "alt+down"],
						help: { key: "alt+↑/↓", description: "reorder" },
					}),
					new BubbleBinding({
						keys: ["enter"],
						help: { key: "enter", description: "edit" },
					}),
					new BubbleBinding({
						keys: ["s"],
						help: { key: "s", description: "send" },
						enabled: () => this.currentTarget() !== MAIN_TARGET,
					}),
					new BubbleBinding({
						keys: ["r"],
						help: { key: "r", description: "redirect" },
					}),
					new BubbleBinding({
						keys: ["x"],
						help: { key: "x", description: "cancel" },
					}),
					new BubbleBinding({
						keys: ["escape"],
						help: { key: "esc", description: "input" },
					}),
				],
				width,
			);
		}
		if (this.conversationFocus === "agents") {
			return this.help(
				[
					new BubbleBinding({
						keys: ["up", "down"],
						help: { key: "↑/↓", description: "select" },
					}),
					new BubbleBinding({
						keys: ["enter"],
						help: { key: "enter", description: "interact" },
					}),
					new BubbleBinding({
						keys: ["x"],
						help: { key: "x", description: "stop" },
					}),
					new BubbleBinding({
						keys: ["escape"],
						help: { key: "esc", description: "input" },
					}),
				],
				width,
			);
		}
		return this.help(
			[
				new BubbleBinding({
					keys: ["enter"],
					help: {
						key: "enter",
						description: this.ctx.isIdle() ? "send" : "queue",
					},
				}),
				new BubbleBinding({
					keys: ["up"],
					help: { key: "↑", description: "queued messages" },
					enabled: () => this.targetQueue().length > 0,
				}),
				new BubbleBinding({
					keys: ["tab"],
					help: { key: "tab", description: "subagents" },
					enabled: () =>
						this.screen === "conversation" && this.store.agents().length > 0,
				}),
				new BubbleBinding({
					keys: ["ctrl+x"],
					help: { key: "ctrl+x", description: "stop" },
					enabled: () => this.screen === "agent",
				}),
				new BubbleBinding({
					keys: ["escape"],
					help: {
						key: "esc",
						description: this.screen === "agent" ? "conversation" : "sessions",
					},
				}),
			],
			width,
		);
	}

	private renderOverview(width: number, rows: number): string[] {
		const contentHeight = Math.max(1, rows - 3);
		const showPreview = width >= 104;
		const leftWidth = Math.min(30, Math.max(22, Math.floor(width * 0.22)));
		const middleWidth = showPreview
			? Math.min(52, Math.max(36, Math.floor(width * 0.36)))
			: width;
		const previewWidth =
			width - leftWidth - middleWidth - (showPreview ? 2 : 1);
		const itemRows = Math.max(1, Math.floor((contentHeight - 2) / 2));
		this.workspaceList.setHeight(itemRows);
		this.sessionList.setHeight(itemRows);

		const workspaceLines = [
			alignRight(
				this.theme.bold("Browse"),
				this.theme.fg(
					"dim",
					`${workspaceSummaries(this.store.sessions).length} workspaces`,
				),
				leftWidth,
			),
			"",
		];
		for (const match of this.workspaceList.visibleItems()) {
			const item = match.item;
			const selected = item === this.workspaceList.selected();
			const active = selected && this.overviewFocus === "workspaces";
			const marker = active ? this.theme.fg("borderAccent", "▎") : " ";
			const label = selected
				? this.theme.fg("accent", this.theme.bold(item.label))
				: this.theme.fg("text", item.label);
			workspaceLines.push(
				`${marker} ${label}${this.theme.fg("dim", `  ${item.count}`)}`,
			);
			workspaceLines.push(
				item.path
					? this.theme.fg("dim", `  ${pathTail(item.path, leftWidth - 2)}`)
					: "",
			);
		}

		const scope = this.workspaceList.selected()?.label ?? "Recent work";
		const searchLabel =
			this.overviewFocus === "search"
				? `${this.theme.fg("accent", "/")} ${this.search.render(Math.max(1, middleWidth - visibleWidth(scope) - 4), { text: (value) => this.theme.fg("text", value), placeholder: (value) => this.theme.fg("dim", value), cursor: (value) => this.theme.bg("selectedBg", value) })}`
				: `${this.theme.fg("accent", "/")} ${this.theme.fg("dim", "search")}`;
		const sessionLines = [
			alignRight(this.theme.bold(scope), searchLabel, middleWidth),
			this.sessionLoadError
				? this.theme.fg(
						"error",
						truncateToWidth(this.sessionLoadError, middleWidth),
					)
				: "",
		];
		for (const match of this.sessionList.visibleItems()) {
			const session = match.item;
			const selected = session === this.sessionList.selected();
			const active = selected && this.overviewFocus === "sessions";
			const marker = active ? this.theme.fg("borderAccent", "▎") : " ";
			const running =
				normalizePath(session.path) ===
				normalizePath(this.ctx.sessionManager.getSessionFile() ?? "");
			const state = running
				? this.theme.fg("success", "●")
				: this.theme.fg("dim", "·");
			const title = selected
				? this.theme.fg("accent", this.theme.bold(titleFor(session)))
				: this.theme.fg("text", this.theme.bold(titleFor(session)));
			sessionLines.push(
				alignRight(
					`${marker} ${state} ${title}`,
					this.theme.fg("dim", relativeTime(session.modified)),
					middleWidth,
				),
			);
			const summary = summaryFor(session);
			sessionLines.push(
				this.theme.fg(
					"dim",
					`  ${basename(session.cwd) || session.cwd}${summary ? `  ${summary}` : ""}`,
				),
			);
		}

		let columns = showPreview ? [workspaceLines, sessionLines] : this.overviewFocus === "workspaces" ? [workspaceLines] : [sessionLines];
		let widths = showPreview ? [leftWidth, middleWidth] : [width];
		if (showPreview) {
			const selected = this.sessionList.selected();
			const summary = selected ? summaryFor(selected) : "";
			const preview = selected
				? [
						this.theme.fg(
							"dim",
							`SESSION · ${relativeTime(selected.modified)}`,
						),
						"",
						...wrapTextWithAnsi(
							this.theme.bold(titleFor(selected)),
							previewWidth,
						),
						"",
						...wrapTextWithAnsi(
							this.theme.fg("mdLink", homeRelative(selected.cwd)),
							previewWidth,
						),
						"",
						...(summary
							? [
									...wrapTextWithAnsi(
										this.theme.fg("muted", summary),
										previewWidth,
									),
									"",
								]
							: []),
						this.theme.fg("dim", `${selected.messageCount} messages`),
						"",
						this.theme.fg("borderAccent", "Resume session →"),
					]
				: [this.theme.fg("dim", "No session selected")];
			columns.push(preview);
			widths.push(previewWidth);
		}
		if (!showPreview && this.overviewFocus === "detail") {
			const selected = this.sessionList.selected();
			columns = [selected ? [
				this.theme.fg("dim", `SESSION · ${relativeTime(selected.modified)}`),
				"",
				...wrapTextWithAnsi(this.theme.bold(titleFor(selected)), width),
				"",
				...wrapTextWithAnsi(this.theme.fg("mdLink", homeRelative(selected.cwd)), width),
				"",
				this.theme.fg("dim", `${selected.messageCount} messages`),
				"",
				`${this.theme.fg("accent", "enter")} ${this.theme.fg("borderAccent", "Resume session")}`,
			] : [this.theme.fg("dim", "No session selected")]];
			widths = [width];
		}
		const header = this.header(
			"SESSIONS",
			"all workspaces",
			`${workspaceSummaries(this.store.sessions).length} workspaces · ${this.store.sessions.length} sessions`,
			width,
		);
		return [
			...header,
			...joinColumns(this.theme, columns, widths, contentHeight),
			pad(this.overviewHelp(width), width),
		];
	}

	private transcriptLines(width: number, height: number): string[] {
		const gutter = width >= 100 ? 12 : 7;
		const bodyWidth = Math.max(16, width - gutter - 2);
		const lines: string[] = [];
		const messages = this.ctx.sessionManager
			.getBranch()
			.map(messageText)
			.filter((value): value is { role: string; text: string } =>
				Boolean(value?.text),
			);
		for (const message of messages.slice(-12)) {
			const body = wrapTextWithAnsi(
				message.role === "PI"
					? this.theme.fg("muted", plainMarkdown(message.text))
					: this.theme.fg("text", plainMarkdown(message.text)),
				bodyWidth,
			);
			for (const [index, line] of body.entries()) {
				const label = index === 0 ? this.theme.fg("dim", message.role) : "";
				lines.push(`${pad(label, gutter)}  ${line}`);
			}
			if (message.role === "PI") {
				const associated = [...this.store.completedActivities].reverse().find((item) => item.text === message.text);
				if (associated) {
					const visible = associated.activity.filter((item) => item.state === "running" || item.state === "error");
					for (const item of associated.activity.slice(-3)) if (!visible.includes(item)) visible.push(item);
					const unique = [...new Map(visible.map((item) => [item.id, item])).values()].slice(-3);
					const hidden = Math.max(0, associated.activity.length - unique.length);
					if (hidden) lines.push(`${pad("", gutter)}  ${this.theme.fg("dim", `… ${hidden} earlier tools`)}`);
					for (const activity of unique) {
						const glyph = activity.state === "done" ? this.theme.fg("success", "✓") : activity.state === "error" ? this.theme.fg("error", "×") : this.theme.fg("accent", this.spinner.frame());
						lines.push(`${pad("", gutter)}  ${glyph} ${this.theme.fg("dim", activity.label)}`);
					}
				}
			}
			lines.push("");
		}
		if (this.store.streamingText) {
			const body = wrapTextWithAnsi(
				this.theme.fg("muted", plainMarkdown(this.store.streamingText)),
				bodyWidth,
			);
			for (const [index, line] of body.entries())
				lines.push(
					`${pad(index === 0 ? this.theme.fg("dim", "PI") : "", gutter)}  ${line}`,
				);
		}
		if (this.store.activity.length) {
			lines.push(
				`${pad("", gutter)}  ${this.theme.fg("dim", "RECENT ACTIVITY")}`,
			);
			for (const activity of this.store.activity.slice(-3)) {
				const glyph =
					activity.state === "done"
						? this.theme.fg("success", "✓")
						: activity.state === "error"
							? this.theme.fg("error", "!")
							: this.theme.fg("accent", this.spinner.frame());
				lines.push(
					`${pad("", gutter)}  ${glyph} ${this.theme.fg("dim", activity.label)}`,
				);
			}
		}
		for (const event of this.stoppedEvents.slice(-2))
			lines.push(
				`${pad(this.theme.fg("dim", "EVENT"), gutter)}  ${this.theme.fg("muted", event)}`,
			);
		this.transcript.setHeight(height);
		this.transcript.setContent(lines, true);
		return this.transcript.render(width);
	}

	private renderAgentRow(
		row: AgentRow,
		width: number,
		selected: boolean,
	): string[] {
		const focus = selected && this.conversationFocus === "agents";
		const marker =
			row.state === "stopping"
				? this.theme.fg("warning", this.spinner.frame())
				: row.state === "paused"
					? this.theme.fg("warning", "●")
					: this.theme.fg("accent", this.spinner.frame());
		const prefix = focus ? this.theme.fg("borderAccent", "│") : " ";
		const name = selected
			? this.theme.fg("accent", this.theme.bold(row.agent))
			: this.theme.fg("text", this.theme.bold(row.agent));
		const runtime = [shortModel(row.model), row.thinking]
			.filter(Boolean)
			.join(" · ");
		if (width >= 112) {
			const nameWidth = 20;
			const nowWidth = 18;
			const runtimeWidth = 24;
			const actionWidth = 18;
			const taskWidth = Math.max(
				18,
				width - nameWidth - nowWidth - runtimeWidth - actionWidth - 8,
			);
			const actions = selected
				? `${this.theme.fg("accent", "↵")} interact  ${this.theme.fg("error", "x")} stop`
				: "";
			return [
				[
					pad(
						`${prefix} ${marker} ${name} ${this.theme.fg("dim", formatDuration(row.startedAt))}`,
						nameWidth,
					),
					pad(this.theme.fg("muted", row.goal), taskWidth),
					pad(this.theme.fg("dim", row.currentTool || row.state), nowWidth),
					pad(this.theme.fg("muted", runtime), runtimeWidth),
					pad(actions, actionWidth),
				].join("  "),
			];
		}
		const first = alignRight(
			`${prefix} ${marker} ${name}`,
			this.theme.fg("dim", `${runtime} ${formatDuration(row.startedAt)}`),
			width,
		);
		const detail = truncateToWidth(
			`${focus ? this.theme.fg("borderAccent", "│") : " "}   ${this.theme.fg("muted", row.goal || row.currentTool || row.state)}`,
			width,
		);
		const action = focus
			? `${this.theme.fg("accent", "↵")} interact  ${this.theme.fg("error", "x")} stop`
			: this.theme.fg("dim", row.currentTool || row.state);
		return [first, alignRight(detail, action, width)];
	}

	private renderAgents(width: number, maximumLines: number): string[] {
		const agents = this.store.agents().filter((agent) => !this.hiddenAgentKeys.has(agent.key));
		if (agents.length === 0) return [];
		this.agentList.setItems(agents);
		const rowHeight = width < 112 ? 2 : 1;
		const visibleRows = Math.max(1, Math.floor((maximumLines - 2) / rowHeight));
		this.agentList.setHeight(
			Math.min(this.store.config.maxVisibleSubagents, visibleRows),
		);
		const position = this.agentList.position();
		const title = `${this.theme.fg("borderAccent", this.theme.bold("SUBAGENTS"))} ${this.theme.fg("dim", `${position.start}–${position.end} / ${position.total} · newest`)}`;
		const attention = agents.filter((agent) => agent.state === "paused").length;
		const status = `${attention ? `${this.theme.fg("warning", `! ${attention}`)}  ` : ""}${this.theme.fg("success", "●")} ${agents.length} active`;
		const lines = [
			alignRight(title, status, width),
			this.theme.fg("borderMuted", "─".repeat(width)),
		];
		for (const match of this.agentList.visibleItems()) {
			const row = match.item;
			lines.push(
				...this.renderAgentRow(row, width, row === this.agentList.selected()),
			);
			if (this.confirmStopKey === row.key) {
				lines.push(
					truncateToWidth(
						`${this.theme.fg("borderAccent", "│")}   ${this.theme.fg("warning", `Stop ${row.agent}?`)}   ${this.theme.fg("accent", "enter")} stop   ${this.theme.fg("dim", "any other key cancel")}`,
						width,
					),
				);
			}
		}
		return lines;
	}

	private agentTranscriptLines(width: number, height: number): string[] {
		const agent = this.agentList.selected();
		if (!agent) return Array.from({ length: height }, () => "");
		const labelWidth = width >= 100 ? 10 : 7;
		const bodyWidth = Math.max(16, width - labelWidth - 2);
		const live = this.childTimelines.get(agent.key);
		if (live?.entries().length) {
			const liveLines: string[] = [];
			for (const entry of live.entries()) {
				const label = entry.role === "user" ? "YOU" : agent.agent.toUpperCase();
				for (const [index, line] of wrapTextWithAnsi(this.theme.fg(entry.role === "user" ? "text" : "muted", plainMarkdown(entry.text)), bodyWidth).entries()) {
					liveLines.push(`${pad(index === 0 ? this.theme.fg("dim", label) : "", labelWidth)}  ${line}${entry.streaming && index === wrapTextWithAnsi(plainMarkdown(entry.text), bodyWidth).length - 1 ? this.theme.fg("accent", "▍") : ""}`);
				}
				const compact = live.visibleTools(entry.id, this.store.config.recentOutputLines);
				if (compact.hidden) liveLines.push(`${pad("", labelWidth)}  ${this.theme.fg("dim", `… ${compact.hidden} earlier tools`)}`);
				for (const tool of compact.visible) {
					const glyph = tool.state === "running" ? this.theme.fg("accent", this.spinner.frame()) : tool.state === "error" ? this.theme.fg("error", "×") : this.theme.fg("success", "✓");
					liveLines.push(`${pad("", labelWidth)}  ${glyph} ${this.theme.fg("dim", `${tool.name}${tool.summary ? ` · ${firstLine(tool.summary)}` : ""}`)}`);
				}
				liveLines.push("");
			}
			while (liveLines.length < height) liveLines.unshift("");
			return liveLines.slice(-height);
		}
		const lines: string[] = [];
		const addBlock = (
			label: string,
			value: string,
			color: "text" | "muted" = "muted",
		) => {
			for (const [index, line] of wrapTextWithAnsi(
				this.theme.fg(color, value),
				bodyWidth,
			).entries()) {
				lines.push(
					`${pad(index === 0 ? this.theme.fg("dim", label) : "", labelWidth)}  ${line}`,
				);
			}
		};
		addBlock("TASK", agent.goal || "No task description", "text");
		lines.push("");
		addBlock("NOW", agent.currentTool || agent.state);
		if (agent.recentOutput.length) {
			lines.push("");
			for (const [index, output] of agent.recentOutput.entries())
				addBlock(index === 0 ? "RECENT" : "", output);
		}
		if (this.confirmStopKey === agent.key) {
			lines.push("");
			lines.push(
				truncateToWidth(
					`${this.theme.fg("borderAccent", "│")} ${this.theme.fg("warning", `Stop ${agent.agent}?`)}   ${this.theme.fg("accent", "enter")} stop   ${this.theme.fg("dim", "any other key cancel")}`,
					width,
				),
			);
		}
		while (lines.length < height) lines.push("");
		return lines.slice(-height);
	}

	private renderQueue(width: number): string[] {
		const queue = this.targetQueue();
		if (!queue.length) return [];
		const visible = queue.slice(Math.max(0, queue.length - 3));
		const inner = Math.max(1, width - 2);
		const lines = [
			`╭${this.theme.fg("borderMuted", "─".repeat(inner))}╮`,
			`│${pad(alignRight(this.theme.fg("borderAccent", this.theme.bold("QUEUED")), this.theme.fg("dim", `${queue.length} messages`), inner), inner)}│`,
		];
		for (const item of visible) {
			const absolute = queue.indexOf(item);
			const selected = absolute === this.selectedQueue;
			const active =
				selected &&
				(this.conversationFocus === "queue" ||
					this.redirectQueueId === item.id);
			const prefix = active ? this.theme.fg("borderAccent", "│") : " ";
			const state =
				item.state === "failed"
					? this.theme.fg("error", "failed")
					: this.theme.fg(
							"dim",
							item.targetKey === MAIN_TARGET
								? "Pi"
								: this.store
										.agents()
										.find((agent) => agent.key === item.targetKey)?.agent ||
										"retarget",
						);
			lines.push(
				`│${pad(alignRight(
					`${prefix} ${this.theme.fg("accent", `${absolute + 1}.`)} ${this.theme.fg("text", item.text)}`,
					`→ ${state}`,
					inner,
				), inner)}│`,
			);
			if (this.redirectQueueId === item.id) {
				lines.push(
					`│${pad(truncateToWidth(
						`${this.theme.fg("warning", "│   Interrupt the current turn and deliver immediately?")}   ${this.theme.fg("accent", "enter")} redirect   ${this.theme.fg("dim", "any other key cancel")}`,
						inner,
					), inner)}│`,
				);
			} else if (item.error && selected)
				lines.push(
					`│${pad(truncateToWidth(this.theme.fg("error", `  ${item.error}`), inner), inner)}│`,
				);
		}
		lines.push(`╰${this.theme.fg("borderMuted", "─".repeat(inner))}╯`);
		return lines;
	}

	private runtimeLine(width: number): string {
		const usage = this.ctx.getContextUsage();
		const percent = usage?.percent ?? 0;
		const barWidth = width >= 100 ? 10 : 5;
		const filled = Math.max(
			0,
			Math.min(barWidth, Math.round((percent / 100) * barWidth)),
		);
		const bar = `${this.theme.fg("borderAccent", "█".repeat(filled))}${this.theme.fg("borderMuted", "░".repeat(barWidth - filled))}`;
		const ttft =
			this.store.performance.ttftMs === undefined
				? "TTFT —"
				: `TTFT ${(this.store.performance.ttftMs / 1_000).toFixed(2)}s`;
		const tpot =
			this.store.performance.tokensPerSecond === undefined
				? "TPOT —"
				: `TPOT ${this.store.performance.tokensPerSecond.toFixed(1)} tok/s`;
		const context = usage
			? `${usage.tokens === null ? "—" : compactTokens(usage.tokens)}/${compactTokens(usage.contextWindow)}`
			: "—";
		const io = `↑${compactTokens(this.store.performance.input)} ↓${compactTokens(this.store.performance.output)} cache ${compactTokens(this.store.performance.cacheRead)} $${this.store.performance.cost.toFixed(3)}`;
		const left = `${this.theme.fg("dim", "CTX")} ${bar} ${this.theme.fg("muted", `${percent.toFixed(1)}% · ${context}`)}   ${this.theme.fg("dim", ttft)}   ${this.theme.fg("dim", tpot)}${width >= 120 ? `   ${this.theme.fg("dim", io)}` : ""}`;
		const right =
			this.statusUntil > Date.now()
				? this.theme.fg("accent", this.statusMessage)
				: this.theme.fg(
						"muted",
						`${shortModel(this.store.modelId || this.ctx.model?.id)} · ${this.store.thinking || this.ctx.thinkingLevel || this.pi.getThinkingLevel()}`,
					);
		return alignRight(left, right, width);
	}

	private composerLines(width: number): string[] {
		const target =
			this.screen === "agent"
				? this.agentList.selected()?.agent || "subagent"
				: "Pi";
		const label = this.editingQueueId ? `EDIT QUEUED · ${target}` : `TO · ${target}`;
		this.composer.focused = this.conversationFocus === "composer";
		return [this.theme.fg("dim", label), ...this.composer.render(width)];
	}

	private renderConversation(width: number, rows: number): string[] {
		const selected = this.agentList.selected();
		const title = this.screen === "agent" ? "SUBAGENT" : "CONVERSATION";
		const crumb =
			this.screen === "agent"
				? `${basename(this.ctx.cwd)} / ${selected?.agent ?? "subagent"}`
				: [basename(this.ctx.cwd), this.pi.getSessionName()]
						.filter(Boolean)
						.join(" / ");
		const header = this.header(
			title,
			crumb,
			this.screen === "agent"
				? [shortModel(selected?.model), selected?.thinking]
						.filter(Boolean)
						.join(" · ")
				: homeRelative(this.ctx.cwd),
			width,
		);
		const queueWidth = Math.min(width - 2, 92);
		const queue = this.renderQueue(queueWidth);
		const composer = this.composerLines(width);
		const runtime = this.runtimeLine(width);
		let agents: string[] = [];
		if (this.screen === "conversation") {
			const reserved = header.length + composer.length + 2;
			const maxAgentLines = Math.max(3, rows - reserved - 5);
			agents = this.renderAgents(width, maxAgentLines);
		}
		const footer = this.conversationHelp(width);
		const transcriptHeight = Math.max(
			1,
			rows - header.length - agents.length - composer.length - 2,
		);
		const transcript =
			this.screen === "agent"
				? this.agentTranscriptLines(width, transcriptHeight)
				: this.transcriptLines(width, transcriptHeight);
		let rendered = [
			...header,
			...transcript,
			...agents,
			...composer,
			pad(runtime, width),
			pad(footer, width),
		].slice(0, rows);
		while (rendered.length < rows) rendered.push("");
		if (queue.length) {
			const overlayWidth = queueWidth;
			const overlay = queue.map((line) => pad(line, overlayWidth));
			const composerTop = Math.max(header.length, rows - composer.length - 2);
			rendered = compositeBubbleLayer(rendered, width, {
				x: 1,
				y: Math.max(header.length, composerTop - overlay.length),
				width: overlayWidth,
				lines: overlay,
			});
		}
		return rendered.slice(0, rows);
	}

	render(width: number): string[] {
		const rows = Math.max(8, this.tui.terminal.rows);
		const usableWidth = Math.max(1, width);
		const rendered =
			this.screen === "overview"
				? this.renderOverview(usableWidth, rows)
				: this.renderConversation(usableWidth, rows);
		while (rendered.length < rows) rendered.push("");
		return rendered.slice(0, rows).map((line) => pad(line, usableWidth));
	}

	invalidate(): void {
		this.composer.invalidate();
	}

	dispose(): void {
		clearInterval(this.timer);
		this.composer.focused = false;
	}
}

export default function workspaceShell(pi: ExtensionAPI): void {
	const store = new WorkspaceStore(loadConfig());
	let shell: WorkspaceShell | undefined;

	const render = (): void => shell?.requestRender();

	pi.events.on("subagent:async-started", (raw) => {
		if (isRecord(raw)) store.track(raw as AsyncStartedEvent);
		store.refreshRuns();
		render();
	});
	pi.events.on("subagent:async-complete", () => {
		store.refreshRuns();
		render();
	});
	pi.events.on("subagent:process-terminal", () => {
		store.refreshRuns();
		render();
	});
	pi.events.on("subagent:ui-event:v1", (raw) => {
		if (isRecord(raw)) shell?.applySubagentEvent(raw as SubagentUiEvent);
	});
	pi.events.on("subagent:child-status", (raw) => {
		if (isRecord(raw)) shell?.handleChildStatus(raw);
	});

	pi.on("session_start", (event, ctx) => {
		if (ctx.mode !== "tui") return;
		store.modelId = ctx.model?.id ?? "";
		store.thinking = ctx.thinkingLevel ?? pi.getThinkingLevel();
		const initialScreen: Screen = event.reason === "resume" || event.reason === "fork" || ctx.sessionManager.getBranch().length > 0 ? "conversation" : "overview";
		ctx.ui.setRootView((tui, theme, _keybindings, actions, composer) => {
			shell = new WorkspaceShell(pi, ctx, store, tui, theme, actions, composer, initialScreen);
			void listWorkspaceSessions()
				.then((sessions) => shell?.setSessions(sessions))
				.catch((error) => shell?.setSessionLoadError(error));
			void rpc(pi, "status", {})
				.then((data) => shell?.recoverSubagents(data))
				.catch(() => {});
			return shell;
		});
	});

	pi.on("before_provider_request", () => {
		store.performance.requestStartedAt = Date.now();
		store.performance.firstTokenAt = undefined;
		store.performance.lastTokenAt = undefined;
		store.performance.ttftMs = undefined;
		store.performance.tokensPerSecond = undefined;
		render();
	});
	pi.on("agent_start", () => shell?.showConversation());
	pi.on("message_update", (event) => {
		if (event.message.role !== "assistant") return;
		const now = Date.now();
		if (store.performance.firstTokenAt === undefined) {
			store.performance.firstTokenAt = now;
			if (store.performance.requestStartedAt !== undefined)
				store.performance.ttftMs = now - store.performance.requestStartedAt;
		}
		store.performance.lastTokenAt = now;
		store.streamingText = event.message.content
			.flatMap((part) => (part.type === "text" ? [part.text] : []))
			.join("\n");
		render();
	});
	pi.on("message_end", (event) => {
		if (event.message.role !== "assistant") return;
		const outputTokens = event.message.usage.output;
		store.performance.input += event.message.usage.input;
		store.performance.output += event.message.usage.output;
		store.performance.cacheRead += event.message.usage.cacheRead;
		store.performance.cacheWrite += event.message.usage.cacheWrite;
		store.performance.cost += event.message.usage.cost.total;
		if (
			store.performance.firstTokenAt !== undefined &&
			store.performance.lastTokenAt !== undefined &&
			outputTokens > 1
		) {
			const seconds = Math.max(
				0.001,
				(store.performance.lastTokenAt - store.performance.firstTokenAt) /
					1_000,
			);
			store.performance.tokensPerSecond = (outputTokens - 1) / seconds;
		}
		store.finishAssistant(event.message.content.flatMap((part) => part.type === "text" ? [part.text] : []).join("\n"));
		store.streamingText = "";
		render();
	});
	pi.on("tool_execution_start", (event) => {
		store.addActivity(event.toolCallId, event.toolName, "running");
		render();
	});
	pi.on("tool_execution_end", (event) => {
		store.addActivity(
			event.toolCallId,
			event.toolName,
			event.isError ? "error" : "done",
		);
		render();
	});
	pi.on("turn_end", () => {
		void shell?.flushMainQueue();
	});
	pi.on("model_select", (event) => {
		store.modelId = event.model.id;
		render();
	});
	pi.on("thinking_level_select", (event) => {
		store.thinking = event.level;
		render();
	});
	pi.on("session_shutdown", (_event, ctx) => {
		if (ctx.mode === "tui") ctx.ui.setRootView(undefined);
		shell = undefined;
		store.streamingText = "";
	});
}

export {
	homeRelative,
	listWorkspaceSessions,
	messageText,
	pathTail,
	relativeTime,
	rowsForRun,
	WorkspaceShell,
	WorkspaceStore,
	workspaceSummaries,
};
