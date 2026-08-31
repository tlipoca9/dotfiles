import type {
	ExtensionAPI,
	ExtensionContext,
	SessionEntry,
} from "@earendil-works/pi-coding-agent";

export const GOAL_STATUS_POLL_INTERVAL_MS = 10_000;
export const GOAL_STATUS_WIDGET_KEY = "tlipoca9-goal-status";

const GOAL_STATE_ENTRY_TYPE = "goal-state";
const OBJECTIVE_MAX_CHARS = 100;

type GoalStatus =
	| "active"
	| "queued"
	| "paused"
	| "blocked"
	| "usage_limited"
	| "budget_limited"
	| "complete";

interface GoalWait {
	reason: string;
}

export interface GoalStatusState {
	id: string;
	text: string;
	status: GoalStatus;
	updatedAt: number;
	iteration: number;
	tokensUsed: number;
	tokenBudget?: number;
	automaticModelTurns: number;
	safetyPauseCause?: "continuation_limit" | "no_progress";
	waiting?: GoalWait;
}

interface GoalStateEntryData {
	goal: GoalStatusState | null;
}

type GoalStatusContext = Pick<ExtensionContext, "sessionManager" | "ui">;

interface GoalStatusRuntimeOptions {
	pollIntervalMs?: number;
	schedule?: (callback: () => void, intervalMs: number) => () => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isGoalStatus(value: unknown): value is GoalStatus {
	return [
		"active",
		"queued",
		"paused",
		"blocked",
		"usage_limited",
		"budget_limited",
		"complete",
	].includes(String(value));
}

function isGoalState(value: unknown): value is GoalStatusState {
	return (
		isRecord(value) &&
		typeof value.id === "string" &&
		typeof value.text === "string" &&
		isGoalStatus(value.status) &&
		typeof value.updatedAt === "number" &&
		typeof value.iteration === "number" &&
		typeof value.tokensUsed === "number" &&
		typeof value.automaticModelTurns === "number"
	);
}

function parseGoalStateData(value: unknown): GoalStatusState | undefined {
	if (!isRecord(value) || !("goal" in value)) return undefined;
	const data = value as unknown as GoalStateEntryData;
	return isGoalState(data.goal) ? data.goal : undefined;
}

export function latestGoalState(entries: readonly SessionEntry[]): GoalStatusState | undefined {
	const entry = entries.findLast(
		(candidate) =>
			candidate.type === "custom" && candidate.customType === GOAL_STATE_ENTRY_TYPE,
	);
	return entry?.type === "custom" ? parseGoalStateData(entry.data) : undefined;
}

function compactText(value: string, maxChars = OBJECTIVE_MAX_CHARS): string {
	const compacted = value.replace(/\s+/gu, " ").trim();
	return compacted.length <= maxChars ? compacted : `${compacted.slice(0, maxChars - 1)}…`;
}

function formatTokenCount(tokens: number): string {
	if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1).replace(/\.0$/u, "")}m`;
	if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}k`;
	return String(Math.max(0, Math.round(tokens)));
}

function goalDetail(goal: GoalStatusState): string {
	const details: string[] = [];
	if (goal.automaticModelTurns > 0) details.push(`automatic ${goal.automaticModelTurns}`);
	if (goal.tokenBudget !== undefined) {
		details.push(
			`${formatTokenCount(goal.tokensUsed)}/${formatTokenCount(goal.tokenBudget)} tokens`,
		);
	}
	return details.length > 0 ? ` · ${details.join(" · ")}` : "";
}

function pauseCause(goal: GoalStatusState): string | undefined {
	if (goal.safetyPauseCause === "continuation_limit") return "automatic turn limit reached";
	if (goal.safetyPauseCause === "no_progress") return "no progress detected";
	return undefined;
}

export function goalStatusWidget(goal: GoalStatusState | undefined): string[] | undefined {
	if (!goal || goal.status === "complete") return undefined;
	const objective = compactText(goal.text);
	const detail = goalDetail(goal);

	if (goal.status === "queued") return [`◌ Goal queued${detail} · ${objective}`];
	if (goal.waiting) {
		return [`⏳ Goal waiting: ${compactText(goal.waiting.reason, 60)}${detail} · ${objective}`];
	}
	if (goal.status === "active") return [`🎯 Goal active${detail} · ${objective}`];
	if (goal.status === "paused") {
		const cause = pauseCause(goal);
		return [
			`⏸ Goal paused${cause ? `: ${cause}` : ""}${detail} · ${objective}`,
			"Resume with /goal resume",
		];
	}
	if (goal.status === "blocked") {
		return [
			`⛔ Goal blocked${detail} · ${objective}`,
			"Resolve the blocker, then run /goal resume",
		];
	}
	if (goal.status === "usage_limited") {
		return [
			`⌛ Goal usage limited${detail} · ${objective}`,
			"When usage is available, run /goal resume",
		];
	}
	return [
		`⚠ Goal budget limited${detail} · ${objective}`,
		"Adjust the budget, then run /goal resume",
	];
}

function defaultSchedule(callback: () => void, intervalMs: number): () => void {
	const timer = setInterval(callback, intervalMs);
	timer.unref?.();
	return () => clearInterval(timer);
}

export function registerGoalStatus(
	pi: ExtensionAPI,
	options: GoalStatusRuntimeOptions = {},
): void {
	const pollIntervalMs = options.pollIntervalMs ?? GOAL_STATUS_POLL_INTERVAL_MS;
	const schedule = options.schedule ?? defaultSchedule;
	let activeContext: GoalStatusContext | undefined;
	let cancelPoll: (() => void) | undefined;
	let lastRenderKey: string | undefined;

	const refresh = (ctx: GoalStatusContext, force = false) => {
		if (activeContext?.sessionManager !== ctx.sessionManager) return;
		const lines = goalStatusWidget(latestGoalState(ctx.sessionManager.getBranch()));
		const renderKey = JSON.stringify(lines);
		if (!force && renderKey === lastRenderKey) return;
		lastRenderKey = renderKey;
		ctx.ui.setWidget(GOAL_STATUS_WIDGET_KEY, lines, { placement: "aboveEditor" });
	};

	const stop = (ctx?: GoalStatusContext) => {
		if (ctx && activeContext?.sessionManager !== ctx.sessionManager) return;
		cancelPoll?.();
		cancelPoll = undefined;
		activeContext?.ui.setWidget(GOAL_STATUS_WIDGET_KEY, undefined);
		activeContext = undefined;
		lastRenderKey = undefined;
	};

	pi.on("session_start", (_event, ctx) => {
		stop();
		activeContext = ctx;
		refresh(ctx, true);
		cancelPoll = schedule(() => refresh(ctx), pollIntervalMs);
	});

	for (const event of [
		"tool_execution_end",
		"turn_end",
		"agent_end",
		"agent_settled",
		"session_compact",
	] as const) {
		pi.on(event, (_event, ctx) => refresh(ctx));
	}

	pi.on("session_shutdown", (_event, ctx) => stop(ctx));
}

export default function tlipoca9GoalStatus(pi: ExtensionAPI): void {
	registerGoalStatus(pi);
}
