import assert from "node:assert/strict";
import test from "node:test";

import {
	GOAL_STATUS_POLL_INTERVAL_MS,
	GOAL_STATUS_WIDGET_KEY,
	goalStatusWidget,
	latestGoalState,
	registerGoalStatus,
	type GoalStatusState,
} from "../home/dot_pi/private_agent/extensions/tlipoca9-goal-status.ts";

function goal(overrides: Partial<GoalStatusState> = {}): GoalStatusState {
	return {
		id: "goal-1",
		text: "Finish the current repository task",
		status: "active",
		updatedAt: 1,
		iteration: 2,
		tokensUsed: 12_000,
		automaticModelTurns: 3,
		...overrides,
	};
}

function goalEntry(state: GoalStatusState | null) {
	return {
		type: "custom",
		customType: "goal-state",
		id: `entry-${state?.updatedAt ?? "clear"}`,
		parentId: null,
		timestamp: "2026-08-31T00:00:00.000Z",
		data: { goal: state },
	};
}

test("uses only the latest canonical goal-state entry", () => {
	const active = goal();
	assert.equal(latestGoalState([
		goalEntry(active),
		{ ...goalEntry(goal({ status: "paused", updatedAt: 2 })), customType: "other" },
		goalEntry(null),
	] as never), undefined);

	assert.deepEqual(latestGoalState([
		goalEntry(active),
		goalEntry(goal({ status: "paused", updatedAt: 2 })),
	] as never), goal({ status: "paused", updatedAt: 2 }));
});

test("renders paused goals persistently with the resume action", () => {
	assert.deepEqual(goalStatusWidget(goal({
		status: "paused",
		safetyPauseCause: "continuation_limit",
		tokenBudget: 50_000,
	})), [
		"⏸ Goal paused: automatic turn limit reached · automatic 3 · 12k/50k tokens · Finish the current repository task",
		"Resume with /goal resume",
	]);
	assert.deepEqual(goalStatusWidget(goal({ status: "paused" })), [
		"⏸ Goal paused · automatic 3 · Finish the current repository task",
		"Resume with /goal resume",
	]);
});

test("renders active and waiting goals compactly and hides completed goals", () => {
	assert.deepEqual(goalStatusWidget(goal()), [
		"🎯 Goal active · automatic 3 · Finish the current repository task",
	]);
	assert.deepEqual(goalStatusWidget(goal({ waiting: { reason: "waiting for CI" } })), [
		"⏳ Goal waiting: waiting for CI · automatic 3 · Finish the current repository task",
	]);
	assert.equal(goalStatusWidget(goal({ status: "complete" })), undefined);
});

test("refreshes on lifecycle events and every ten seconds without redundant redraws", () => {
	const handlers = new Map<string, Array<(event: unknown, ctx: any) => void>>();
	let scheduledInterval: number | undefined;
	let scheduledCallback: (() => void) | undefined;
	let pollCancelled = false;
	registerGoalStatus({
		on(event: string, handler: (event: unknown, ctx: any) => void) {
			const eventHandlers = handlers.get(event) ?? [];
			eventHandlers.push(handler);
			handlers.set(event, eventHandlers);
		},
	} as never, {
		schedule(callback, intervalMs) {
			scheduledCallback = callback;
			scheduledInterval = intervalMs;
			return () => {
				pollCancelled = true;
			};
		},
	});

	let entries = [goalEntry(goal())];
	const widgetCalls: Array<{ key: string; lines: string[] | undefined; placement?: string }> = [];
	const sessionManager = { getBranch: () => entries };
	const ctx = {
		sessionManager,
		ui: {
			setWidget(key: string, lines: string[] | undefined, options?: { placement?: string }) {
				widgetCalls.push({ key, lines, placement: options?.placement });
			},
		},
	};

	handlers.get("session_start")?.[0]?.({}, ctx);
	assert.equal(scheduledInterval, GOAL_STATUS_POLL_INTERVAL_MS);
	assert.deepEqual(widgetCalls.at(-1), {
		key: GOAL_STATUS_WIDGET_KEY,
		lines: ["🎯 Goal active · automatic 3 · Finish the current repository task"],
		placement: "aboveEditor",
	});

	scheduledCallback?.();
	assert.equal(widgetCalls.length, 1);

	entries = [goalEntry(goal()), goalEntry(goal({ status: "paused", updatedAt: 2 }))];
	scheduledCallback?.();
	assert.match(widgetCalls.at(-1)?.lines?.[0] ?? "", /Goal paused/);
	assert.equal(widgetCalls.at(-1)?.lines?.[1], "Resume with /goal resume");

	entries = [goalEntry(goal({ status: "active", updatedAt: 3 }))];
	handlers.get("agent_settled")?.[0]?.({}, ctx);
	assert.match(widgetCalls.at(-1)?.lines?.[0] ?? "", /Goal active/);

	handlers.get("session_shutdown")?.[0]?.({}, ctx);
	assert.equal(pollCancelled, true);
	assert.deepEqual(widgetCalls.at(-1), {
		key: GOAL_STATUS_WIDGET_KEY,
		lines: undefined,
		placement: undefined,
	});
});
