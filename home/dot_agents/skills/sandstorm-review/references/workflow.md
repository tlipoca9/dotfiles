# Sandstorm review workflow

## 1. Establish scope and evidence

Resolve the repository and change under review.

- For an MR, identify the source branch, target branch, latest MR commit, target tip, and merge-base. Use the Gongfeng MCP service when available and verify the same commits locally.
- For a branch, use the requested target. Default to `develop` only when the user has not supplied another target and the repository confirms that branch exists.
- Record `git status --short --branch`, the merge-base, the target commit, the current HEAD, changed files, and the existing MR notes.
- Fetch references before comparing. Do not treat a stale local branch as the current implementation.
- Read the current branch as a whole. The diff identifies changed behavior, while full-tree searches identify old paths, duplicate models, residual compatibility code, and consumers outside the diff.

Every finding must be attributed to one of these states.

- Baseline behavior already present in `develop`.
- A regression introduced by the current branch.
- A design-convergence defect in the current branch, including an incomplete migration or conflicting implementation that prevents the terminal design.
- A problem that the author claims to have fixed but that remains after the latest commit.
- An unverified behavior blocked by credentials, unavailable services, shared-environment changes, or another explicit condition.

## 2. Load repository rules and domain context

Read only the documents relevant to the changed area, plus the repository-level rules.

- `AGENTS.md`, `README.md`, and any applicable nested instructions.
- `.review/review-style-guide.md`, critic rules, severity rules, and relevant cases.
- `.agents/skills/review-ags`, `e2e-review`, `developing-sandhub`, or other project skills when present.
- Domain documents, glossary, ADRs, API definitions, lifecycle documents, and migration contracts.
- `agentruntime-context` for AgentRuntime topology, service ownership, environment, logs, and operational vocabulary.

When code and domain documents disagree, identify the concrete contradiction and treat the domain rule as unresolved until the user or an authoritative document settles it.

## 3. Define the terminal state before judging the implementation

Write a short terminal-state model from the request, product requirements, domain documents, and existing public contracts.

Include:

- the resource states and legal transitions
- the source of truth for each state
- durable progress and retry checkpoints
- external callbacks, receipts, or billing records
- the final reconciliation or read path
- ownership of each responsibility
- migration and rollback boundaries

Then compare the current branch to `develop` and to this model. Look for duplicate old and new paths, state transitions that can be reached through only one entry point, fields that no longer carry a product meaning, compatibility layers for data that does not exist, migrations that are repeated or out of order, and logic placed in a layer that cannot enforce the required invariant.

## 4. Build the impact map

Trace the feature through all entry points and consumers.

- API, YunAPI, CLI, UI, MCP, SDK, and internal RPC contracts
- every create, update, pause, resume, fork, pre-create, gateway, console, and billing path that can observe the changed state
- queue producers and consumers, workers, schedulers, Redis keys, database tables, and external Cube or registry calls
- credential and permission ownership for third-party image preparation or external calls
- emitted events, metrics, logs, error codes, and request identifiers

For each path, record the old behavior, the current behavior, and the expected terminal behavior. A change is incomplete when one path still observes the old state model or bypasses the new invariant.

## 5. Review the business chain

Follow the feature in this order.

1. Business terminal state. Confirm what “ready”, “success”, “deleted”, “failed”, “paused”, or equivalent means to callers and billing.
2. Durable progress. Check cursors, checkpoints, leases, orders, database rows, migrations, and restart behavior.
3. Asynchronous external receipt. Check retries, timeouts, cancellation, duplicate delivery, provider errors, and whether success is recorded before the external result is durable.
4. Reconciliation. Check that later scans or read APIs can recover from every partial failure and that the final account, resource, usage, and billing views agree.

Check lifecycle edges, clock boundaries, stale messages, replays, partial writes, leader changes, and old messages read by the new code.

## 6. Run the engineering and contract lanes separately

Engineering lane checks:

- package and layer boundaries
- names and domain types
- public error-code hierarchy
- SQL shape, indexes, query plans, transactions, lock ordering, and connection usage
- observability and actionable failure context
- race safety and cleanup

Contract lane checks:

- API request and response semantics
- state-machine and lifecycle invariants
- resource ownership and tenant isolation
- metering, usage, order, callback, and reconciliation semantics
- retry, idempotency, backfill, compensation, rollback, and migration behavior
- compatibility with existing clients and stored data

Do not turn an explicitly accepted product boundary into a defect. Do record the boundary when it changes what the system guarantees.

## 7. Check compatibility and rollout

Use a matrix that covers at least:

| Dimension | Cases |
|---|---|
| Data | no data, new data, existing data, partially migrated data |
| Process | old process, new process, rolling mixed version |
| Configuration | default mode, named mode, feature disabled, feature enabled |
| Backend | single backend, dual backend, provider unavailable |
| Operation | create, read, update, pause/resume, delete, retry, replay |

Check whether old and new processes can share the same database and Redis keys. Check whether a deployment can leave an old writer, an old reader, or an old worker running long enough to violate the terminal-state model.

## 8. Quantify capacity and hot paths

For database and metering changes, quantify rather than describe.

- rows scanned and written per cycle, day, and region
- read and update QPS, batch size, pagination, lock duration, and retry amplification
- index predicates and actual query plans
- account and region skew, shard size, and the largest customer
- hot API paths that must avoid routine SQL or full-table scans
- event, stat, usage, order, and billing record volume

If a design adds a table, field, queue, or middleware, explain why existing structures cannot satisfy the invariant and how the new structure remains maintainable.

## 9. Verify behavior with evidence

Use the smallest check that can falsify the suspected problem.

Prefer:

- a focused regression test that compares `develop` and the current branch
- race tests for shared state and lifecycle paths
- fault injection for Redis, database, queue, Cube, registry, and billing failures
- controlled clock tests for TTL, grace periods, windows, and day rollover
- restart, leader-change, pagination-interruption, duplicate-delivery, and retry tests
- E2E runs that prove the intended matrix executed

For each check, record the exact command, result, environment, and skip reason. A green command is insufficient when the relevant matrix was skipped, a negative case asserted only a route 404, or the shared environment changed versions during the run. Clean up temporary resources and report any incomplete cleanup.

## 10. Classify and attribute findings

Each finding must state:

- severity P0, P1, or P2
- the affected path and triggering condition
- why the behavior violates the terminal-state model or an explicit engineering rule
- evidence, including the file, line, test, log, query plan, or baseline/current comparison
- the smallest repair that restores the invariant
- the verification that should pass after the repair
- whether it blocks merge

P0 covers security or catastrophic data and service impact. P1 covers correctness, compatibility, lifecycle, data integrity, or performance problems that can materially affect users or operations. P2 covers bounded correctness or maintainability problems that still prevent terminal design convergence when they leave conflicting or incomplete behavior.

## 11. Deliver the review

Default output is a draft in the user's language. Use the report template. State the baseline, current HEAD, terminal state, findings, verification, skipped checks, and merge recommendation.

When the user explicitly requests submission:

- fetch the latest MR notes again
- deduplicate against existing unresolved comments
- create only new inline comments with actionable evidence
- publish one overview with severity, merge gate, and verification boundary
- read the notes back and report their final state

Do not create comments or other external mutations merely because the user said “review”.
