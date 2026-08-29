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
	BubbleTurnGate,
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
const SUBAGENT_EVENT_ENTRY = "workspace-shell.subagent-event";

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
	tokens?: { total?: number; input?: number; output?: number };
	contextLimit?: number;
	transcriptPath?: string;
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
	contextLimit?: number;
	transcriptPath?: string;
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
	summary?: string;
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
	ts?: number;
	turnId?: number;
	segmentId?: number;
	requestStartedAt?: number;
	delta?: string;
	replace?: boolean;
	text?: string;
	toolCallId?: string;
	toolName?: string;
	summary?: string;
	isError?: boolean;
	usage?: {
		input?: number;
		output?: number;
		cacheRead?: number;
		cacheWrite?: number;
		cost?: number;
	};
}

interface AgentRuntime {
	model?: string;
	thinking?: string;
	performance: PerformanceSample;
}

interface MissingCwdConfirmation {
	sessionCwd: string;
	fallbackCwd: string;
	resolve: (confirmed: boolean) => void;
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

function toolSummary(value: unknown): string | undefined {
	if (!isRecord(value)) return undefined;
	for (const key of [
		"path",
		"command",
		"query",
		"pattern",
		"url",
		"file",
		"description",
	]) {
		const candidate = firstLine(value[key]);
		if (candidate) return candidate;
	}
	return undefined;
}

function finiteMetric(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) && value >= 0
		? value
		: 0;
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
					tokens: step.tokens
						? finiteMetric(step.tokens.total) ||
							finiteMetric(step.tokens.input) + finiteMetric(step.tokens.output)
						: undefined,
					contextLimit: step.contextLimit,
					transcriptPath: step.transcriptPath,
					childCount: steps.length,
				},
			];
		});
	}
	const state = status?.state || "running";
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
	readonly performance: PerformanceSample = {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		cost: 0,
	};
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
		if (
			!isRecord(raw) ||
			!isRecord(raw.asyncSnapshot) ||
			!Array.isArray(raw.asyncSnapshot.runs)
		)
			return;
		for (const candidate of raw.asyncSnapshot.runs) {
			if (
				!isRecord(candidate) ||
				typeof candidate.id !== "string" ||
				(candidate.state !== "running" && candidate.state !== "queued")
			)
				continue;
			const children = Array.isArray(candidate.children)
				? candidate.children.filter(isRecord)
				: [];
			const steps: AsyncStatusStep[] = children.map((child, index) => ({
				workflowKey: typeof child.id === "string" ? child.id : `step:${index}`,
				agent: typeof child.label === "string" ? child.label : "subagent",
				status: child.state === "queued" ? "pending" : "running",
				startedAt:
					typeof child.startedAt === "number" ? child.startedAt : undefined,
				currentTool:
					isRecord(child.activity) &&
					typeof child.activity.currentTool === "string"
						? child.activity.currentTool
						: undefined,
			}));
			this.runs.set(candidate.id, {
				id: candidate.id,
				asyncDir: "",
				goal: typeof candidate.label === "string" ? candidate.label : "",
				agents: steps.map((step) => step.agent ?? "subagent"),
				startedAt:
					typeof candidate.startedAt === "number"
						? candidate.startedAt
						: Date.now(),
				status: { state: candidate.state, steps },
			});
		}
	}

	refreshRuns(): void {
		for (const run of this.runs.values()) run.status = readStatus(run);
		const terminal = [...this.runs.values()]
			.filter(
				(run) => run.status?.state && !ACTIVE_STATES.has(run.status.state),
			)
			.sort((left, right) => right.startedAt - left.startedAt);
		for (const stale of terminal.slice(24)) this.runs.delete(stale.id);
	}

	agents(): AgentRow[] {
		return [...this.runs.values()]
			.flatMap((run) => rowsForRun(run, this.config))
			.filter((row) => ACTIVE_STATES.has(row.state))
			.sort((left, right) => right.startedAt - left.startedAt);
	}

	completedAgents(): AgentRow[] {
		return [...this.runs.values()]
			.flatMap((run) => rowsForRun(run, this.config))
			.filter((row) => !ACTIVE_STATES.has(row.state))
			.sort((left, right) => right.startedAt - left.startedAt);
	}

	allAgents(): AgentRow[] {
		return [...this.agents(), ...this.completedAgents()];
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

	addActivity(
		id: string,
		label: string,
		state: ActivityLine["state"],
		summary?: string,
	): void {
		const existing = this.activity.find((item) => item.id === id);
		if (existing) {
			existing.label = label;
			existing.state = state;
			if (summary !== undefined) existing.summary = summary;
		} else {
			this.activity.push({ id, label, state, ...(summary ? { summary } : {}) });
		}
		while (this.activity.length > 12) this.activity.shift();
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
				if (reply.success === true) resolve(reply.data);
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
	if (
		entry.type === "custom" &&
		entry.customType === SUBAGENT_EVENT_ENTRY &&
		isRecord(entry.data) &&
		typeof entry.data.text === "string"
	) {
		return { role: "EVENT", text: entry.data.text };
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
	private readonly loadedTranscriptPaths = new Set<string>();
	private readonly hiddenAgentKeys = new Set<string>();
	private readonly finishedAgents = new Map<string, AgentRow>();
	private readonly agentRuntime = new Map<string, AgentRuntime>();
	private readonly childViewports = new Map<string, BubbleViewport>();
	private readonly turnGate = new BubbleTurnGate();
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
	private readonly stopErrors = new Map<string, string>();
	private redirectQueueId: string | undefined;
	private missingCwdConfirmation: MissingCwdConfirmation | undefined;
	private readonly drafts = new Map<string, string>();
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
		if (
			event.version !== 1 ||
			!event.runId ||
			typeof event.stepIndex !== "number"
		)
			return;
		const row = this.store
			.allAgents()
			.find(
				(agent) =>
					agent.runId === event.runId &&
					agent.index === event.stepIndex &&
					event.childId === `step:${event.stepIndex}`,
			);
		if (!row) return;
		let runtime = this.agentRuntime.get(row.key);
		if (!runtime) {
			runtime = {
				model: row.model,
				thinking: row.thinking,
				performance: {
					input: 0,
					output: 0,
					cacheRead: 0,
					cacheWrite: 0,
					cost: 0,
				},
			};
			this.agentRuntime.set(row.key, runtime);
		}
		if (event.model) runtime.model = event.model;
		if (event.thinking) runtime.thinking = event.thinking;
		let timeline = this.childTimelines.get(row.key);
		if (!timeline) {
			timeline = new BubbleTimeline();
			this.childTimelines.set(row.key, timeline);
		}
		const turn = event.turnId ?? 0;
		const segment = event.segmentId ?? 0;
		const textId = `${row.key}:turn:${turn}:segment:${segment}`;
		if (event.kind === "message-delta" && event.delta !== undefined) {
			timeline.streamText(textId, event.delta, event.replace === true);
			const now = event.ts ?? Date.now();
			const sample = runtime.performance;
			if (
				event.requestStartedAt !== undefined &&
				sample.requestStartedAt !== event.requestStartedAt
			) {
				sample.requestStartedAt = event.requestStartedAt;
				sample.firstTokenAt = undefined;
				sample.lastTokenAt = undefined;
			}
			if (sample.firstTokenAt === undefined) {
				sample.firstTokenAt = now;
				if (sample.requestStartedAt !== undefined)
					sample.ttftMs = Math.max(0, now - sample.requestStartedAt);
			}
			sample.lastTokenAt = now;
		} else if (event.kind === "message-end")
			timeline.endText(textId, event.text);
		else if (event.kind === "tool-start" && event.toolCallId && event.toolName)
			timeline.startTool({
				id: event.toolCallId,
				name: event.toolName,
				summary: event.summary,
				textId,
			});
		else if (event.kind === "tool-update" && event.toolCallId)
			timeline.updateTool(event.toolCallId, event.summary);
		else if (event.kind === "tool-end" && event.toolCallId)
			timeline.endTool(event.toolCallId, event.isError === true);
		else if (event.kind === "turn-end" && event.turnId !== undefined) {
			this.turnGate.noteTurnEnd(row.key, event.turnId);
			void this.flushTargetQueue(row.key);
		}
		if (event.kind === "message-end" && event.usage) {
			const sample = runtime.performance;
			const output = finiteMetric(event.usage.output);
			sample.input += finiteMetric(event.usage.input);
			sample.output += output;
			sample.cacheRead += finiteMetric(event.usage.cacheRead);
			sample.cacheWrite += finiteMetric(event.usage.cacheWrite);
			sample.cost += finiteMetric(event.usage.cost);
			if (
				sample.firstTokenAt !== undefined &&
				sample.lastTokenAt !== undefined &&
				output > 1
			) {
				sample.tokensPerSecond =
					(output - 1) /
					Math.max(0.001, (sample.lastTokenAt - sample.firstTokenAt) / 1_000);
			}
		}
		this.tui.requestRender();
	}

	handleChildStatus(raw: Record<string, unknown>): void {
		if (
			raw.version !== 1 ||
			raw.status !== "stopped" ||
			typeof raw.runId !== "string"
		)
			return;
		const row = this.store
			.agents()
			.find(
				(agent) =>
					agent.runId === raw.runId &&
					agent.index === raw.stepIndex &&
					agent.childId === raw.childId,
			);
		if (!row) return;
		const alreadyFinished = this.finishedAgents.has(row.key);
		this.hiddenAgentKeys.add(row.key);
		this.finishedAgents.set(row.key, { ...row, state: "stopped" });
		if (!alreadyFinished) {
			const text = `${row.agent} stopped by you · transcript available below`;
			this.pi.appendEntry(SUBAGENT_EVENT_ENTRY, {
				text,
				runId: row.runId,
				childId: row.childId,
				stepIndex: row.index,
			});
		}
		while (this.finishedAgents.size > 24) {
			const oldest = [...this.finishedAgents.values()].sort(
				(left, right) => left.startedAt - right.startedAt,
			)[0];
			if (!oldest) break;
			this.finishedAgents.delete(oldest.key);
			this.childTimelines.delete(oldest.key);
			this.childViewports.delete(oldest.key);
			this.agentRuntime.delete(oldest.key);
		}
		this.updateAgents();
		this.tui.requestRender();
	}

	private async flushTargetQueue(targetKey: string): Promise<void> {
		const item = this.store.queue.find(
			(candidate) =>
				candidate.targetKey === targetKey && candidate.state === "queued",
		);
		if (!item) return;
		if (this.turnGate.claim(targetKey) === undefined) return;
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

	async flushMainQueue(turnId: number): Promise<void> {
		this.turnGate.noteTurnEnd(MAIN_TARGET, turnId);
		const item = this.store.queue.find(
			(candidate) => candidate.targetKey === MAIN_TARGET,
		);
		if (item?.state !== "queued") return;
		if (this.turnGate.claim(MAIN_TARGET) === undefined) return;
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
		const active = this.store
			.agents()
			.filter((agent) => !this.hiddenAgentKeys.has(agent.key));
		const completed = [
			...this.store.completedAgents(),
			...this.finishedAgents.values(),
		]
			.filter(
				(agent, index, rows) =>
					rows.findIndex((candidate) => candidate.key === agent.key) === index,
			)
			.sort((left, right) => right.startedAt - left.startedAt);
		this.agentList.setItems([...active, ...completed]);
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
		let timeline = this.childTimelines.get(target.key);
		if (!timeline) {
			timeline = new BubbleTimeline();
			this.childTimelines.set(target.key, timeline);
		}
		timeline.appendText({
			id: `queue:${item.id}`,
			role: "user",
			text: item.text,
		});
	}

	private async stopSelected(): Promise<void> {
		const target = this.store
			.agents()
			.find((row) => row.key === this.confirmStopKey);
		if (!target) {
			this.confirmStopKey = undefined;
			this.conversationFocus = "agents";
			return;
		}
		try {
			await rpc(this.pi, "stop", {
				id: target.runId,
				...(target.childCount > 1 && target.childId
					? { childId: target.childId }
					: {}),
			});
			this.stopErrors.delete(target.key);
			this.confirmStopKey = undefined;
			this.conversationFocus = "agents";
			this.screen = "conversation";
			this.setStatus(`Stopping ${target.agent}`);
		} catch (error) {
			this.stopErrors.set(
				target.key,
				error instanceof Error ? error.message : String(error),
			);
			this.confirmStopKey = target.key;
			this.conversationFocus = "stop";
		}
		this.tui.requestRender();
	}

	private async submitComposer(rawText: string): Promise<void> {
		const sourceText = rawText.trim();
		if (!sourceText) return;
		const expandedText = sourceText.startsWith("/")
			? this.actions.expandPrompt(sourceText)
			: sourceText;
		if (sourceText.startsWith("/") && expandedText === sourceText) {
			await this.actions.submit(sourceText);
			return;
		}
		const text = expandedText;
		if (!text) return;
		const target = this.currentTarget();
		if (
			this.screen === "agent" &&
			!this.store.agents().some((row) => row.key === target)
		) {
			this.setStatus("Completed transcripts are read-only");
			return;
		}
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
		if (target !== MAIN_TARGET && this.turnGate.hasCredit(target))
			void this.flushTargetQueue(target);
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
		} else if (data === "x") {
			const item = this.selectedQueued();
			if (item) this.removeQueue(item.id);
		}
	}

	private async resumeSelectedSession(): Promise<void> {
		const selected = this.sessionList.selected();
		if (!selected) return;
		await this.actions.resumeSession(selected.path, {
			onMissingCwd: (issue) =>
				new Promise<boolean>((resolveConfirmation) => {
					this.missingCwdConfirmation = {
						sessionCwd: issue.sessionCwd,
						fallbackCwd: issue.fallbackCwd,
						resolve: resolveConfirmation,
					};
					this.tui.requestRender();
				}),
		});
	}

	private handleOverviewInput(data: string): void {
		if (this.missingCwdConfirmation) {
			const confirmation = this.missingCwdConfirmation;
			this.missingCwdConfirmation = undefined;
			confirmation.resolve(matchesKey(data, "enter"));
			this.tui.requestRender();
			return;
		}
		if (this.overviewFocus === "detail") {
			if (matchesKey(data, "escape")) this.overviewFocus = "sessions";
			else if (matchesKey(data, "enter")) {
				const selected = this.sessionList.selected();
				if (selected) void this.resumeSelectedSession();
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
				else void this.resumeSelectedSession();
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
				this.stopErrors.delete(this.confirmStopKey);
				this.confirmStopKey = undefined;
				this.conversationFocus = "agents";
			}
			return;
		}
		if (this.conversationFocus === "queue") {
			this.handleQueueInput(data);
			return;
		}
		if (
			this.conversationFocus !== "agents" &&
			(matchesKey(data, "pageUp") || matchesKey(data, "pageDown"))
		) {
			const viewport =
				this.screen === "agent"
					? this.childViewports.get(this.agentList.selected()?.key ?? "")
					: this.transcript;
			viewport?.page(matchesKey(data, "pageUp") ? -1 : 1);
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
			} else if (
				data === "x" &&
				this.agentList.selected() &&
				ACTIVE_STATES.has(this.agentList.selected()!.state)
			) {
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
			(this.store.agents().length ||
				this.store.completedAgents().length ||
				this.finishedAgents.size)
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
			this.agentList.selected() &&
			ACTIVE_STATES.has(this.agentList.selected()!.state)
		) {
			this.confirmStopKey = this.agentList.selected()?.key;
			this.conversationFocus = "stop";
			return;
		}
		if (
			this.screen === "agent" &&
			!ACTIVE_STATES.has(this.agentList.selected()?.state ?? "")
		)
			return;
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
		if (this.missingCwdConfirmation)
			return this.help(
				[
					new BubbleBinding({
						keys: ["enter"],
						help: { key: "enter", description: "use current cwd" },
					}),
					new BubbleBinding({
						keys: ["escape"],
						help: { key: "any other key", description: "cancel" },
					}),
				],
				width,
			);
		if (this.overviewFocus === "detail")
			return this.help(
				[
					new BubbleBinding({
						keys: ["enter"],
						help: { key: "enter", description: "resume" },
					}),
					new BubbleBinding({
						keys: ["escape"],
						help: { key: "esc", description: "list" },
					}),
				],
				width,
			);
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
						enabled: () =>
							ACTIVE_STATES.has(this.agentList.selected()?.state ?? ""),
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
					keys: ["pageUp", "pageDown"],
					help: { key: "pgup/pgdn", description: "history" },
				}),
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
						this.screen === "conversation" &&
						(this.store.agents().length > 0 ||
							this.store.completedAgents().length > 0 ||
							this.finishedAgents.size > 0),
				}),
				new BubbleBinding({
					keys: ["ctrl+x"],
					help: { key: "ctrl+x", description: "stop" },
					enabled: () =>
						this.screen === "agent" &&
						ACTIVE_STATES.has(this.agentList.selected()?.state ?? ""),
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
		if (this.sessionList.position().total === 0) {
			sessionLines.push("");
			sessionLines.push(
				this.theme.fg(
					"muted",
					this.store.sessions.length
						? "No matching sessions"
						: "No sessions yet",
				),
			);
			sessionLines.push(
				this.theme.fg(
					"dim",
					this.store.sessions.length
						? "Try a shorter search or another workspace."
						: "Start a conversation; it will appear here.",
				),
			);
		}

		let columns = showPreview
			? [workspaceLines, sessionLines]
			: this.overviewFocus === "workspaces"
				? [workspaceLines]
				: [sessionLines];
		let widths = showPreview ? [leftWidth, middleWidth] : [width];
		if (showPreview) {
			const selected = this.sessionList.selected();
			const summary = selected ? summaryFor(selected) : "";
			const preview = this.missingCwdConfirmation
				? [
						this.theme.fg("warning", this.theme.bold("WORKSPACE NOT FOUND")),
						"",
						...wrapTextWithAnsi(
							this.theme.fg(
								"muted",
								homeRelative(this.missingCwdConfirmation.sessionCwd),
							),
							previewWidth,
						),
						"",
						this.theme.fg("dim", "Continue in"),
						...wrapTextWithAnsi(
							this.theme.fg(
								"mdLink",
								homeRelative(this.missingCwdConfirmation.fallbackCwd),
							),
							previewWidth,
						),
						"",
						`${this.theme.fg("accent", "enter")} ${this.theme.fg("borderAccent", "Continue")}   ${this.theme.fg("dim", "any other key cancel")}`,
					]
				: selected
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
			const summary = selected ? summaryFor(selected) : "";
			columns = [
				this.missingCwdConfirmation
					? [
							this.theme.fg("warning", this.theme.bold("WORKSPACE NOT FOUND")),
							"",
							...wrapTextWithAnsi(
								this.theme.fg(
									"muted",
									homeRelative(this.missingCwdConfirmation.sessionCwd),
								),
								width,
							),
							"",
							this.theme.fg("dim", "Continue in"),
							...wrapTextWithAnsi(
								this.theme.fg(
									"mdLink",
									homeRelative(this.missingCwdConfirmation.fallbackCwd),
								),
								width,
							),
							"",
							`${this.theme.fg("accent", "enter")} ${this.theme.fg("borderAccent", "Continue")}   ${this.theme.fg("dim", "any other key cancel")}`,
						]
					: selected
						? [
								this.theme.fg(
									"dim",
									`SESSION · ${relativeTime(selected.modified)}`,
								),
								"",
								...wrapTextWithAnsi(this.theme.bold(titleFor(selected)), width),
								"",
								...wrapTextWithAnsi(
									this.theme.fg("mdLink", homeRelative(selected.cwd)),
									width,
								),
								"",
								...(summary
									? [
											...wrapTextWithAnsi(
												this.theme.fg("muted", summary),
												width,
											),
											"",
										]
									: []),
								this.theme.fg("dim", `${selected.messageCount} messages`),
								"",
								`${this.theme.fg("accent", "enter")} ${this.theme.fg("borderAccent", "Resume session")}`,
							]
						: [this.theme.fg("dim", "No session selected")],
			];
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
		const timeline = new BubbleTimeline();
		const branch = this.ctx.sessionManager.getBranch();
		const toolResults = new Map<string, boolean>();
		for (const entry of branch) {
			if (entry.type === "message" && entry.message.role === "toolResult")
				toolResults.set(entry.message.toolCallId, entry.message.isError);
		}
		const liveTools = new Map(
			this.store.activity.map((activity) => [activity.id, activity]),
		);
		for (const entry of branch) {
			if (entry.type === "message" && entry.message.role === "assistant") {
				const text = entry.message.content
					.flatMap((part) => (part.type === "text" ? [part.text] : []))
					.join("\n");
				const toolCalls = entry.message.content.filter(
					(part) => part.type === "toolCall",
				);
				if (!text && toolCalls.length === 0) continue;
				timeline.appendText({ id: entry.id, role: "assistant", text });
				for (const call of toolCalls) {
					const live = liveTools.get(call.id);
					timeline.startTool({
						id: call.id,
						name: call.name,
						summary: live?.summary ?? toolSummary(call.arguments),
						textId: entry.id,
					});
					if (live?.state === "done" || toolResults.has(call.id))
						timeline.endTool(
							call.id,
							live?.state === "error" || toolResults.get(call.id) === true,
						);
					else if (live?.state === "error") timeline.endTool(call.id, true);
				}
				continue;
			}
			const message = messageText(entry);
			if (message?.text)
				timeline.appendText({
					id: entry.id,
					role: message.role === "YOU" ? "user" : "event",
					text: message.text,
				});
		}
		if (this.store.streamingText)
			timeline.appendText({
				id: "stream:current",
				role: "assistant",
				text: this.store.streamingText,
				streaming: true,
			});
		for (const entry of timeline.entries()) {
			const label =
				entry.role === "assistant"
					? "PI"
					: entry.role === "user"
						? "YOU"
						: "EVENT";
			const color = entry.role === "assistant" ? "muted" : "text";
			const body = wrapTextWithAnsi(
				this.theme.fg(color, plainMarkdown(entry.text)),
				bodyWidth,
			);
			for (const [index, line] of body.entries()) {
				const cursor =
					entry.streaming && index === body.length - 1
						? this.theme.fg("accent", "▍")
						: "";
				lines.push(
					`${pad(index === 0 ? this.theme.fg("dim", label) : "", gutter)}  ${line}${cursor}`,
				);
			}
			const compact = timeline.visibleTools(
				entry.id,
				this.store.config.recentOutputLines,
			);
			if (compact.hidden)
				lines.push(
					`${pad("", gutter)}  ${this.theme.fg("dim", `… ${compact.hidden} earlier tools`)}`,
				);
			for (const tool of compact.visible) {
				const glyph =
					tool.state === "running"
						? this.theme.fg("accent", this.spinner.frame())
						: tool.state === "error"
							? this.theme.fg("error", "×")
							: this.theme.fg("success", "✓");
				lines.push(
					`${pad("", gutter)}  ${glyph} ${this.theme.fg("dim", `${tool.name}${tool.summary ? ` · ${firstLine(tool.summary)}` : ""}`)}`,
				);
			}
			lines.push("");
		}
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
		const marker = !ACTIVE_STATES.has(row.state)
			? this.theme.fg("success", "✓")
			: row.state === "stopping"
				? this.theme.fg("warning", this.spinner.frame())
				: row.state === "paused"
					? this.theme.fg("warning", "●")
					: this.theme.fg("accent", this.spinner.frame());
		const prefix = focus ? this.theme.fg("borderAccent", "│") : " ";
		const name = !ACTIVE_STATES.has(row.state)
			? this.theme.fg("muted", this.theme.bold(row.agent))
			: selected
				? this.theme.fg("accent", this.theme.bold(row.agent))
				: this.theme.fg("text", this.theme.bold(row.agent));
		const liveRuntime = this.agentRuntime.get(row.key);
		const runtime = [
			shortModel(liveRuntime?.model || row.model),
			liveRuntime?.thinking || row.thinking,
		]
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
				? ACTIVE_STATES.has(row.state)
					? `${this.theme.fg("accent", "↵")} interact  ${this.theme.fg("error", "x")} stop`
					: `${this.theme.fg("accent", "↵")} inspect`
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
			? ACTIVE_STATES.has(row.state)
				? `${this.theme.fg("accent", "↵")} interact  ${this.theme.fg("error", "x")} stop`
				: `${this.theme.fg("accent", "↵")} inspect`
			: this.theme.fg("dim", row.currentTool || row.state);
		return [first, alignRight(detail, action, width)];
	}

	private renderAgents(width: number, maximumLines: number): string[] {
		const active = this.store
			.agents()
			.filter((agent) => !this.hiddenAgentKeys.has(agent.key));
		const completed = [
			...this.store.completedAgents(),
			...this.finishedAgents.values(),
		]
			.filter(
				(agent, index, rows) =>
					rows.findIndex((candidate) => candidate.key === agent.key) === index,
			)
			.sort((left, right) => right.startedAt - left.startedAt);
		const agents = [...active, ...completed];
		if (agents.length === 0) return [];
		this.agentList.setItems(agents);
		const rowHeight = width < 112 ? 2 : 1;
		const visibleRows = Math.max(1, Math.floor((maximumLines - 2) / rowHeight));
		this.agentList.setHeight(
			Math.min(this.store.config.maxVisibleSubagents, visibleRows),
		);
		const position = this.agentList.position();
		const title = `${this.theme.fg("borderAccent", this.theme.bold("SUBAGENTS"))} ${this.theme.fg("dim", `${position.start}–${position.end} / ${position.total} · newest`)}`;
		const attention = active.filter((agent) => agent.state === "paused").length;
		const status = `${attention ? `${this.theme.fg("warning", `! ${attention}`)}  ` : ""}${this.theme.fg("success", "●")} ${active.length} active${completed.length ? `  ${this.theme.fg("dim", `✓ ${completed.length} completed`)}` : ""}`;
		const lines = [
			alignRight(title, status, width),
			this.theme.fg("borderMuted", "─".repeat(width)),
		];
		let completedHeaderShown = false;
		for (const match of this.agentList.visibleItems()) {
			const row = match.item;
			if (!ACTIVE_STATES.has(row.state) && !completedHeaderShown) {
				lines.push(
					this.theme.fg("dim", "COMPLETED · transcripts are read-only"),
				);
				completedHeaderShown = true;
			}
			lines.push(
				...this.renderAgentRow(row, width, row === this.agentList.selected()),
			);
			if (this.confirmStopKey === row.key && ACTIVE_STATES.has(row.state)) {
				const error = this.stopErrors.get(row.key);
				lines.push(
					truncateToWidth(
						`${this.theme.fg("borderAccent", "│")}   ${error ? this.theme.fg("error", error) : this.theme.fg("warning", `Stop ${row.agent}?`)}   ${this.theme.fg("accent", "enter")} ${error ? "retry" : "stop"}   ${this.theme.fg("dim", "any other key cancel")}`,
						width,
					),
				);
			}
		}
		return lines;
	}

	private hydrateChildTranscript(agent: AgentRow): void {
		const transcriptPath = agent.transcriptPath;
		if (!transcriptPath || this.loadedTranscriptPaths.has(transcriptPath))
			return;
		this.loadedTranscriptPaths.add(transcriptPath);
		let records: unknown[];
		try {
			records = readFileSync(transcriptPath, "utf8")
				.split(/\r?\n/)
				.filter(Boolean)
				.slice(-2_000)
				.flatMap((line) => {
					try {
						return [JSON.parse(line)];
					} catch {
						return [];
					}
				});
		} catch {
			return;
		}
		let timeline = this.childTimelines.get(agent.key);
		if (!timeline) {
			timeline = new BubbleTimeline();
			this.childTimelines.set(agent.key, timeline);
		}
		let assistantOrdinal = 0;
		let userOrdinal = 0;
		const runtime: AgentRuntime = {
			model: agent.model,
			thinking: agent.thinking,
			performance: {
				input: 0,
				output: 0,
				cacheRead: 0,
				cacheWrite: 0,
				cost: 0,
			},
		};
		for (const value of records) {
			if (!isRecord(value)) continue;
			if (
				value.recordType === "message" &&
				value.role === "user" &&
				typeof value.text === "string"
			) {
				timeline.appendText({
					id: `${agent.key}:history:user:${userOrdinal++}`,
					role: "user",
					text: value.text,
				});
			} else if (value.recordType === "message" && value.role === "assistant") {
				const text = typeof value.text === "string" ? value.text : "";
				timeline.appendText({
					id: `${agent.key}:history:assistant:${assistantOrdinal++}`,
					role: "assistant",
					text,
				});
				if (typeof value.model === "string") runtime.model = value.model;
				if (isRecord(value.usage)) {
					runtime.performance.input += finiteMetric(value.usage.input);
					runtime.performance.output += finiteMetric(value.usage.output);
					runtime.performance.cacheRead += finiteMetric(value.usage.cacheRead);
					runtime.performance.cacheWrite += finiteMetric(
						value.usage.cacheWrite,
					);
					runtime.performance.cost += finiteMetric(value.usage.cost);
				}
			} else if (
				value.recordType === "tool_start" &&
				typeof value.toolCallId === "string" &&
				typeof value.toolName === "string"
			) {
				timeline.startTool({
					id: value.toolCallId,
					name: value.toolName,
					summary:
						typeof value.argsPreview === "string"
							? value.argsPreview
							: undefined,
				});
			} else if (
				value.recordType === "tool_end" &&
				typeof value.toolCallId === "string"
			) {
				timeline.endTool(value.toolCallId, value.isError === true);
			}
		}
		this.agentRuntime.set(agent.key, runtime);
	}

	private agentTranscriptLines(width: number, height: number): string[] {
		const agent = this.agentList.selected();
		if (!agent) return Array.from({ length: height }, () => "");
		this.hydrateChildTranscript(agent);
		let viewport = this.childViewports.get(agent.key);
		if (!viewport) {
			viewport = new BubbleViewport(height);
			viewport.goToEnd();
			this.childViewports.set(agent.key, viewport);
		}
		const labelWidth = width >= 100 ? 10 : 7;
		const bodyWidth = Math.max(16, width - labelWidth - 2);
		const live = this.childTimelines.get(agent.key);
		if (live?.entries().length) {
			const liveLines: string[] = [];
			for (const entry of live.entries()) {
				const label = entry.role === "user" ? "YOU" : agent.agent.toUpperCase();
				for (const [index, line] of wrapTextWithAnsi(
					this.theme.fg(
						entry.role === "user" ? "text" : "muted",
						plainMarkdown(entry.text),
					),
					bodyWidth,
				).entries()) {
					liveLines.push(
						`${pad(index === 0 ? this.theme.fg("dim", label) : "", labelWidth)}  ${line}${entry.streaming && index === wrapTextWithAnsi(plainMarkdown(entry.text), bodyWidth).length - 1 ? this.theme.fg("accent", "▍") : ""}`,
					);
				}
				const compact = live.visibleTools(
					entry.id,
					this.store.config.recentOutputLines,
				);
				if (compact.hidden)
					liveLines.push(
						`${pad("", labelWidth)}  ${this.theme.fg("dim", `… ${compact.hidden} earlier tools`)}`,
					);
				for (const tool of compact.visible) {
					const glyph =
						tool.state === "running"
							? this.theme.fg("accent", this.spinner.frame())
							: tool.state === "error"
								? this.theme.fg("error", "×")
								: this.theme.fg("success", "✓");
					liveLines.push(
						`${pad("", labelWidth)}  ${glyph} ${this.theme.fg("dim", `${tool.name}${tool.summary ? ` · ${firstLine(tool.summary)}` : ""}`)}`,
					);
				}
				liveLines.push("");
			}
			viewport.setHeight(height);
			viewport.setContent(liveLines, true);
			return viewport.render(width);
		}
		const lines: string[] = [
			`${pad(this.theme.fg("dim", "EVENT"), labelWidth)}  ${this.theme.fg("muted", agent.transcriptPath ? "Transcript has no displayable messages yet." : "Transcript unavailable for this run.")}`,
		];
		if (this.confirmStopKey === agent.key) {
			lines.push("");
			lines.push(
				truncateToWidth(
					`${this.theme.fg("borderAccent", "│")} ${this.theme.fg("warning", `Stop ${agent.agent}?`)}   ${this.theme.fg("accent", "enter")} stop   ${this.theme.fg("dim", "any other key cancel")}`,
					width,
				),
			);
		}
		viewport.setHeight(height);
		viewport.setContent(lines, true);
		return viewport.render(width);
	}

	private renderQueue(width: number): string[] {
		const queue = this.targetQueue();
		if (!queue.length) return [];
		this.selectedQueue = Math.max(
			0,
			Math.min(this.selectedQueue, queue.length - 1),
		);
		const windowStart = Math.max(
			0,
			Math.min(queue.length - 3, this.selectedQueue - 1),
		);
		const visible = queue.slice(windowStart, windowStart + 3);
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
				`│${pad(
					alignRight(
						`${prefix} ${this.theme.fg("accent", `${absolute + 1}.`)} ${this.theme.fg("text", item.text)}`,
						`→ ${state}`,
						inner,
					),
					inner,
				)}│`,
			);
			if (this.redirectQueueId === item.id) {
				lines.push(
					`│${pad(
						truncateToWidth(
							`${this.theme.fg("warning", "│   Interrupt the current turn and deliver immediately?")}   ${this.theme.fg("accent", "enter")} redirect   ${this.theme.fg("dim", "any other key cancel")}`,
							inner,
						),
						inner,
					)}│`,
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
		const selectedAgent =
			this.screen === "agent" ? this.agentList.selected() : undefined;
		const childRuntime = selectedAgent
			? this.agentRuntime.get(selectedAgent.key)
			: undefined;
		const performance = childRuntime?.performance ?? this.store.performance;
		const mainUsage = selectedAgent ? undefined : this.ctx.getContextUsage();
		const childTokens =
			selectedAgent?.tokens ?? performance.input + performance.output;
		const childContextLimit = selectedAgent?.contextLimit;
		const percent =
			mainUsage?.percent ??
			(childContextLimit
				? Math.min(100, (childTokens / childContextLimit) * 100)
				: 0);
		const barWidth = width >= 100 ? 10 : 5;
		const filled = Math.max(
			0,
			Math.min(barWidth, Math.round((percent / 100) * barWidth)),
		);
		const bar = `${this.theme.fg("borderAccent", "█".repeat(filled))}${this.theme.fg("borderMuted", "░".repeat(barWidth - filled))}`;
		const ttft =
			performance.ttftMs === undefined
				? "TTFT —"
				: `TTFT ${(performance.ttftMs / 1_000).toFixed(2)}s`;
		const tpot =
			performance.tokensPerSecond === undefined
				? "TPOT —"
				: `TPOT ${performance.tokensPerSecond.toFixed(1)} tok/s`;
		const context = mainUsage
			? `${mainUsage.tokens === null ? "—" : compactTokens(mainUsage.tokens)}/${compactTokens(mainUsage.contextWindow)}`
			: childContextLimit
				? `${compactTokens(childTokens)}/${compactTokens(childContextLimit)}`
				: compactTokens(childTokens);
		const io = `↑${compactTokens(performance.input)} ↓${compactTokens(performance.output)} cache ${compactTokens(performance.cacheRead)} $${performance.cost.toFixed(3)}`;
		const left = `${this.theme.fg("dim", "CTX")} ${bar} ${this.theme.fg("muted", `${percent.toFixed(1)}% · ${context}`)}   ${this.theme.fg("dim", ttft)}   ${this.theme.fg("dim", tpot)}${width >= 120 ? `   ${this.theme.fg("dim", io)}` : ""}`;
		const right =
			this.statusUntil > Date.now()
				? this.theme.fg("accent", this.statusMessage)
				: this.theme.fg(
						"muted",
						selectedAgent
							? `${shortModel(childRuntime?.model || selectedAgent.model)} · ${childRuntime?.thinking || selectedAgent.thinking || "—"}`
							: `${shortModel(this.store.modelId || this.ctx.model?.id)} · ${this.store.thinking || this.ctx.thinkingLevel || this.pi.getThinkingLevel()}`,
					);
		return alignRight(left, right, width);
	}

	private composerLines(width: number): string[] {
		const selectedAgent =
			this.screen === "agent" ? this.agentList.selected() : undefined;
		if (selectedAgent && this.confirmStopKey === selectedAgent.key) {
			this.composer.focused = false;
			const error = this.stopErrors.get(selectedAgent.key);
			return [
				this.theme.fg("dim", `STOP · ${selectedAgent.agent}`),
				truncateToWidth(
					`${this.theme.fg("borderAccent", "│")} ${error ? this.theme.fg("error", error) : this.theme.fg("warning", `Stop ${selectedAgent.agent}?`)}   ${this.theme.fg("accent", "enter")} ${error ? "retry" : "stop"}   ${this.theme.fg("dim", "any other key cancel")}`,
					width,
				),
			];
		}
		if (
			this.screen === "agent" &&
			!ACTIVE_STATES.has(this.agentList.selected()?.state ?? "")
		) {
			this.composer.focused = false;
			return [
				this.theme.fg("dim", "COMPLETED TRANSCRIPT · read-only"),
				this.theme.fg("muted", "esc back to conversation"),
			];
		}
		const target =
			this.screen === "agent"
				? this.agentList.selected()?.agent || "subagent"
				: "Pi";
		const label = this.editingQueueId
			? `EDIT QUEUED · ${target}`
			: `TO · ${target}`;
		this.composer.focused = this.conversationFocus === "composer";
		return [this.theme.fg("dim", label), ...this.composer.render(width)];
	}

	private renderConversation(width: number, rows: number): string[] {
		const selected = this.agentList.selected();
		const selectedRuntime = selected
			? this.agentRuntime.get(selected.key)
			: undefined;
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
				? [
						shortModel(selectedRuntime?.model || selected?.model),
						selectedRuntime?.thinking || selected?.thinking,
					]
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
		const initialScreen: Screen =
			event.reason === "resume" || event.reason === "fork"
				? "conversation"
				: "overview";
		ctx.ui.setRootView((tui, theme, _keybindings, actions, composer) => {
			shell = new WorkspaceShell(
				pi,
				ctx,
				store,
				tui,
				theme,
				actions,
				composer,
				initialScreen,
			);
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
		store.streamingText = "";
		render();
	});
	pi.on("tool_execution_start", (event) => {
		store.addActivity(
			event.toolCallId,
			event.toolName,
			"running",
			toolSummary(event.args),
		);
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
	pi.on("turn_end", (event) => {
		void shell?.flushMainQueue(event.turnIndex);
		store.activity.length = 0;
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
