import { stat as nodeStat } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";

type SessionIdentity = {
	id: string;
	path: string;
	cwd: string;
};

export type DashboardSessionAnchor = Readonly<SessionIdentity>;

export type DashboardCreateIntent = Readonly<{
	cwd: string;
	anchor: DashboardSessionAnchor;
}>;

type SessionResult = { cancelled: boolean };

type ReplacementContext = {
	cwd: string;
	newSession(): Promise<SessionResult>;
};

type CreateDependencies = {
	currentCwd: string;
	listSessions(): Promise<readonly SessionIdentity[]>;
	newSession(): Promise<SessionResult>;
	workspaceExists?(cwd: string): Promise<boolean>;
	onTargetActive?(ctx: ReplacementContext, cwd: string, error?: unknown): void;
	switchSession(
		path: string,
		options: { withSession(ctx: ReplacementContext): Promise<void> },
	): Promise<SessionResult>;
};

export type DashboardCreateOutcome =
	| { status: "created" }
	| { status: "cancelled" }
	| { status: "target-active"; cwd: string }
	| { status: "refused"; reason: "missing-workspace" | "stale-anchor" };

function samePath(left: string, right: string): boolean {
	return resolve(left) === resolve(right);
}

function sameIdentity(left: SessionIdentity, right: SessionIdentity): boolean {
	return left.id === right.id && samePath(left.path, right.path) && samePath(left.cwd, right.cwd);
}

/** Execute a Dashboard create intent through Pi's public replacement-session API. */
export async function createDashboardSession(
	intent: DashboardCreateIntent,
	dependencies: CreateDependencies,
): Promise<DashboardCreateOutcome> {
	if (!isAbsolute(intent.cwd)) return { status: "refused", reason: "missing-workspace" };
	const workspaceExists = dependencies.workspaceExists ?? (async (cwd: string) => {
		try {
			return (await nodeStat(cwd)).isDirectory();
		} catch {
			return false;
		}
	});
	if (!samePath(intent.cwd, intent.anchor.cwd)) {
		return { status: "refused", reason: "stale-anchor" };
	}

	const sessions = await dependencies.listSessions();
	const anchor = sessions.find((session) => sameIdentity(session, intent.anchor));
	if (!anchor) return { status: "refused", reason: "stale-anchor" };
	if (!(await workspaceExists(anchor.cwd))) {
		return { status: "refused", reason: "missing-workspace" };
	}
	if (samePath(intent.cwd, dependencies.currentCwd)) {
		const result = await dependencies.newSession();
		return { status: result.cancelled ? "cancelled" : "created" };
	}

	let replacementCalled = false;
	let creationCancelled = false;
	let activeCwd = anchor.cwd;
	const switched = await dependencies.switchSession(anchor.path, {
		withSession: async (replacement) => {
			replacementCalled = true;
			activeCwd = replacement.cwd;
			if (!samePath(replacement.cwd, anchor.cwd)) {
				creationCancelled = true;
				dependencies.onTargetActive?.(
					replacement,
					replacement.cwd,
					new Error(`Target workspace is unavailable; Pi resumed in ${replacement.cwd}`),
				);
				return;
			}
			try {
				const created = await replacement.newSession();
				creationCancelled = created.cancelled;
				if (created.cancelled) dependencies.onTargetActive?.(replacement, anchor.cwd);
			} catch (error) {
				creationCancelled = true;
				dependencies.onTargetActive?.(replacement, anchor.cwd, error);
			}
		},
	});
	if (switched.cancelled) return { status: "cancelled" };
	if (!replacementCalled || creationCancelled) return { status: "target-active", cwd: activeCwd };
	return { status: "created" };
}
