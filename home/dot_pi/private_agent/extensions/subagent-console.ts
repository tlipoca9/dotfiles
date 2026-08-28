import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";

import {
	AssistantMessageComponent,
	type ExtensionAPI,
	type ExtensionContext,
	type Theme,
	ToolExecutionComponent,
} from "@earendil-works/pi-coding-agent";
import {
	type Component,
	Key,
	matchesKey,
	stripTerminalSequences,
	type TUI,
	truncateToWidth,
	visibleWidth,
	wrapTextWithAnsi,
} from "@earendil-works/pi-tui";

const WIDGET_KEY = "workspace-subagents";
const TOP_BAR_KEY = "workspace-shell-bar";
const OPEN_SHORTCUT = Key.ctrlAlt("a");
const POLL_INTERVAL_MS = 750;
const MAIN_TARGET = "__main_agent__";
const ACTIVE_STATES = new Set(["pending", "queued", "running", "paused", "stopping"]);
const VISIBILITY_PATCH_KEY = Symbol.for("tlipoca9.pi.latest-progress.v2");

interface DashboardConfig {
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
	lastActivityAt?: number;
	tokens?: { input?: number; output?: number; total?: number; window?: number };
}

interface AsyncStatus {
	runId?: string;
	state?: string;
	mode?: string;
	agent?: string;
	agents?: string[];
	goal?: string;
	task?: string;
	currentTool?: string;
	recentOutput?: string[] | string;
	startedAt?: number;
	lastUpdate?: number;
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

type QueueMode = "auto" | "follow_up" | "steer";

interface QueuedMessage {
	id: string;
	targetKey: string;
	text: string;
	mode: QueueMode;
	createdAt: number;
	state: "queued" | "editing" | "sending" | "failed";
	error?: string;
}

type RpcMethod = "status" | "steer" | "stop";

type RpcReply = {
	success: true;
	data: unknown;
} | {
	success: false;
	error: { code?: string; message?: string };
};

type AssistantUpdate = typeof AssistantMessageComponent.prototype.updateContent;
type AssistantMessage = Parameters<AssistantUpdate>[0];
type SetToolExpanded = typeof ToolExecutionComponent.prototype.setExpanded;
type ToolRender = typeof ToolExecutionComponent.prototype.render;

interface AssistantSnapshot {
	message: AssistantMessage;
	rendered: AssistantMessage;
	isStreaming: boolean;
}

interface VisibilityPatchState {
	active: boolean;
	assistants: Set<AssistantMessageComponent>;
	assistantSnapshots: WeakMap<AssistantMessageComponent, AssistantSnapshot>;
	enabled: boolean;
	expanded: WeakMap<ToolExecutionComponent, boolean>;
	latestThinking?: AssistantMessageComponent;
	latestTool?: ToolExecutionComponent;
	originalAssistantUpdate: AssistantUpdate;
	originalSetExpanded: SetToolExpanded;
	originalToolRender: ToolRender;
}

type ToolExecutionPrototype = typeof ToolExecutionComponent.prototype & {
	[key: symbol]: VisibilityPatchState | undefined;
};

function hasThinking(message: AssistantMessage): boolean {
	return message.content.some((content) => content.type === "thinking" && content.thinking.trim() !== "");
}

function filterThinking(message: AssistantMessage, showLatest: boolean): AssistantMessage {
	let latestThinking = -1;
	if (showLatest) {
		for (let index = message.content.length - 1; index >= 0; index--) {
			const content = message.content[index];
			if (content.type === "thinking" && content.thinking.trim() !== "") {
				latestThinking = index;
				break;
			}
		}
	}
	return {
		...message,
		content: message.content.map((content, index) =>
			content.type === "thinking" && index !== latestThinking ? { ...content, thinking: "" } : content,
		),
	};
}

function renderAssistant(
	state: VisibilityPatchState,
	component: AssistantMessageComponent,
	showLatest: boolean,
): void {
	const snapshot = state.assistantSnapshots.get(component);
	if (!snapshot) return;
	const rendered = filterThinking(snapshot.message, showLatest);
	snapshot.rendered = rendered;
	state.originalAssistantUpdate.call(component, rendered, snapshot.isStreaming);
}

function clearLatestProgress(state: VisibilityPatchState): void {
	state.active = false;
	const latestTool = state.latestTool;
	state.latestTool = undefined;
	latestTool?.invalidate();
	const latestThinking = state.latestThinking;
	state.latestThinking = undefined;
	if (latestThinking) renderAssistant(state, latestThinking, false);
}

function disableVisibilityPatch(state: VisibilityPatchState, preserveSnapshots: boolean): void {
	state.enabled = false;
	state.active = false;
	state.latestTool?.invalidate();
	state.latestTool = undefined;
	state.latestThinking = undefined;
	for (const component of state.assistants) {
		const snapshot = state.assistantSnapshots.get(component);
		if (snapshot) state.originalAssistantUpdate.call(component, snapshot.message, snapshot.isStreaming);
	}
	if (!preserveSnapshots) state.assistants.clear();
}

function installVisibilityPatch(): VisibilityPatchState {
	const toolPrototype = ToolExecutionComponent.prototype as ToolExecutionPrototype;
	const installed = toolPrototype[VISIBILITY_PATCH_KEY];
	if (installed) {
		installed.enabled = true;
		installed.active = false;
		for (const component of installed.assistants) renderAssistant(installed, component, false);
		return installed;
	}

	const assistantPrototype = AssistantMessageComponent.prototype;
	const state: VisibilityPatchState = {
		active: false,
		assistants: new Set(),
		assistantSnapshots: new WeakMap(),
		enabled: true,
		expanded: new WeakMap(),
		originalAssistantUpdate: assistantPrototype.updateContent,
		originalSetExpanded: toolPrototype.setExpanded,
		originalToolRender: toolPrototype.render,
	};

	assistantPrototype.updateContent = function updateAssistantContent(
		message: AssistantMessage,
		isStreaming?: boolean,
	): void {
		if (!state.enabled) {
			state.originalAssistantUpdate.call(this, message, isStreaming);
			return;
		}
		const existing = state.assistantSnapshots.get(this);
		const source = existing && existing.rendered === message ? existing.message : message;
		const snapshot: AssistantSnapshot = {
			message: source,
			rendered: source,
			isStreaming: isStreaming ?? existing?.isStreaming ?? false,
		};
		state.assistants.add(this);
		state.assistantSnapshots.set(this, snapshot);
		if (state.active && hasThinking(source) && state.latestThinking !== this) {
			const previous = state.latestThinking;
			state.latestThinking = this;
			if (previous) renderAssistant(state, previous, false);
		}
		renderAssistant(state, this, state.active && state.latestThinking === this);
	};

	toolPrototype.setExpanded = function setToolExpanded(expanded: boolean): void {
		const isNew = !state.expanded.has(this);
		state.expanded.set(this, expanded);
		state.originalSetExpanded.call(this, expanded);
		if (state.enabled && isNew) {
			const previous = state.latestTool;
			state.latestTool = this;
			previous?.invalidate();
			this.invalidate();
		}
	};
	toolPrototype.render = function renderToolExecution(width: number): string[] {
		if (state.enabled && state.expanded.get(this) !== true && (!state.active || state.latestTool !== this)) return [];
		return state.originalToolRender.call(this, width);
	};

	toolPrototype[VISIBILITY_PATCH_KEY] = state;
	return state;
}

function configPath(): string {
	return join(process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent"), "extensions", "workspace-ui.json");
}

function positiveInteger(value: unknown, fallback: number): number {
	return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : fallback;
}

function loadConfig(): DashboardConfig {
	try {
		const parsed = JSON.parse(readFileSync(configPath(), "utf8")) as Partial<DashboardConfig>;
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
	return stripTerminalSequences(value)
		.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
		.replace(/\bBearer\s+\S+/gi, "Bearer [redacted]")
		.replace(/\b(?:sk|ghp|github_pat|xox[baprs]|tai_pat)[-_\w]{8,}\b/g, "[redacted]")
		.trim();
}

function outputLines(value: string[] | string | undefined, limit: number): string[] {
	const source = Array.isArray(value) ? value : typeof value === "string" ? value.split(/\r?\n/) : [];
	return source.map(cleanText).filter(Boolean).slice(-limit);
}

function formatDuration(startedAt: number, now = Date.now()): string {
	const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m`;
	return `${Math.floor(minutes / 60)}h`;
}

function formatTokens(value: number | undefined): string {
	if (!value) return "";
	if (value < 1_000) return `${value} tok`;
	return `${(value / 1_000).toFixed(value < 10_000 ? 1 : 0)}k tok`;
}

function shortModel(value: string | undefined): string {
	if (!value) return "";
	return value.includes("/") ? value.slice(value.lastIndexOf("/") + 1) : value;
}

function firstLine(value: string | undefined): string {
	return cleanText(value).split(/\r?\n/).find(Boolean) ?? "";
}

function readStatus(run: TrackedRun): AsyncStatus | undefined {
	try {
		const parsed = JSON.parse(readFileSync(join(run.asyncDir, "status.json"), "utf8"));
		return isRecord(parsed) ? parsed as AsyncStatus : undefined;
	} catch {
		return run.status;
	}
}

function childId(step: AsyncStatusStep, index: number): string {
	return step.workflowKey || step.runId || `step:${index}`;
}

function rowsForRun(run: TrackedRun, config: DashboardConfig): AgentRow[] {
	const status = run.status;
	const steps = status?.steps;
	if (steps?.length) {
		return steps.flatMap((step, index) => {
			const state = step.status || status?.state || "running";
			if (!ACTIVE_STATES.has(state)) return [];
			return [{
				key: `${run.id}:${index}`,
				runId: run.id,
				index,
				childId: childId(step, index),
				agent: cleanText(step.agent) || run.agents[index] || run.agents[0] || "subagent",
				goal: firstLine(step.description || step.label || step.phase || status?.goal || status?.task || run.goal),
				state,
				model: cleanText(step.model) || undefined,
				thinking: cleanText(step.thinking || step.effort) || undefined,
				currentTool: cleanText(step.currentTool || status?.currentTool) || undefined,
				recentOutput: outputLines(step.recentOutput || status?.recentOutput, config.recentOutputLines),
				startedAt: step.startedAt || status?.startedAt || run.startedAt,
				tokens: step.tokens?.total,
				childCount: steps.length,
			}];
		});
	}
	const state = status?.state || "running";
	if (!ACTIVE_STATES.has(state)) return [];
	return (run.agents.length ? run.agents : [status?.agent || "subagent"]).map((agent, index, agents) => ({
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

function targetLabel(targetKey: string, rows: readonly AgentRow[]): string {
	if (targetKey === MAIN_TARGET) return "main";
	return rows.find((row) => row.key === targetKey)?.agent || "retarget";
}

function targetKeys(rows: readonly AgentRow[]): string[] {
	return [MAIN_TARGET, ...rows.map((row) => row.key)];
}

function nextQueuedMessage(queue: readonly QueuedMessage[], targetKey: string): QueuedMessage | undefined {
	const first = queue.find((item) => item.targetKey === targetKey);
	return first?.state === "queued" ? first : undefined;
}

class SubagentStore {
	private readonly runs = new Map<string, TrackedRun>();
	readonly queue: QueuedMessage[] = [];

	constructor(readonly config: DashboardConfig) {}

	clear(): void {
		this.runs.clear();
		this.queue.splice(0);
	}

	track(event: AsyncStartedEvent): void {
		const id = cleanText(event.id);
		const asyncDir = typeof event.asyncDir === "string" ? event.asyncDir : "";
		if (!id || !asyncDir) return;
		const agents = Array.isArray(event.agents)
			? event.agents.map(cleanText).filter(Boolean)
			: event.agent ? [cleanText(event.agent)] : [];
		this.runs.set(id, {
			id,
			asyncDir,
			goal: firstLine(event.goal || event.task),
			agents,
			startedAt: Date.now(),
		});
	}

	refresh(): void {
		for (const run of this.runs.values()) run.status = readStatus(run);
	}

	rows(): AgentRow[] {
		return [...this.runs.values()]
			.flatMap((run) => rowsForRun(run, this.config))
			.sort((left, right) => right.startedAt - left.startedAt);
	}

	queueMessage(targetKey: string, text: string, existingId?: string): void {
		const existing = existingId ? this.queue.find((item) => item.id === existingId) : undefined;
		if (existing) {
			existing.text = text;
			existing.targetKey = targetKey;
			existing.state = "queued";
			existing.error = undefined;
			return;
		}
		this.queue.push({
			id: randomUUID(),
			targetKey,
			text,
			mode: "auto",
			createdAt: Date.now(),
			state: "queued",
		});
	}
}

function rpc(pi: ExtensionAPI, method: RpcMethod, params: Record<string, unknown>): Promise<unknown> {
	const requestId = randomUUID();
	return new Promise((resolve, reject) => {
		let settled = false;
		const unsubscribe = pi.events.on(`subagents:rpc:v1:reply:${requestId}`, (raw) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			unsubscribe?.();
			if (!isRecord(raw)) {
				reject(new Error("pi-subagents returned an invalid reply"));
				return;
			}
			const reply = raw as RpcReply;
			if (reply.success) resolve(reply.data);
			else reject(new Error(reply.error?.message || "pi-subagents request failed"));
		});
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
			source: { extension: "workspace-subagent-console" },
		});
	});
}

async function sendQueuedMessage(
	pi: ExtensionAPI,
	store: SubagentStore,
	item: QueuedMessage,
): Promise<{ agent: string }> {
	if (item.targetKey === MAIN_TARGET) {
		if (item.state === "sending") throw new Error("Message is already being sent.");
		item.state = "sending";
		item.error = undefined;
		try {
			pi.sendUserMessage(item.text, { deliverAs: item.mode === "steer" ? "steer" : "followUp" });
			const index = store.queue.indexOf(item);
			if (index >= 0) store.queue.splice(index, 1);
			return { agent: "main" };
		} catch (error) {
			item.state = "failed";
			item.error = error instanceof Error ? error.message : String(error);
			throw error;
		}
	}
	const target = store.rows().find((row) => row.key === item.targetKey);
	if (!target) {
		item.state = "failed";
		item.error = "Target subagent is no longer active; retarget this message before sending.";
		throw new Error(item.error);
	}
	if (item.state === "sending") throw new Error("Message is already being sent.");
	item.state = "sending";
	item.error = undefined;
	try {
		await rpc(pi, "steer", {
			id: target.runId,
			message: item.text,
			mode: item.mode,
			...(target.childCount > 1 ? { index: target.index } : {}),
		});
		const index = store.queue.indexOf(item);
		if (index >= 0) store.queue.splice(index, 1);
		return { agent: target.agent };
	} catch (error) {
		item.state = "failed";
		item.error = error instanceof Error ? error.message : String(error);
		throw error;
	}
}

function clip(value: string, width: number): string {
	return truncateToWidth(value, Math.max(1, width));
}

function alignRight(left: string, right: string, width: number): string {
	const clippedRight = truncateToWidth(right, Math.max(1, width - 1));
	const leftWidth = Math.max(1, width - visibleWidth(clippedRight) - 1);
	const clippedLeft = truncateToWidth(left, leftWidth);
	return `${clippedLeft}${" ".repeat(Math.max(1, width - visibleWidth(clippedLeft) - visibleWidth(clippedRight)))}${clippedRight}`;
}

function topBarLines(pi: ExtensionAPI, ctx: ExtensionContext, theme: Theme, width: number): string[] {
	const session = cleanText(pi.getSessionName()) || "Current session";
	const workspace = basename(ctx.cwd) || ctx.cwd;
	const home = homedir();
	const path = ctx.cwd === home ? "~" : ctx.cwd.startsWith(`${home}/`) ? `~/${ctx.cwd.slice(home.length + 1)}` : ctx.cwd;
	const chip = theme.bg("selectedBg", theme.fg("borderAccent", theme.bold(" CONVERSATION ")));
	const left = `${theme.bold("π")}  ${chip}  ${theme.fg("muted", `${workspace} / ${session}`)}`;
	return [alignRight(left, theme.fg("dim", path), width), theme.fg("borderMuted", "─".repeat(width))];
}

function footerLine(
	pi: ExtensionAPI,
	modelId: string | undefined,
	branch: string | null,
	theme: Theme,
	width: number,
): string {
	const action = (key: string, label: string) => `${theme.fg("accent", theme.bold(key))} ${theme.fg("dim", label)}`;
	const left = `${action("/sessions", "workspaces")}   ${action("ctrl alt a", "subagents")}`;
	const right = [branch, shortModel(modelId), pi.getThinkingLevel()].filter(Boolean).join(" · ");
	return alignRight(left, theme.fg("muted", right), width);
}

type ConsoleFocus = "agents" | "queue" | "compose" | "redirect" | "stop";

class SubagentConsoleComponent {
	private active = false;
	private focus: ConsoleFocus = "agents";
	private selectedAgent = 0;
	private agentOffset = 0;
	private selectedQueue = 0;
	private draft = "";
	private editingQueueId: string | undefined;
	private timer: ReturnType<typeof setInterval>;

	constructor(
		private readonly pi: ExtensionAPI,
		private readonly store: SubagentStore,
		private readonly theme: Theme,
		private readonly requestRender: () => void,
		private readonly notify: ExtensionContext["ui"]["notify"],
		private readonly done: () => void,
	) {
		if (this.rows().length === 0 && this.store.queue.length > 0) this.focus = "queue";
		this.timer = setInterval(() => {
			this.store.refresh();
			this.normalizeSelection();
			this.requestRender();
		}, POLL_INTERVAL_MS);
	}

	private rows(): AgentRow[] {
		return this.store.rows();
	}

	activate(): void {
		this.active = true;
		this.normalizeSelection();
	}

	deactivate(): void {
		this.active = false;
		this.focus = "agents";
		const editing = this.store.queue.find((item) => item.id === this.editingQueueId);
		if (editing?.state === "editing") editing.state = "queued";
		this.draft = "";
		this.editingQueueId = undefined;
	}

	private normalizeSelection(): void {
		this.selectedAgent = Math.max(0, Math.min(this.selectedAgent, this.rows().length - 1));
		this.keepAgentVisible();
		this.selectedQueue = Math.max(0, Math.min(this.selectedQueue, this.store.queue.length - 1));
		if (this.focus === "queue" && this.store.queue.length === 0) this.focus = "agents";
	}

	private selectedRow(): AgentRow | undefined {
		return this.rows()[this.selectedAgent];
	}

	private selectedQueued(): QueuedMessage | undefined {
		return this.store.queue[this.selectedQueue];
	}

	private keepAgentVisible(): void {
		const height = this.store.config.maxVisibleSubagents;
		if (this.selectedAgent < this.agentOffset) this.agentOffset = this.selectedAgent;
		if (this.selectedAgent >= this.agentOffset + height) this.agentOffset = this.selectedAgent - height + 1;
	}

	private move(delta: number): void {
		if (this.focus === "queue") {
			this.selectedQueue = Math.max(0, Math.min(this.store.queue.length - 1, this.selectedQueue + delta));
		} else {
			this.selectedAgent = Math.max(0, Math.min(this.rows().length - 1, this.selectedAgent + delta));
			this.keepAgentVisible();
		}
	}

	private beginCompose(item?: QueuedMessage): void {
		const row = this.selectedRow();
		if (!row && !item) return;
		if (item) {
			const targetIndex = this.rows().findIndex((candidate) => candidate.key === item.targetKey);
			if (targetIndex >= 0) {
				this.selectedAgent = targetIndex;
				this.keepAgentVisible();
			}
		}
		this.draft = item?.text ?? "";
		this.editingQueueId = item?.id;
		if (item) item.state = "editing";
		this.focus = "compose";
	}

	private retarget(delta: number): void {
		const item = this.selectedQueued();
		const rows = this.rows();
		if (!item) return;
		const targets = targetKeys(rows);
		const current = targets.indexOf(item.targetKey);
		const next = (Math.max(0, current) + delta + targets.length) % targets.length;
		item.targetKey = targets[next]!;
		item.state = "queued";
		item.error = undefined;
	}

	private reorder(delta: number): void {
		const from = this.selectedQueue;
		const to = Math.max(0, Math.min(this.store.queue.length - 1, from + delta));
		if (from === to) return;
		const [item] = this.store.queue.splice(from, 1);
		if (!item) return;
		this.store.queue.splice(to, 0, item);
		this.selectedQueue = to;
	}

	private async dispatchQueued(mode?: QueueMode): Promise<void> {
		const item = this.selectedQueued();
		if (!item || item.state === "sending") return;
		if (mode) item.mode = mode;
		this.requestRender();
		try {
			const { agent } = await sendQueuedMessage(this.pi, this.store, item);
			this.normalizeSelection();
			this.notify(`Sent to ${agent}`, "info");
		} catch {}
		this.requestRender();
	}

	private async stopSelected(): Promise<void> {
		const target = this.selectedRow();
		if (!target) return;
		this.focus = "agents";
		this.requestRender();
		try {
			await rpc(this.pi, "stop", {
				id: target.runId,
				...(target.childCount > 1 && target.childId ? { childId: target.childId } : {}),
			});
			this.notify(`Stopping ${target.agent}`, "info");
		} catch (error) {
			this.notify(error instanceof Error ? error.message : String(error), "error");
		}
	}

	handleInput(data: string): void {
		if (this.focus === "redirect") {
			if (matchesKey(data, "return")) void this.dispatchQueued("steer");
			this.focus = "queue";
			this.requestRender();
			return;
		}
		if (this.focus === "stop") {
			if (matchesKey(data, "return")) void this.stopSelected();
			else this.focus = "agents";
			this.requestRender();
			return;
		}

		if (this.focus === "compose") {
			if (matchesKey(data, "escape")) {
				const editing = this.store.queue.find((item) => item.id === this.editingQueueId);
				if (editing?.state === "editing") editing.state = "queued";
				this.focus = this.editingQueueId ? "queue" : "agents";
				this.draft = "";
				this.editingQueueId = undefined;
				return;
			}
			if (matchesKey(data, "return")) {
				const text = this.draft.trim();
				const target = this.editingQueueId
					? this.selectedQueued()?.targetKey
					: this.selectedRow()?.key;
				if (text && target) this.store.queueMessage(target, text, this.editingQueueId);
				this.focus = "queue";
				this.selectedQueue = this.editingQueueId
					? Math.max(0, this.store.queue.findIndex((item) => item.id === this.editingQueueId))
					: Math.max(0, this.store.queue.length - 1);
				this.draft = "";
				this.editingQueueId = undefined;
				return;
			}
			if (matchesKey(data, "backspace")) {
				this.draft = this.draft.slice(0, -1);
				return;
			}
			if ([...data].every((character) => character >= " ")) this.draft += data;
			return;
		}

		if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) {
			this.done();
			return;
		}
		if (matchesKey(data, "tab")) {
			this.focus = this.focus === "agents" && this.store.queue.length ? "queue" : "agents";
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

		if (this.focus === "queue") {
			if (matchesKey(data, "left")) this.retarget(-1);
			else if (matchesKey(data, "right")) this.retarget(1);
			else if (data === "K") this.reorder(-1);
			else if (data === "J") this.reorder(1);
			else if (data === "e" || matchesKey(data, "return")) this.beginCompose(this.selectedQueued());
			else if (data === "r") this.focus = "redirect";
			else if (data === "x") {
				this.store.queue.splice(this.selectedQueue, 1);
				this.normalizeSelection();
			} else if (data === "s") void this.dispatchQueued();
			return;
		}

		if ((data === "s" || matchesKey(data, "return")) && this.selectedRow()) this.beginCompose();
		else if ((data === "x" || data === "D") && this.selectedRow()) this.focus = "stop";
	}

	private hotkey(key: string, label: string): string {
		return `${this.theme.fg("accent", this.theme.bold(key))} ${this.theme.fg("dim", label)}`;
	}

	private renderAgent(row: AgentRow, index: number, width: number): string[] {
		const selected = index === this.selectedAgent;
		const active = this.active && selected && this.focus !== "queue";
		const marker = row.state === "stopping" ? this.theme.fg("warning", "◌") : this.theme.fg("success", "●");
		const model = [shortModel(row.model), row.thinking, formatTokens(row.tokens)].filter(Boolean).join(" · ");
		const name = selected ? this.theme.fg("accent", this.theme.bold(row.agent)) : this.theme.fg("text", this.theme.bold(row.agent));
		const prefix = active ? this.theme.fg("borderAccent", "│") : " ";
		let first: string;
		if (width >= 104) {
			const gap = "  ";
			const actionWidth = 18;
			const nameWidth = Math.min(24, Math.max(18, Math.floor(width * 0.18)));
			const activityWidth = Math.min(30, Math.max(18, Math.floor(width * 0.22)));
			const runtimeWidth = Math.min(28, Math.max(20, Math.floor(width * 0.2)));
			const taskWidth = Math.max(12, width - nameWidth - activityWidth - runtimeWidth - actionWidth - visibleWidth(gap) * 4);
			const cell = (value: string, cellWidth: number): string => {
				const clipped = truncateToWidth(value, cellWidth);
				return clipped + " ".repeat(Math.max(0, cellWidth - visibleWidth(clipped)));
			};
			const identity = `${prefix} ${marker} ${name} ${this.theme.fg("dim", formatDuration(row.startedAt))}`;
			const activity = row.currentTool ? `Working · ${row.currentTool}` : row.state;
			const actions = selected
				? `${this.hotkey("↵", "interact")} ${this.hotkey("x", "stop")}`
				: "";
			first = [
				cell(identity, nameWidth),
				cell(this.theme.fg("muted", row.goal), taskWidth),
				cell(this.theme.fg("dim", activity), activityWidth),
				cell(this.theme.fg("muted", model), runtimeWidth),
				cell(actions, actionWidth),
			].join(gap);
		} else {
			const meta = [model, formatDuration(row.startedAt)].filter(Boolean).join("  ");
			const left = `${prefix} ${marker} ${name}${row.goal ? this.theme.fg("dim", `  ${row.goal}`) : ""}`;
			first = alignRight(left, this.theme.fg("muted", meta), width);
		}
		const lines = [first];
		if (!selected) return lines;
		if (width < 104) {
			const activity = row.currentTool ? `Working · ${row.currentTool}` : row.state;
			lines.push(clip(this.theme.fg("muted", `│    ${activity}`), width));
		}
		for (const output of row.recentOutput) lines.push(clip(this.theme.fg("dim", `│    ${output}`), width));
		if (this.focus === "compose") {
			lines.push(clip(`${this.theme.fg("borderAccent", "│")}    ${this.theme.fg("muted", `Message ${row.agent}`)}`, width));
			lines.push(clip(`${this.theme.fg("borderAccent", "│")}    ${this.theme.fg("text", this.draft)}${this.theme.fg("accent", "▌")}`, width));
			lines.push(clip(`${this.theme.fg("borderAccent", "│")}    ${this.hotkey("enter", "queue")}   ${this.hotkey("esc", "cancel")}`, width));
		} else if (this.focus === "stop") {
			lines.push(clip(`${this.theme.fg("borderAccent", "│")}    ${this.theme.fg("warning", `Stop ${row.agent}?`)}   ${this.hotkey("enter", "stop")}   ${this.hotkey("any key", "cancel")}`, width));
		} else if (active) {
			lines.push(clip(`${this.theme.fg("borderAccent", "│")}    ${this.hotkey("enter", "interact")}   ${this.hotkey("x", "stop")}`, width));
		}
		return lines;
	}

	private renderQueue(rows: AgentRow[], width: number): string[] {
		if (this.store.queue.length === 0) return [];
		const lines = ["", this.theme.fg("borderMuted", "─".repeat(width)), `${this.theme.bold("Queued")} ${this.theme.fg("dim", `· ${this.store.queue.length}`)}`];
		for (const [index, item] of this.store.queue.entries()) {
			const selected = index === this.selectedQueue;
			const active = this.active && selected && (this.focus === "queue" || this.focus === "redirect");
			const arrow = item.state === "sending" ? this.theme.fg("warning", "◌") : this.theme.fg("accent", "→");
			const prefix = active ? this.theme.fg("borderAccent", "│") : " ";
			const state = item.state === "failed" ? this.theme.fg("error", "failed") : "";
			lines.push(clip(`${prefix} ${selected ? this.theme.fg("accent", `${index + 1}.`) : `${index + 1}.`} ${this.theme.fg("text", item.text)}  ${arrow} ${this.theme.fg("muted", targetLabel(item.targetKey, rows))} ${state}`, width));
			if (this.focus === "compose" && item.id === this.editingQueueId) {
				lines.push(clip(`${this.theme.fg("borderAccent", "│")}    ${this.theme.fg("muted", `Message ${targetLabel(item.targetKey, rows)}`)}`, width));
				lines.push(clip(`${this.theme.fg("borderAccent", "│")}    ${this.theme.fg("text", this.draft)}${this.theme.fg("accent", "▌")}`, width));
				lines.push(clip(`${this.theme.fg("borderAccent", "│")}    ${this.hotkey("enter", "save")}   ${this.hotkey("esc", "cancel")}`, width));
			} else if (active && this.focus === "redirect") {
				lines.push(clip(`${this.theme.fg("warning", "│    Interrupt the current turn and deliver immediately?")}   ${this.hotkey("enter", "redirect")}   ${this.hotkey("any key", "cancel")}`, width));
			} else if (active) {
				if (item.error) lines.push(clip(this.theme.fg("error", `│    ${item.error}`), width));
				lines.push(clip(`${this.theme.fg("borderAccent", "│")}    ${this.hotkey("enter", "edit")}   ${this.hotkey("r", "redirect")}   ${this.hotkey("←→", "retarget")}   ${this.hotkey("K/J", "reorder")}   ${this.hotkey("x", "cancel")}`, width));
			}
		}
		return lines;
	}

	render(width: number): string[] {
		const usableWidth = Math.max(32, width);
		const rows = this.rows();
		const title = `${this.theme.fg("borderAccent", this.theme.bold("SUBAGENTS"))} ${this.theme.fg("dim", `· ${rows.length} active`)}`;
		const action = this.active ? "" : this.hotkey("ctrl alt a", "manage");
		const lines = [alignRight(title, action, usableWidth), this.theme.fg("borderMuted", "─".repeat(usableWidth))];
		if (usableWidth >= 104 && rows.length > 0) {
			lines.push(clip(this.theme.fg("dim", "  AGENT                 TASK                         DOING NOW                 MODEL / THINKING          ACTIONS"), usableWidth));
		}
		if (rows.length === 0) lines.push(this.theme.fg("dim", "No active subagents"));
		const visibleRows = rows.slice(this.agentOffset, this.agentOffset + this.store.config.maxVisibleSubagents);
		for (const [index, row] of visibleRows.entries()) {
			lines.push(...this.renderAgent(row, this.agentOffset + index, usableWidth));
		}
		lines.push(...this.renderQueue(rows, usableWidth));
		if (this.active) {
			lines.push(this.theme.fg("borderMuted", "─".repeat(usableWidth)));
			const footer = this.focus === "queue"
				? `${this.hotkey("↑↓", "select")}  ${this.hotkey("enter", "edit")}  ${this.hotkey("r", "redirect")}  ${this.hotkey("K/J", "reorder")}  ${this.hotkey("esc", "back")}`
				: rows.length === 0
					? this.hotkey("esc", "back")
					: `${this.hotkey("↑↓", "select")}  ${this.hotkey("enter", "interact")}  ${this.hotkey("x", "stop")}  ${this.hotkey("esc", "input")}`;
			lines.push(clip(footer, usableWidth));
		}
		return lines;
	}

	invalidate(): void {}

	dispose(): void {
		clearInterval(this.timer);
	}
}

class DockController {
	private footerRegistered = false;
	private workspaceRegistered = false;
	private topBarRegistered = false;
	private footerTui: { requestRender(): void } | undefined;
	private workspaceTui: (TUI & { getFocusedComponent(): Component | null }) | undefined;
	private workspaceComponent: SubagentConsoleComponent | undefined;
	private previousFocus: Component | null = null;
	private modelId: string | undefined;
	private topBarTui: { requestRender(): void } | undefined;

	constructor(
		private readonly pi: ExtensionAPI,
		private readonly store: SubagentStore,
	) {}

	refresh(ctx: ExtensionContext): void {
		this.modelId = ctx.model?.id ?? this.modelId;
		if (!this.footerRegistered) {
			ctx.ui.setFooter((tui, theme, footerData) => {
				this.footerTui = tui;
				return {
					render: (width: number) => [footerLine(this.pi, this.modelId, footerData.getGitBranch(), theme, width)],
					invalidate: () => {},
					dispose: () => {
						if (this.footerTui !== tui) return;
						this.footerRegistered = false;
						this.footerTui = undefined;
					},
				};
			});
			this.footerRegistered = true;
		}
		if (!this.topBarRegistered) {
			ctx.ui.setWidget(
				TOP_BAR_KEY,
				(tui, theme) => {
					this.topBarTui = tui;
					return {
						render: (width: number) => topBarLines(this.pi, ctx, theme, width),
						invalidate: () => {},
						dispose: () => {
							if (this.topBarTui !== tui) return;
							this.topBarRegistered = false;
							this.topBarTui = undefined;
						},
					};
				},
				{ placement: "topBar" },
			);
			this.topBarRegistered = true;
		}
		if (!this.workspaceRegistered) {
			ctx.ui.setWidget(
				WIDGET_KEY,
				(tui, theme) => {
					const focusTui = tui as TUI & { getFocusedComponent(): Component | null };
					const component = new SubagentConsoleComponent(
						this.pi,
						this.store,
						theme,
						() => tui.requestRender(),
						(message, type) => ctx.ui.notify(message, type),
						() => this.blur(),
					);
					this.workspaceTui = focusTui;
					this.workspaceComponent = component;
					return component;
				},
				{ placement: "workspace" },
			);
			this.workspaceRegistered = true;
		}
		this.topBarTui?.requestRender();
		this.workspaceTui?.requestRender();
		this.footerTui?.requestRender();
	}

	updateModel(modelId: string): void {
		this.modelId = modelId;
		this.footerTui?.requestRender();
	}

	requestRender(): void {
		this.footerTui?.requestRender();
		this.workspaceTui?.requestRender();
	}

	focus(ctx: ExtensionContext): void {
		this.refresh(ctx);
		const tui = this.workspaceTui;
		const component = this.workspaceComponent;
		if (!tui || !component) return;
		if (tui.getFocusedComponent() === component) return;
		this.previousFocus = tui.getFocusedComponent();
		component.activate();
		tui.setFocus(component);
		tui.requestRender();
	}

	private blur(): void {
		const tui = this.workspaceTui;
		const component = this.workspaceComponent;
		if (!tui || !component) return;
		component.deactivate();
		tui.setFocus(this.previousFocus);
		this.previousFocus = null;
		tui.requestRender();
	}

	clear(ctx: ExtensionContext): void {
		if (this.workspaceRegistered) ctx.ui.setWidget(WIDGET_KEY, undefined);
		if (this.topBarRegistered) ctx.ui.setWidget(TOP_BAR_KEY, undefined);
		if (this.footerRegistered) ctx.ui.setFooter(undefined);
		this.footerRegistered = false;
		this.workspaceRegistered = false;
		this.topBarRegistered = false;
		this.workspaceTui = undefined;
		this.footerTui = undefined;
		this.workspaceComponent = undefined;
		this.previousFocus = null;
		this.topBarTui = undefined;
	}
}

async function openConsole(store: SubagentStore, dock: DockController, ctx: ExtensionContext): Promise<void> {
	if (ctx.mode !== "tui") {
		ctx.ui.notify("Subagent console is available in TUI mode", "warning");
		return;
	}
	store.refresh();
	dock.focus(ctx);
}

export default function subagentConsole(pi: ExtensionAPI): void {
	const store = new SubagentStore(loadConfig());
	const dock = new DockController(pi, store);
	const visibility = installVisibilityPatch();
	let context: ExtensionContext | undefined;
	let poller: ReturnType<typeof setInterval> | undefined;

	const refresh = (): void => {
		if (!context || context.mode !== "tui") return;
		store.refresh();
		dock.refresh(context);
	};

	pi.events.on("subagent:async-started", (raw) => {
		if (!isRecord(raw)) return;
		store.track(raw as AsyncStartedEvent);
		refresh();
	});
	pi.events.on("subagent:async-complete", refresh);
	pi.events.on("subagent:process-terminal", refresh);

	pi.registerCommand("agents", {
		description: "Inspect, message, and stop active subagents",
		handler: async (_args, ctx) => openConsole(store, dock, ctx),
	});
	pi.registerShortcut(OPEN_SHORTCUT, {
		description: "Open subagent console",
		handler: async (ctx) => openConsole(store, dock, ctx),
	});
	pi.registerCommand("tool-calls", {
		description: "Show all tool calls or restore latest-only view: /tool-calls [show|hide]",
		handler: async (args, ctx) => {
			const action = args.trim().toLowerCase();
			if (action !== "" && action !== "show" && action !== "hide") {
				ctx.ui.notify("Usage: /tool-calls [show|hide]", "error");
				return;
			}
			const expanded = action === "show" || (action === "" && !ctx.ui.getToolsExpanded());
			ctx.ui.setToolsExpanded(expanded);
			ctx.ui.notify(expanded ? "Showing all tool calls" : "Showing latest progress only", "info");
		},
	});

	pi.on("session_start", (_event, ctx) => {
		context = ctx;
		store.clear();
		if (ctx.mode === "tui") ctx.ui.setToolsExpanded(false);
		if (poller) clearInterval(poller);
		poller = setInterval(refresh, POLL_INTERVAL_MS);
		refresh();
	});
	pi.on("agent_start", () => {
		clearLatestProgress(visibility);
		visibility.active = true;
	});
	pi.on("agent_end", () => clearLatestProgress(visibility));
	pi.on("model_select", (event) => dock.updateModel(event.model.id));
	pi.on("thinking_level_select", () => dock.requestRender());
	pi.on("input", (event) => {
		if (event.source !== "interactive" || !event.streamingBehavior || (event.images?.length ?? 0) > 0) return { action: "continue" };
		const text = event.text.trim();
		if (!text) return { action: "handled" };
		store.queueMessage(MAIN_TARGET, text);
		const item = store.queue.at(-1);
		if (item) item.mode = event.streamingBehavior === "steer" ? "steer" : "follow_up";
		refresh();
		return { action: "handled" };
	});
	pi.on("agent_end", async (_event, ctx) => {
		const next = nextQueuedMessage(store.queue, MAIN_TARGET);
		if (!next) return;
		try {
			const { agent } = await sendQueuedMessage(pi, store, next);
			ctx.ui.notify(`Sent queued message to ${agent}`, "info");
		} catch (error) {
			ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
		} finally {
			refresh();
		}
	});
	pi.on("session_shutdown", (event, ctx) => {
		if (poller) clearInterval(poller);
		poller = undefined;
		dock.clear(ctx);
		disableVisibilityPatch(visibility, event.reason === "reload");
		context = undefined;
		store.clear();
	});
}

export {
	SubagentConsoleComponent,
	SubagentStore,
	DockController,
	alignRight,
	cleanText,
	formatDuration,
	formatTokens,
	nextQueuedMessage,
	rowsForRun,
	sendQueuedMessage,
};
