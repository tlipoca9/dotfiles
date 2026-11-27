# Lens: Terminal State, Business Chain, and Contracts

Use this lens to audit terminal-state convergence, bidirectional authority-vs-projection consistency, end-to-end business flows, and API/UI/E2E contracts.

## 1. Terminal-state convergence

Compare the complete current branch (not just the narrow diff) against `develop` and the terminal-state model from Step 3 of [`workflow.md`](workflow.md). Look for:

- duplicate old and new code paths or responsibilities split across layers that cannot enforce the required invariant
- state transitions reachable through only one entry point while sibling paths observe an older model
- fields, flags, or tables that no longer carry product meaning
- compatibility layers kept for data that does not exist
- migrations that are repeated, out of order, or incomplete

### Call-chain and layer complexity

Terminal-state convergence requires simplifying the final call graph, not merely proving that stacked patches pass tests:

- Flag patch-on-patch layering: unnecessary pass-through wrappers, dead parameters, multi-hop callbacks, or duplicated guards/fallbacks split across adjacent layers (for example, Service and Cache both implementing coalescing or fallback branches).
- Ask whether an invariant can be enforced with fewer hops, a single owning layer, or a merged branch/state source instead of preserving intermediate scaffolding from earlier iterations.

### Test complexity and signal-to-noise

Treat excessive test complexity as both a maintainability defect and a design smell pointing back to unconverged production boundaries:

- Verify tests protect **durable behavior, contracts, and invariants** rather than internal implementation details, private state, or temporary scaffolding.
- Flag heavy mock webs of internal collaborators, duplicated production branching inside test helpers, brittle timing/sleep hacks, or oversized fixtures required to verify a simple contract—and trace whether simplifying the production boundary eliminates that test complexity.
- Flag repetitive test boilerplate that can collapse into focused table-driven or contract tests, as well as obsolete tests left behind after a design change.
- Keep findings anchored to maintenance/regression risk and convergence; do not elevate personal style preferences to blocking defects.

## 2. Bidirectional authority-vs-projection lag matrix

Whenever a state combines an authoritative source of truth with an asynchronous materialized projection (for example, a parent repository's `isolated_at` vs. member rows' `status`), build a **bidirectional lag matrix** before reading individual handlers:

- **Forward lag**: authority has transitioned to restricted/terminal while the async projection still shows the prior active state.
- **Reverse lag**: authority has resumed/cleared while the async projection still shows the prior restricted state.

Check **cache-hit reads**, **cache-miss reads**, **admission/reuse checks**, and **mutation/update paths** across both rows of the matrix. Any guard that treats the lagging projection as authoritative over the source of truth in either direction is a merge-blocking convergence defect.

## 3. Business data-flow chain

Trace the feature in this order:

1. **Business terminal state**: Confirm what "ready", "success", "deleted", "failed", "paused", or equivalent means to callers and billing.
2. **Durable progress**: Check cursors, checkpoints, leases, orders, database rows, migrations, and restart behavior.
3. **Asynchronous external receipt**: Check retries, timeouts, cancellation, duplicate delivery, provider errors, and whether success is recorded before the external result is durable.
4. **Reconciliation and reclamation**: Check that later scans or read APIs recover from every partial failure, that final account, resource, usage, and billing views agree, and that settled auxiliary records (tickets, tombstones, pending rows, staging keys) are actively reclaimed in steady state.

Check lifecycle edges, clock and TTL-expiry boundaries after warm operation, stale messages, replays, partial writes, leader changes, and old messages read by the new code.

## 4. API, UI, and E2E contract alignment

- Verify API request/response semantics, error-code hierarchy, resource ownership, and tenant isolation.
- When `web/` or client SDK changes are included, verify frontend state models, status badges, actions, and error handling match the backend's terminal state and rollout flags.
- When E2E changes are included, verify the suite actually executes the intended matrix and assertions (not skipped tests, non-default flag overrides hiding default-config bugs, or route-404-only negative assertions).
