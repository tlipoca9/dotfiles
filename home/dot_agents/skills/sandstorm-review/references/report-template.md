# Sandstorm review

## Scope

- Repository, MR/branch, target branch, merge-base, target tip, and current HEAD
- Change scale (total / non-test files, prod vs. test net diff) and execution mode (single-pass or 4-lens sharding; coupled E2E if applicable)

## Commit trajectory

Summarize `merge-base..HEAD` chronologically (one commit = one iteration round):

- Commit table: short SHA, summary, prod vs. test net diff (`+ins/-del`), and newly added coordination primitives or heavy test scaffolds.
- Hot-file churn: prod/test files growing across `>= 3` commits, test-to-prod ratio, and any patch-breeding chain.

## Terminal state and accepted boundaries

State authoritative sources of truth, legal transitions, durable progress/receipts, reconciliation path, owning layers, and **explicit Accepted Boundaries** (bounded TTLs or operational preconditions chosen in place of extra runtime state).

## Design convergence

Assess the complete branch against `develop`:
- Structural convergence (duplicate paths, split responsibilities, legacy/migration hygiene, cold-read legibility).
- **Subtraction candidates**: optimizations, state machines, abstractions, or test scaffolds that should be deleted, collapsed, or converted into an `Accepted Boundary` rather than patched further.

## Lens summary

Brief verdict per applicable lens (omit non-applicable lenses and note why):
- **Fallback & Concurrency**
- **SQL & Capacity**
- **Rollout & Compatibility**
- **State & Contract**

## Findings

Repeat per finding:

### [P0/P1/P2] Short title

- Attribution
- Affected path and trigger
- Evidence
- Impact
- Smallest repair (`subtraction` / `boundary-alignment` / `invariant-fix`)
- Verification (prefer folding into an existing table-driven/contract test or replacing an obsolete test)
- Merge gate

## Verification

List exact commands, environment, and results (passed / failed / skipped / environment-blocked), including real MySQL `EXPLAIN` coverage, default-config/liveness checks, and temporary resource cleanup.

## Existing comments

Note rechecked unresolved comments and deduplicated findings (or note if no MR context was supplied).

## Recommendation

State `MERGE_READY` or `CHANGES_REQUESTED`, blocking findings, and unverified boundaries.
