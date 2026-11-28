# Lens: Terminal State, Business Chain, and Contracts

Use this lens to audit terminal-state convergence, readability, subtraction opportunities, bidirectional authority-vs-projection consistency, end-to-end business flows, and API/UI/E2E contracts.

## 1. Terminal-state convergence and readability

Compare the complete branch (plus its commit trajectory) against `develop` and the Step 3 terminal-state model:

- **Eliminate structural split**: flag duplicate old/new paths, responsibilities split across layers that cannot enforce the invariant alone, state transitions missing on sibling entry points, obsolete fields/flags/tables, unused compatibility layers, and repeated or incomplete migrations.
- **Cold-read test**: trace each core touched module (including caches, workers, repositories, and middleware—not only top-level handlers) from entry point to authoritative state and failure fallback. Flag paths that require `> 2` indirection hops, combine `>= 3` interacting flags/modes/versions, scatter one invariant across `3+` collaborating layers, or wrap simple logic in shallow pass-through abstractions/extra intermediate tables.
- **Trajectory bloat & subtraction test**: using the commit trajectory, flag hot files growing monotonically across `>= 3` rounds or mechanisms added to compensate for earlier patches. Ask which optional optimization or defensive layer can be deleted or replaced by a simpler single-owner seam so an entire class of edge bugs disappears.
- **Honest contracts**: when comments or docs promise stricter guarantees than a best-effort or bounded-TTL mechanism provides, prefer narrowing docs/comments to an explicit `Accepted Boundary` unless product correctness genuinely requires stronger runtime machinery.

### Test complexity and signal-to-noise

Treat heavy tests as both a maintenance defect and a design alarm pointing back to an unconverged production seam:

- Verify tests assert **durable external behavior and invariants** rather than internal scaffolding or private state.
- Flag heavy collaborator mock webs, duplicated production branching in helpers, sleep-based sync, oversized fixtures for simple contracts, repetitive cases that belong in a compact table-driven test, and obsolete tests left behind after refactoring.
- Anchor findings to real maintenance or regression risk; keep style preferences non-blocking.

## 2. Bidirectional authority-vs-projection lag matrix

Whenever an authoritative source of truth feeds an asynchronous materialized projection, audit both directions across cache-hit reads, cache-miss reads, admission/reuse checks, and mutation/update paths:

- **Forward lag**: authority moved to restricted/terminal while the projection still shows active.
- **Reverse lag**: authority resumed/cleared while the projection still shows restricted.

Any guard treating the lagging projection as authoritative over the source of truth is a blocking convergence defect.

## 3. Business data-flow chain

Trace the feature end-to-end:

1. **Business terminal state**: confirm what "ready", "success", "deleted", "failed", "paused", or equivalent means to callers and billing.
2. **Durable progress**: check cursors, checkpoints, leases, orders, DB rows, migrations, and restart recovery.
3. **Asynchronous external receipt**: check retries, timeouts, cancellation, duplicate delivery, provider errors, and durability before recording success.
4. **Reconciliation and reclamation**: confirm later scans or reads recover from partial failures, views across resource/usage/billing agree, and settled auxiliary records are actively reclaimed.

Check clock/TTL boundaries after warm operation, stale replays, partial writes, leader changes, and mixed-version messages.

## 4. API, UI, and E2E contract alignment

- Verify API request/response semantics, error codes, resource ownership, and tenant isolation.
- When `web/` or SDKs change, align client state models, actions, badges, and errors with backend terminal states and rollout flags.
- When E2E changes, verify the intended matrix actually runs under production-default flags (not skipped tests or route-404-only negative checks).
