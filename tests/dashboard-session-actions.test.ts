import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createDashboardSession } from "../home/dot_pi/private_agent/extensions/lib/dashboard-session-actions.ts";

type ListedSession = { id: string; path: string; cwd: string };
const session = (id: string, path: string, cwd: string): ListedSession => ({ id, path, cwd });

test("create uses the current context locally and a revalidated anchor across workspaces", async () => {
	const calls: string[] = [];
	const anchor = session("anchor", "/sessions/anchor.jsonl", "/work/target");
	const currentAnchor = session("current", "/sessions/current.jsonl", "/work/current");
	const local = await createDashboardSession(
		{ cwd: "/work/current", anchor: currentAnchor },
		{
			currentCwd: "/work/current",
			workspaceExists: async () => true,
			listSessions: async () => { calls.push("list:current"); return [currentAnchor]; },
			newSession: async () => { calls.push("new:current"); return { cancelled: false }; },
			switchSession: async () => { throw new Error("unexpected switch"); },
		},
	);
	assert.deepEqual(local, { status: "created" });

	const cross = await createDashboardSession(
		{ cwd: anchor.cwd, anchor },
		{
			currentCwd: "/work/current",
			workspaceExists: async () => true,
			listSessions: async () => { calls.push("list"); return [anchor]; },
			newSession: async () => { throw new Error("unexpected current newSession"); },
			switchSession: async (path, options) => {
				calls.push(`switch:${path}`);
				await options.withSession({
					cwd: anchor.cwd,
					newSession: async () => { calls.push("new:replacement"); return { cancelled: false }; },
				});
				return { cancelled: false };
			},
		},
	);
	assert.deepEqual(cross, { status: "created" });
	assert.deepEqual(calls, ["list:current", "new:current", "list", "switch:/sessions/anchor.jsonl", "new:replacement"]);
});

test("create reports the partial transition when target switch succeeds but creation is cancelled", async () => {
	const anchor = session("anchor", "/sessions/anchor.jsonl", "/work/target");
	const notices: Array<{ cwd: string; error?: unknown }> = [];
	const result = await createDashboardSession(
		{ cwd: anchor.cwd, anchor },
		{
			currentCwd: "/work/current",
			workspaceExists: async () => true,
			listSessions: async () => [anchor],
			newSession: async () => ({ cancelled: false }),
			switchSession: async (_path, options) => {
				await options.withSession({ cwd: anchor.cwd, newSession: async () => ({ cancelled: true }) });
				return { cancelled: false };
			},
			onTargetActive: (_ctx, cwd, error) => notices.push({ cwd, error }),
		},
	);
	assert.deepEqual(result, { status: "target-active", cwd: "/work/target" });
	assert.deepEqual(notices, [{ cwd: "/work/target", error: undefined }]);
});

test("create fails closed before replacement when workspace or anchor changed", async () => {
	const anchor = session("anchor", "/sessions/anchor.jsonl", "/work/target");
	for (const [workspaceExists, sessions, expected] of [
		[false, [anchor], { status: "refused", reason: "missing-workspace" }],
		[true, [], { status: "refused", reason: "stale-anchor" }],
	] as const) {
		let switched = false;
		const result = await createDashboardSession(
			{ cwd: anchor.cwd, anchor },
			{
				currentCwd: "/work/current",
				workspaceExists: async () => workspaceExists,
				listSessions: async () => sessions,
				newSession: async () => ({ cancelled: false }),
				switchSession: async () => { switched = true; return { cancelled: false }; },
			},
		);
		assert.deepEqual(result, expected);
		assert.equal(switched, false);
	}
});

test("create revalidates the selected anchor even in the current workspace", async () => {
	let created = false;
	const result = await createDashboardSession(
		{ cwd: "/work/current", anchor: session("stale", "/sessions/stale.jsonl", "/work/current") },
		{
			currentCwd: "/work/current",
			workspaceExists: async () => true,
			listSessions: async () => [],
			newSession: async () => { created = true; return { cancelled: false }; },
			switchSession: async () => { throw new Error("unexpected switch"); },
		},
	);
	assert.deepEqual(result, { status: "refused", reason: "stale-anchor" });
	assert.equal(created, false);
});

test("create refuses Pi's missing-workspace fallback before replacement newSession", async () => {
	const anchor = session("anchor", "/sessions/anchor.jsonl", "/work/target");
	const notices: Array<{ cwd: string; error?: unknown }> = [];
	let created = false;
	const result = await createDashboardSession(
		{ cwd: anchor.cwd, anchor },
		{
			currentCwd: "/work/current",
			workspaceExists: async () => true,
			listSessions: async () => [anchor],
			newSession: async () => ({ cancelled: false }),
			switchSession: async (_path, options) => {
				await options.withSession({
					cwd: "/work/current",
					newSession: async () => { created = true; return { cancelled: false }; },
				});
				return { cancelled: false };
			},
			onTargetActive: (_ctx, cwd, error) => notices.push({ cwd, error }),
		},
	);
	assert.deepEqual(result, { status: "target-active", cwd: "/work/current" });
	assert.equal(created, false);
	assert.equal(notices[0]?.cwd, "/work/current");
	assert.ok(notices[0]?.error instanceof Error);
});

test("create accepts a workspace path that is a symlink to a directory", async (t) => {
	const root = await mkdtemp(join(tmpdir(), "pi-dashboard-create-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	const realWorkspace = join(root, "real");
	const linkedWorkspace = join(root, "linked");
	await mkdir(realWorkspace);
	await symlink(realWorkspace, linkedWorkspace);
	const anchor = session("anchor", "/sessions/anchor.jsonl", linkedWorkspace);
	let created = false;
	const result = await createDashboardSession(
		{ cwd: linkedWorkspace, anchor },
		{
			currentCwd: linkedWorkspace,
			listSessions: async () => [anchor],
			newSession: async () => { created = true; return { cancelled: false }; },
			switchSession: async () => { throw new Error("unexpected switch"); },
		},
	);
	assert.deepEqual(result, { status: "created" });
	assert.equal(created, true);
});
