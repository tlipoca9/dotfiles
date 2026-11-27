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
- every shared coordination primitive (locks, leases, fences, epochs, version/generation keys, CAS targets, singleflight gates) and auxiliary state store (ledgers, pending sets, reservation hashes, outboxes, queues), with its full reader and writer map
- credential and permission ownership for third-party image preparation or external calls
- emitted events, metrics, logs, error codes, and request identifiers

For each path, record the old behavior, the current behavior, and the expected terminal behavior, and explicitly separate flag-gated paths from always-on shared paths that execute even when new gray or feature flags are disabled. A change is incomplete when one path still observes the old state model, bypasses the new invariant, or mutates a shared primitive without accounting for concurrent callers.

## 5. Review the business chain

Follow the feature in this order.

1. Business terminal state. Confirm what “ready”, “success”, “deleted”, “failed”, “paused”, or equivalent means to callers and billing.
2. Durable progress. Check cursors, checkpoints, leases, orders, database rows, migrations, and restart behavior.
3. Asynchronous external receipt. Check retries, timeouts, cancellation, duplicate delivery, provider errors, and whether success is recorded before the external result is durable.
4. Reconciliation and reclamation. Check that later scans or read APIs can recover from every partial failure, that the final account, resource, usage, and billing views agree, and that settled auxiliary records (tickets, tombstones, pending rows, staging keys) are actively reclaimed in steady state rather than left to accumulate until a miss or TTL cliff.

Check lifecycle edges, clock and TTL-expiry boundaries after warm operation, stale messages, replays, partial writes, leader changes, liveness under concurrent routine traffic, and old messages read by the new code.

## 6. Run the engineering and contract lanes separately

Engineering lane checks:

- package and layer boundaries
- names and domain types
- public error-code hierarchy
- SQL shape, indexes, query plans, transactions, lock ordering, and connection usage
- observability and actionable failure context
- concurrency safety, liveness (no livelock or starvation), and active resource/state cleanup

Contract lane checks:

- API request and response semantics
- state-machine and lifecycle invariants
- resource ownership and tenant isolation
- metering, usage, order, callback, and reconciliation semantics
- retry, idempotency, backfill, compensation, rollback, and migration behavior
- compatibility with existing clients, stored data, and default configuration

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
| Time boundary | post-deploy warm cache/lease, first TTL expiry or eviction after sustained traffic, window rollover, threshold crossing |

Check whether old and new processes can share the same database and Redis keys. Check whether a deployment can leave an old writer, an old reader, or an old worker running long enough to violate the terminal-state model.

Check these rollout failure modes explicitly:

- **Always-on shared foundation blast radius**: When a change is behind a gray or feature flag, audit every shared foundation path that still executes with the flag disabled under production defaults. Any always-on path carries full-tenant blast radius regardless of rollout scope.
- **Default-config producer/cleaner symmetry**: Audit the exact shipped default values of every new or changed flag. Whenever a writer, ledger, fence, or guard is enabled by default, confirm its companion cleanup, handoff, drain, or escape path is also active by default rather than gated behind an opt-in switch.
- **Delayed-detonation boundaries**: Identify paths kept dormant immediately after deployment by warm keys, caches, leases, or existing rows written by the previous release. Trace what executes on the first cold transition (TTL expiry, cache eviction, failover, window rollover, or cap crossing) after sustained steady-state traffic has accumulated under the new code.

## 8. Quantify capacity, state growth, and concurrency liveness

For any database, Redis, cache, queue, ledger, metering, or coordination change, quantify rather than describe. Unless live metrics, `agentruntime-context`, or service configs show a stricter scale, size every hot path against at least these single-region, hot-tenant baseline orders of magnitude (calibrated from 7-day multi-region production traffic and live table sizes; never size from average traffic):

| Dimension | Baseline floor (hot tenant / single region) | Primary review risk |
|---|---|---|
| Live instances (`RUNNING` vs. `PAUSED`) | `~10^5` `RUNNING` (one tenant / region); **`10^6–5×10^6` `PAUSED`** (`10^6+` in one tenant, 30–40× `RUNNING`) | Queries/scans over `PAUSED` or non-deleted instances, pause-release queues, checkpoints, and bucket rebuilds |
| Core MySQL table scale (single region) | Live `sandbox_instances`: **`1.5×10^7+` rows / `450–600+ GB`**; daily event shards: `~10^7` rows/day (`~6 GB/day`); companion tables (`volumes`, `tokens`, `tools`, `tasks`, `pre_cache_images`, `billing_stat`): **`10^6–5×10^6` rows** (`3–20 GB`) | Full/wide index scans, `COUNT`/`SUM` timeouts (`>5 s`), online DDL locks, and unsharded growth |
| Read & invoke hot-path QPS | `1.5–2×10^3` ops/s per hot tenant (`3–4×10^3+` region total) | Uncached DB reads, cache/lock contention, and fan-out scans on list/describe/invoke paths |
| Lifecycle & update write QPS (peak 1m) | `200–320+` ops/s for start/stop/update (`3–5 ms` interval; up to `3.5×10^5`/h single-tenant creates, `4×10^6`/day region); `~170` ops/s for pause incl. auto-pause (`~6 ms` interval); `~70` ops/s for resume (`~14 ms` interval) | Optimistic-fence livelock (`T_invalidate` in single-digit ms) and serial-worker backlog |
| Unreclaimed TTL accumulation | `10^5–10^6` entries / `1h` window; `10^6–10^7+` entries / `24h` window (`write_rate × TTL`) | Unbounded companion hashes, queues, pending sets, or multi-day watermark maps |
| Redis cluster RTT & multi-round scan | `1.5–4 ms` per op (P50–P95, `~80 ms` tail); `40–400+` `HSCAN`/`SCAN` rounds (`100 ms–1 s+`) at `10^4–10^5` entries (multi-second at `10^6`) | Synchronous `O(N)` scans exceeding `T_invalidate` or request latency budgets |
| DB query & async-batch load | Point ops `2–10 ms` (P50–P95); broad `SELECT` P99 `50–300 ms` (multi-second/`>5 s` timeout tail); async flush `350–550+` batches/s | Critical-section / lock-hold / fence-window duration and connection-pool exhaustion |
| Replicas & concurrency | `6–26` pods per major region (`3–6` smaller regions); `10^2–10^3` concurrent hot-tenant requests | Cross-pod lock contention, miss stampedes, and retry/connection amplification |

### Storage and hot-path capacity

- rows, keys, or collection entries scanned and written per cycle, day, and region
- read and update QPS, batch size, pagination rounds, lock duration, and retry amplification
- index predicates and actual query plans
- account and region skew, shard size, and the largest customer (anchored to the baseline floor above)
- hot API paths and lock-holding rebuild paths that must avoid routine SQL, full-table scans, or `O(N)` Redis reads (`HSCAN`/`SCAN`/`HGETALL`/`SMEMBERS`)
- event, stat, usage, order, and billing record volume

### Steady-state accumulation and reclamation

For every new or modified Redis hash, set, sorted set, stream, database table, queue, or in-memory buffer:

- Compute steady-state cardinality against the baseline floor as `write_rate × retention_or_TTL_window` (for example, `10^5–10^6` entries over an hourly TTL under `10^2` ops/s creates/updates, or `10^6–10^7+` per day for multi-day watermark maps and logs).
- Verify an active, bounded steady-state reclamation path (such as handoff or deletion on async commit completion, or bounded background drain) that keeps cardinality proportional to true in-flight work rather than cumulative throughput over the TTL window.
- Flag deferred synchronous cleanup when a hot request path, cache-miss rebuild, or lease-holding worker must scan or process backlog accumulated since the last expiry or reconciliation.

### Concurrency liveness and fencing

Safety fences (epochs, generation counters, version keys, CAS targets, `WATCH`, rebuild locks, singleflight gates) prevent stale writes but can cause deterministic livelock when paired with multi-step work. For every touched fence or optimistic retry loop:

- **Complete writer inventory**: Audit every writer that creates, rotates, or invalidates the fence across the codebase, including Go callers, Lua scripts, legacy/compatibility paths, routine lifecycle transitions (start, pause, resume, stop, update), error/repair handlers, and background workers.
- **Conditional invalidation**: Confirm each writer rotates or invalidates the fence only when it actually mutates protected state; flag unconditional writes on no-op paths (missing target key, zero affected entries, or already-settled state).
- **Scope separation**: Confirm routine high-frequency operations are isolated from slow rebuild, backfill, or repair fences (or preserve forward progress under concurrent writes) rather than sharing an unguarded tenant-wide, pool-wide, or global epoch.
- **Liveness inequality (`T_work` vs. `T_invalidate`)**: Compute the full guarded critical window `T_work` (scan/pagination RTTs + DB queries + external RPCs + final writes from fence sample to commit) at the baseline hot-tenant scale (`10^4–10^5` entries / `100 ms–1 s+` for multi-round scans or heavy queries), and compare it against the concurrent fence-mutation arrival interval `T_invalidate` (`3–15 ms` under `70–320+` ops/s peak lifecycle/update traffic) across all writers in the inventory. Whenever `T_work` can approach or exceed `T_invalidate`, bounded optimistic retries amplify latency and exhaust into failure rather than converging; flag this as a blocking liveness defect.

If a design adds a table, Redis structure, field, queue, fence, or middleware, explain why existing structures cannot satisfy the invariant and how the new structure remains bounded and maintainable.

## 9. Verify behavior with evidence

Use the smallest check that can falsify the suspected problem.

Prefer:

- a focused regression test that compares `develop` and the current branch
- race tests for shared state and lifecycle paths
- fault injection for Redis, database, queue, Cube, registry, and billing failures
- controlled clock tests for TTL, grace periods, windows, and day rollover
- restart, leader-change, pagination-interruption, duplicate-delivery, and retry tests
- liveness tests under concurrent cross-path traffic at realistic accumulated cardinality (forcing `10+` scan or pagination batches via `10^3–10^4` entries or a narrowed test batch size, not a handful of entries), driving routine sibling mutations at a hot-tenant arrival interval (`3–15 ms` or per batch boundary) while a rebuild, backfill, or reconciliation executes to prove bounded completion rather than retry exhaustion
- default-configuration warm-to-cold transition tests (gray and optional cleanup flags left at production defaults), accumulating steady-state entries before forcing TTL expiry or cache eviction
- E2E runs that prove the intended matrix executed

For each check, record the exact command, result, environment, and skip reason. A green command is insufficient when the relevant matrix was skipped, tests ran only with non-default flags, tiny cardinality, or isolated single-path execution (proving safety without liveness), a negative case asserted only a route 404, or the shared environment changed versions during the run. Clean up temporary resources and report any incomplete cleanup.

## 10. Classify and attribute findings

Each finding must state:

- severity P0, P1, or P2
- the affected path and triggering condition
- why the behavior violates the terminal-state model or an explicit engineering rule
- evidence, including the file, line, test, log, query plan, or baseline/current comparison
- the smallest repair that restores the invariant
- the verification that should pass after the repair
- whether it blocks merge

P0 covers security, catastrophic data or service impact, deterministic livelock or starvation on a critical path, or default-config shared-path outages affecting non-gray tenants. P1 covers correctness, compatibility, lifecycle, data integrity, unbounded steady-state growth, or performance and liveness problems that can materially affect users or operations. P2 covers bounded correctness or maintainability problems that still prevent terminal design convergence when they leave conflicting or incomplete behavior.

## 11. Deliver the review

Default output is a draft in the user's language. Use the report template. State the baseline, current HEAD, terminal state, findings, verification, skipped checks, and merge recommendation.

When the user explicitly requests submission:

- fetch the latest MR notes again
- deduplicate against existing unresolved comments
- create only new inline comments with actionable evidence
- publish one overview with severity, merge gate, and verification boundary
- read the notes back and report their final state

Do not create comments or other external mutations merely because the user said “review”.
