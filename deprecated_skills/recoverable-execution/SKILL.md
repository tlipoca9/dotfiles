---
name: recoverable-execution
description: >-
  Use for long-running, unattended, interruption-prone, multi-Agent, or externally
  mutating engineering work such as migrations, deployments, broad refactors, and
  multi-stage investigations. Do not use for routine bounded work completed in one
  local pass.
---

# Recoverable Execution

Advance the mainline autonomously inside an explicit boundary while preserving
state, ownership, and resumability.

## 1. Lock the execution boundary

Before substantial work, record:

- the observable objective;
- approved scope and non-goals;
- protected user, repository, data, and external state;
- authority for writes, deployment, migration, deletion, or credential use;
- completion evidence;
- semantic, authorization, and irreversible-risk stop conditions.

Do not repeatedly request approval for ordinary reversible actions inside this
boundary.

## 2. Maintain one canonical checkpoint

Before the first external write, deployment, migration, or other difficult-to-
reconstruct action, create or update one durable checkpoint in the project's
existing task, issue, plan, or repository-approved location.

Record:

- objective, boundary, and settled decisions;
- repository, branch, HEAD, and worktree state;
- environment and external state already changed;
- completed work and its evidence;
- delegated or running work and its owner;
- blockers, open risks, and intentionally deferred side work;
- the exact next executable action.

Update it after each committed or deployed milestone, whenever blocker routing
changes, and before pausing or handing off. Do not scatter competing status files.

## 3. Keep work on the mainline

For each substantial action, verify that it is:

- direct progress toward the approved result;
- a true dependency; or
- isolated side work that can be delegated, deferred, or recorded.

Do not let documentation cleanup, lint, unrelated defects, optional pushes, or
independent research block a safe mainline.

Preserve dirty worktrees, existing files, credentials, and external state. Never
manufacture a clean start by destroying user work.

## 4. Use multiple Agents deliberately

Delegate only for independent evidence, orthogonal ownership, or isolated delivery.
For every delegated task define:

- input and objective;
- exclusive scope and allowed writes;
- dependencies and merge/recheck condition;
- expected output evidence;
- completion condition and owner.

Avoid parallel writes to shared mutable state unless ordering and reconciliation
are explicit. Resolve disagreement through current artifacts, tests, logs, traces,
or reproducible experiments; voting is not evidence.

## 5. Resume safely

On resume or handoff:

1. read the canonical checkpoint;
2. verify repository, worktree, environment, and external state;
3. reconcile drift since the checkpoint;
4. continue with the next unblocked mainline action.

A blocker stops the mainline only when it changes the contract or authority,
invalidates a true dependency or required evidence, or creates irreversible risk.
Otherwise isolate or defer it and record the re-entry condition.

## 6. Close with evidence

Before claiming completion, reconcile code, tests, configuration, documentation,
deployment state, and observable behavior. Distinguish implemented, locally
verified, remotely verified, deployed, pushed, and proposed states. State remaining
unknowns and intentionally unmodified scope without presenting them as completed.
