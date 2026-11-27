# Sandstorm review

## Scope

- Repository and MR or branch
- Target branch and merge-base
- Target commit and current HEAD
- Change scale and review execution mode (single-pass or multi-lens sharding, plus E2E if applicable)

## Terminal state

Describe the intended resource states, authoritative sources of truth, durable progress, external receipts, reconciliation path, and ownership boundaries.

## Design convergence

Describe how the current branch differs from `develop` as a complete implementation. Call out duplicate paths, conflicting state models, residual compatibility layers, redundant migrations, unnecessary fields, responsibilities that have not converged, and avoidable call-chain or test complexity that should be simplified.

## Lens summary

Summarize the verdict for each applicable lens (omit non-applicable lenses and state why):

- **Fallback & Concurrency**: fence writer inventory, `T_work` vs. `T_invalidate`, CAS/retry exhaustion return contracts, post-outage cache recovery, and flag × health protection symmetry.
- **SQL & Capacity**: runtime + runbook SQL `EXPLAIN` coverage, lock/generated-column risks, `TX-09` snapshot atomicity, and steady-state collection growth/reclamation against the hot-tenant baseline.
- **Rollout & Compatibility**: default-config always-on blast radius, producer/cleaner symmetry, delayed-detonation boundaries, legacy key normalization, mixed-version safety, and multi-doc rollout/anchor cross-check.
- **State & Contract**: business chain integrity, bidirectional authority-vs-projection lag matrix, and API/UI/E2E contract alignment.

## Findings

For each finding use this shape:

### [P0/P1/P2] Short title

- Attribution
- Affected path and trigger
- Evidence
- Impact
- Smallest repair
- Verification
- Merge gate

## Verification

List commands and results. Distinguish passed, failed, skipped, and environment-blocked checks. Include baseline/current comparisons, real MySQL `EXPLAIN` coverage (runtime + runbook SQL), default-config and concurrent-liveness coverage, and E2E execution coverage.

## Existing comments

State which existing unresolved comments were rechecked and which findings were deduplicated.

## Recommendation

State whether the branch can merge, which findings block it, and what remains unverified.
