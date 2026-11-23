# Sandstorm review

## Scope

- Repository and MR or branch
- Target branch and merge-base
- Target commit and current HEAD
- Review mode, including E2E if applicable

## Terminal state

Describe the intended resource states, durable progress, external receipts, reconciliation path, and ownership boundaries.

## Design convergence

Describe how the current branch differs from `develop` as a complete implementation. Call out duplicate paths, conflicting state models, residual compatibility layers, redundant migrations, unnecessary fields, and responsibilities that have not converged.

## Findings

For each finding use this shape.

### [P0/P1/P2] Short title

- Attribution
- Affected path and trigger
- Evidence
- Impact
- Smallest repair
- Verification
- Merge gate

## Verification

List commands and results. Distinguish passed, failed, skipped, and environment-blocked checks. Include baseline/current comparisons and E2E execution coverage.

## Existing comments

State which existing unresolved comments were rechecked and which findings were deduplicated.

## Recommendation

State whether the branch can merge, which findings block it, and what remains unverified.
