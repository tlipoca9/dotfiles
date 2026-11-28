# Sandstorm review workflow

## 1. Establish scope and commit trajectory

Resolve the repository and comparison baseline:

- For an MR, identify source branch, target branch, latest MR commit, target tip, and merge-base via Gongfeng MCP when available, then verify locally.
- For a branch, default to `develop` only when no target was given and `develop` exists.
- Fetch references before comparing. Record `git status --short --branch`, merge-base, target tip, HEAD, total vs. non-test changed files, and existing MR notes.
- Inspect the **commit trajectory** (`git log --reverse --stat <merge-base>..HEAD`), treating **each commit as one iteration round**:
  - Separate production vs. test net churn (`+ins/-del`) and flag hot production or test files growing monotonically across `>= 3` commits.
  - Note when new coordination primitives (keys, scripts, locks/leases, queues, flags, tables/columns, background loops) or heavy test scaffolds (custom fakes/hooks, private-state mutators) entered the branch.
  - Check follow-up commits for **patch-breeding chains** (an earlier fix triggering a later P1 or heavier workaround) and **fix-induced asymmetry** (project every new guard, gate, or SQL predicate onto all sibling paths: other flag states, degraded paths, companion handlers, and runbook SQL).
- Read the branch as a complete implementation via full-tree searches to catch old paths, duplicate models, residual compatibility layers, and callers outside the diff.

Attribute every finding to one state: `baseline`, `regression`, `design-convergence` (including incomplete migration, conflicting models, or unjustified complexity inflation), `incomplete-fix` (unfixed or asymmetric/patch-breeding follow-up), or `unverified`.

## 2. Load repository rules and domain context

Read only the rules and domain docs relevant to the change:

- `AGENTS.md`, `README.md`, and nested instructions.
- `.review/review-style-guide.md`, critic/severity rules, and relevant cases.
- Project skills when present (`.agents/skills/review-ags`, `e2e-review`, `developing-sandhub`).
- Domain docs, glossary, ADRs, API specs, lifecycle docs, and migration/rollout runbooks.
- `agentruntime-context` for AgentRuntime topology, service ownership, environments, and logs.

When code and domain docs disagree, cite the exact contradiction and treat the rule as unresolved until settled.

## 3. Build the shared model

Before judging individual files—and before fanning out subagents—produce three compact artifacts:

1. **Terminal-state model & Accepted Boundaries**: authoritative sources of truth, legal transitions, durable progress/receipts, reconciliation paths, owning layer per invariant, migration/rollback boundaries, and explicitly documented **Accepted Boundaries** (bounded TTLs or operational preconditions chosen in place of extra runtime state).
2. **Impact map**: entry points and consumers (API/YunAPI/CLI/UI/MCP/SDK/RPC, workers, queues, DB tables, shared coordination primitives with full reader/writer maps, external calls, metrics/logs/errors), explicitly separating flag-gated paths from always-on shared paths.
3. **Trajectory & complexity ledger**: commit-by-commit summary from Step 1, hot prod/test files, and inventory of newly added coordination primitives and heavy test scaffolds.

## 4. Route review execution

- **Focused change** (`< 20` non-test files and `< 3` high-risk domains): stay in the main session and apply the relevant lens files.
- **Large or cross-cutting change** (`>= 20` non-test files or `>= 3` domains): fan out 3–4 clean-context read-only subagents in parallel, one lens each:

| Lens | Reference file | Primary failure modes |
|---|---|---|
| Fallback & Concurrency | [`lens-fallback-and-concurrency.md`](lens-fallback-and-concurrency.md) | Liveness, exhaustion contracts, post-outage recovery, flag × health symmetry, primitive proportionality |
| SQL & Capacity | [`lens-sql-and-capacity.md`](lens-sql-and-capacity.md) | Hot-tenant scale, runtime + runbook SQL `EXPLAIN`/locks, generated-column traps, `TX-09` snapshots, reclamation |
| Rollout & Compatibility | [`lens-rollout-and-compat.md`](lens-rollout-and-compat.md) | Default-config blast radius, producer/cleaner symmetry, legacy keys, mixed-version rollout, runbook consistency |
| State & Contract | [`lens-state-and-contract.md`](lens-state-and-contract.md) | Terminal convergence, cold-read readability, subtraction & test signal-to-noise, bidirectional lag, business/API/UI/E2E contracts |

Give each subagent the merge-base, HEAD, changed file list, Step 3 shared model, and its lens file path. Require evidence-backed findings, full lens coverage (no early stop after 1–2 defects), and subtraction/boundary-first repair recommendations.

## 5. Separate engineering and contract lanes

Keep **Engineering lane** findings (seams, types, SQL/locks, concurrency/liveness, cleanup, state-space readability) distinct from **Contract lane** findings (API semantics, state invariants, tenant isolation, billing/metering, compatibility, defaults).

**Honest boundaries**: honor explicitly accepted product or runbook boundaries instead of reporting them as defects. When a comment or doc over-promises on a best-effort or bounded-TTL mechanism, ask first whether the guarantee is truly required—if the edge window is narrow and operationally bounded, recommend aligning the comment/runbook to an honest `Accepted Boundary` rather than stacking new runtime machinery.

## 6. Verify behavior with evidence

Use the smallest check that falsifies each suspected defect; verify contested or high-severity subagent claims directly in the main session:

- **Regression & race**: targeted baseline-vs-current tests and `-race` on shared-state/lifecycle paths.
- **Fault & exhaustion**: inject dependency failures and exhausted retry/CAS paths to prove callers fail safe without poisoning shared stores.
- **Real MySQL `EXPLAIN` & locks**: run real MySQL (matching production major version) `EXPLAIN` and lock checks on every new/modified runtime SQL and runbook/migration/backfill/rollback SQL—syntax pass alone is insufficient.
- **Scale, clock & defaults**: test warm-to-cold transitions under shipped default flags, controlled clock/TTL boundaries, realistic pagination cardinality (`10+` batches) under concurrent hot-tenant mutations (`3–15 ms` intervals), and restart/leader-change/duplicate-delivery edges.
- **Consistency & legacy matrices**: verify long-TTL post-outage recovery, pre-existing non-canonical rows in real MySQL, bidirectional async-projection lag, `TX-09` concurrent cross-branch snapshots, and actual E2E matrix execution when coupled.

Record exact commands, environments, outcomes, and skip reasons. A green command is insufficient when relevant matrices were skipped, flags were overridden away from defaults, cardinality was trivial, or negative tests asserted only a route 404. Clean up temporary containers/files and report any leftover.

## 7. Classify and attribute findings

Each finding must state: severity (`P0`/`P1`/`P2`), attribution, affected path & trigger, violated invariant or rule, concrete evidence, **smallest repair** labeled `subtraction` / `boundary-alignment` / `invariant-fix` (checking sibling symmetry), **verification** (prefer folding a case into an existing table-driven/contract test or replacing an obsolete test over adding a standalone fixture), and merge gate.

Severity boundaries:
- **P0 (blocking)**: security, catastrophic data/service impact, deterministic livelock/starvation on a critical path, or default-config shared-path outages affecting non-gray tenants.
- **P1 (blocking)**: correctness, compatibility, lifecycle, data integrity, cache poisoning / fail-open fallback, unbounded steady-state growth, material performance/liveness defects, or severe complexity bloat where stacked machinery destabilizes a critical module and keeps breeding bugs.
- **P2 (non-blocking)**: bounded correctness, runbook contradictions, unindexed operational SQL, or convergence/readability/test-bloat defects that do not break production invariants. Keep `P2` non-blocking so downstream fix loops weigh trade-offs instead of stacking patches.

## 8. Deliver the review

Write the draft report in the user's language using [`report-template.md`](report-template.md) **outside the target repository**:

1. User-specified path, if given.
2. Otherwise `<artifact-dir>/scratch/sandstorm-review-<branch-or-mr>-<short-head>.md` (or `<artifact-dir>/...` when user-facing).
3. Otherwise `/tmp/sandstorm-review-<repo>-<short-head>.md`.

Return only the clickable report link, recommendation, `P0`/`P1`/`P2` counts, one-line bullets per blocking finding, key subtraction candidates, and unverified checks.

Only when the user explicitly requests submission: re-fetch MR notes, deduplicate unresolved comments, post evidence-backed inline comments plus one overview, and read back their final state.
