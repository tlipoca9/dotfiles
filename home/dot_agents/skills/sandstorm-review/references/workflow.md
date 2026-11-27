# Sandstorm review workflow

## 1. Establish scope and evidence

Resolve the repository and change under review.

- For an MR, identify the source branch, target branch, latest MR commit, target tip, and merge-base. Use the Gongfeng MCP service when available and verify the same commits locally.
- For a branch, use the requested target. Default to `develop` only when the user has not supplied another target and the repository confirms that branch exists.
- Record `git status --short --branch`, the merge-base, the target commit, the current HEAD, changed files (total and non-test count), and the existing MR notes.
- Fetch references before comparing. Do not treat a stale local branch as the current implementation.
- Read the current branch as a whole. The diff identifies changed behavior, while full-tree searches identify old paths, duplicate models, residual compatibility code, and consumers outside the diff.

Every finding must be attributed to one of these states:

- Baseline behavior already present in `develop`.
- A regression introduced by the current branch.
- A design-convergence defect in the current branch, including an incomplete migration or conflicting implementation that prevents the terminal design.
- A problem that the author claims to have fixed but that remains after the latest commit (or an incomplete fix that introduces asymmetry across sibling paths).
- An unverified behavior blocked by credentials, unavailable services, shared-environment changes, or another explicit condition.

**Re-review / Fix-Induced Asymmetry Check**: When reviewing follow-up fix commits, do not inspect only the line cited in the previous finding. Project every new guard, gate, cache protection, or SQL predicate added by the fix onto all sibling branches sharing the same responsibility (other flag states, degraded/fallback paths, companion read/write handlers, and runbook SQL) to confirm the fix did not create architectural asymmetry.

## 2. Load repository rules and domain context

Read only the documents relevant to the changed area, plus repository-level rules:

- `AGENTS.md`, `README.md`, and any applicable nested instructions.
- `.review/review-style-guide.md`, critic rules, severity rules, and relevant cases.
- `.agents/skills/review-ags`, `e2e-review`, `developing-sandhub`, or other project skills when present.
- Domain documents, glossary, ADRs, API definitions, lifecycle documents, and migration/rollout contracts.
- `agentruntime-context` for AgentRuntime topology, service ownership, environment, logs, and operational vocabulary.

When code and domain documents disagree, identify the concrete contradiction and treat the domain rule as unresolved until the user or an authoritative document settles it.

## 3. Build the shared model (Terminal State + Impact Map)

Before judging individual files—and before fanning out subagents on large PRs—build two compact artifacts:

1. **Terminal-state model**: resource states and legal transitions, authoritative source of truth for each state, durable progress and retry checkpoints, external callbacks/receipts/billing records, final reconciliation/read path, layer ownership of each invariant, and migration/rollback boundaries.
2. **Impact map**: trace every entry point and consumer (API/YunAPI/CLI/UI/MCP/SDK/internal RPC; create/update/pause/resume/fork/pre-create/gateway/console/billing; queues/workers/schedulers/Redis keys/DB tables/external Cube or registry calls; every shared coordination primitive such as locks, leases, fences, epochs, version/generation keys, CAS targets, singleflight gates, and auxiliary state stores with their full reader/writer map; credentials/permissions; metrics/logs/error codes). Explicitly separate **flag-gated paths** from **always-on shared paths**.

## 4. Route review execution: single-pass vs. multi-lens fan-out

Choose the execution strategy from the change scope:

- **Focused change** (< 20 non-test files and < 3 high-risk domains): stay in the main session and apply only the relevant lens files below.
- **Large or cross-cutting change** (≥ 20 non-test files, or spanning ≥ 3 domains among DB/SQL, Redis/concurrency, rollout/hot-paths, and runbooks/UI): fan out **3–4 clean-context, read-only subagents in parallel**, assigning one failure-mode lens per subagent so no single agent's context or attention is diluted by the whole diff.

| Lens | Reference file | Primary failure modes owned |
|---|---|---|
| Fallback & Concurrency | [`lens-fallback-and-concurrency.md`](lens-fallback-and-concurrency.md) | Fence/CAS liveness, exhaustion return contracts, post-outage cache resurrection, flag × health protection symmetry |
| SQL & Capacity | [`lens-sql-and-capacity.md`](lens-sql-and-capacity.md) | Hot-tenant capacity envelope, runtime + runbook SQL `EXPLAIN` & lock analysis, generated-column predicates, `TX-09` snapshots, steady-state reclamation |
| Rollout & Compatibility | [`lens-rollout-and-compat.md`](lens-rollout-and-compat.md) | Always-on default-config amplification, producer/cleaner symmetry, legacy key normalization, mixed-version rollout, multi-doc rollout order & anchor cross-checks |
| State & Contract | [`lens-state-and-contract.md`](lens-state-and-contract.md) | Terminal-state convergence, call-chain & test complexity simplification, bidirectional authority-vs-projection lag matrix, business data-flow chain, API/UI/E2E contracts |

When fanning out, give each subagent:
- the merge-base, current HEAD, changed file list, and the shared Terminal-State + Impact Map from Step 3;
- its assigned lens file path to read and follow strictly;
- explicit instructions to report only evidence-backed defects (with file, line, call chain, or command output) and never stop after the first finding.

**Non-early-stop rule**: Finding 1–2 P1 defects never justifies skipping remaining lenses, truncating cross-layer call-chain tracing, or replacing `EXPLAIN`/behavioral verification with comment inspection.

## 5. Separate engineering and contract lanes

Across all lenses, keep engineering findings distinct from product/domain contract findings:

- **Engineering lane**: package/layer boundaries, domain types, error-code hierarchy, SQL/indexes/query plans/transactions/locks, observability, concurrency safety/liveness, and active resource cleanup.
- **Contract lane**: API request/response semantics, state-machine invariants, resource ownership and tenant isolation, metering/usage/order/callback/reconciliation semantics, retry/idempotency/backfill/rollback behavior, and compatibility with existing clients, stored data, and default configuration.

Do not turn an explicitly accepted product boundary into a defect. Record the boundary when it changes what the system guarantees.

## 6. Verify behavior with evidence

Use the smallest check that can falsify each suspected problem. Synthesize subagent findings in the main session and verify contested or high-severity claims directly.

Prefer:

- a focused regression test comparing `develop` and the current branch
- race tests (`-race`) for shared state and lifecycle paths
- fault injection for Redis, database, queue, Cube, registry, and billing failures—including **exhausted retry/CAS paths** to verify callers do not write poisoned metadata or fail-open
- real MySQL `EXPLAIN` on **every new/modified runtime SQL and every DDL/backfill/rollback/runbook doc SQL** (syntax/execution pass alone is insufficient)
- controlled clock tests for TTL, grace periods, windows, and day rollover
- restart, leader-change, pagination-interruption, duplicate-delivery, and retry tests
- liveness tests under concurrent cross-path traffic at realistic accumulated cardinality (`10+` scan/pagination batches via `10^3–10^4` entries or a narrowed batch size) driving sibling mutations at hot-tenant intervals (`3–15 ms` or per batch boundary)
- default-configuration warm-to-cold transition tests (gray and optional cleanup flags left at production defaults), accumulating steady-state entries before forcing TTL expiry or cache eviction
- three-step post-outage cache recovery tests (warm cache → commit DB mutation → inject cache invalidation failure → recover cache and expire short local TTL → verify stale long-TTL key does not fail-open or is healed by durable compensation)
- legacy non-canonical row tests against real MySQL (seed pre-existing non-canonical rows → exercise canonicalized lookup, gate, upsert, bootstrap, and repair paths)
- bidirectional async-projection lag tests (authority ahead of projection in both forward and reverse directions across cache-hit, cache-miss, admission, reuse, and update paths)
- concurrent cross-branch state-transition tests for split/K-way-merged queries (`TX-09`)
- E2E runs that prove the intended matrix executed

For each check, record the exact command, result, environment, and skip reason. A green command is insufficient when the relevant matrix was skipped, tests ran only with non-default flags, tiny cardinality, or isolated single-path execution, a negative case asserted only a route 404, or the shared environment changed versions during the run. Clean up temporary resources and report any incomplete cleanup.

## 7. Classify and attribute findings

Each finding must state:

- severity `P0`, `P1`, or `P2`
- attribution (`baseline`, `regression`, `design-convergence`, `incomplete-fix`, or `unverified`)
- affected path and triggering condition
- why the behavior violates the terminal-state model or an explicit engineering rule
- evidence (file, line, call chain, test, log, `EXPLAIN` output, or baseline/current comparison)
- smallest repair that restores the invariant (checking sibling branches for symmetry)
- verification that should pass after the repair
- whether it blocks merge

Severity boundaries:
- **P0**: security, catastrophic data or service impact, deterministic livelock/starvation on a critical path, or default-config shared-path outages affecting non-gray tenants.
- **P1**: correctness, compatibility, lifecycle, data integrity, cache poisoning / fail-open fallback returns, unbounded steady-state growth, or performance/liveness problems that materially affect users or operations.
- **P2**: bounded correctness, runbook/doc contradictions, unindexed operational SQL, or maintainability and convergence problems (including avoidable call-chain bloat from stacked patches or brittle, over-complex tests coupled to internal details) that prevent terminal design convergence.

## 8. Deliver the review

Write the complete draft report in the user's language using [`report-template.md`](report-template.md) to a file **outside the target repository** (never commit or leave review reports inside the reviewed git working tree):

1. If the user specified an output path, write there.
2. Otherwise, if the harness provides a conversation artifact/scratch directory, write to `<artifact-dir>/scratch/sandstorm-review-<branch-or-mr>-<short-head>.md` (or `<artifact-dir>/sandstorm-review-<branch-or-mr>-<short-head>.md` when presenting as a user-facing artifact).
3. Otherwise (plain CLI environments without an artifact directory), write to `/tmp/sandstorm-review-<repo>-<short-head>.md`.

In the chat response, do **not** paste or re-summarize the full report. Return only:

- the clickable link / absolute path to the written report file
- the merge recommendation and finding counts (`P0`/`P1`/`P2`)
- a one-line bullet per blocking finding (severity, title, primary location)
- any unverified or environment-blocked checks

When the user explicitly requests submission:

- fetch the latest MR notes again
- deduplicate against existing unresolved comments
- create only new inline comments with actionable evidence
- publish one overview with severity, merge gate, and verification boundary
- read the notes back and report their final state (while keeping the local report file)

Do not create comments or other external mutations merely because the user said "review".
