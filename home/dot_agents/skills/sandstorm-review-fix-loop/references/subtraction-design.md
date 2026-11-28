# Subtraction-first design rules

Shared standard for triage, implementation, and pre-commit diff audits in `sandstorm-review-fix-loop`. Every rule serves one thesis: **real simplicity produces readable code, and readable code naturally eliminates whole classes of bugs.**

## 1. Clean-slate redesign (Design It Twice)

Treat `merge-base..HEAD` as a fresh deliverable, never as an untouchable stack of prior patches.

- When a module has `>= 2` tangled findings or heavy historical churn, close the finding list and sketch **2 simpler architectures** from scratch that satisfy the same product requirement with fewer concepts. Pick the one with the smallest state space and clearest ownership.
- When an earlier fix commit bred today's bug, delete or redesign that earlier commit instead of adding a compensating layer.

## 2. Drop low-value optimizations first

Before defending an intricate fast path, cache tier, or async buffer, price it honestly: *if we delete or narrow this optimization, what actually degrades—and how many edge-case bugs vanish at once?*

- Prefer removing a marginal optimization that causes 60% of the state-machine complexity over building a distributed protocol to keep it safe.
- Keep optional optimizations cleanly isolated behind a narrow seam so they remain trivial to disable or delete.

## 3. Divide and conquer: contract-first, self-contained modules

The point of modular decomposition is to **shrink the files and text a reader or model must hold in working memory at once**. Every extra shared state variable multiplies the context required to change one line safely.

- **Agree on exposed contracts first**: define each module's narrow external interface, invariants, and error semantics up front; callers depend only on that contract, never on internal details.
- **Keep each module self-contained**: each module owns its mutable state, concurrency control, lifecycle, and black-box contract tests exclusively—never sharing internal maps/locks across modules or leaking multi-step wiring onto callers. If a struct bundles orthogonal state spaces, split along clean contract boundaries so editing module A never requires reading module B.
- **Reuse durable authority**: before introducing a new key family, script, queue, lease, table, or background loop, verify whether existing authoritative DB state, an existing scanner, or a bounded TTL already covers the risk.
- **Volatile-memory rule**: treat in-process maps as lightweight best-effort accelerators; keep them trivially bounded rather than growing them into quasi-distributed queues.
- **Narrow edge windows**: for low-probability operational/crash/toggle combinations bounded by short TTL or runbook order, prefer an explicit `Accepted Boundary` over cross-process coordination state.

## 4. Cold-Read Test (concrete readability gate)

A design passes readability only when a colleague arriving cold can verify all three:

1. **Minimal working set (`<= 2` hops)**: reading or changing a module requires only its exposed contract plus its own files, tracing authoritative state, happy path, and failure fallback in at most 2 indirection hops.
2. **Bounded state combinations**: no core path juggles `>= 3` interacting flags/modes/versions/fences or relies on `3+` collaborating layers to maintain one invariant.
3. **Zero dead weight**: no shallow pass-through wrappers, unused parameters, redundant intermediate abstractions, or branches for impossible states.

## 5. Honest contracts

- Document the **actual** guarantee of every mechanism (best-effort, bounded TTL, eventual projection) so clean-context reviewers evaluate real contracts rather than overstated prose.
- Record intentional operational preconditions explicitly as **Accepted Boundaries** in runbooks/docs; update overstated comments instead of building new machinery to match them.

## 6. Test simplicity as a design litmus

- **Design-time litmus**: if a core invariant cannot be proven cleanly by a **15–30 line black-box contract or table-driven test**, pause and simplify the production seam or state space first. Heavy mocks, internal hooks, and private-field mutation are production-design alarms.
- **Fold or replace**: add new regression cases as rows in an existing table-driven/contract test instead of appending standalone tests with duplicated setup. Delete obsolete tests whenever you delete or simplify production logic.
- **Shared lightweight fixtures**: centralize compact test helpers and use deterministic synchronization in place of sleeps.

## 7. Pre-handoff self-audit (Fixer)

End every fixer handoff with these 5 lines:

1. **Removed / simplified**: production code, optimizations, primitives, or obsolete tests deleted or redesigned.
2. **Primitive delta**: net change in coordination/persistence primitives (`0` or negative expected).
3. **Test delta**: net test lines (`+ins/-del`), whether cases folded into existing table-driven/contract tests, and any new fakes/hooks or private-field access.
4. **Cold-Read result**: entry-to-authority hop count and whether any core path combines `>= 3` interacting state dimensions.
5. **Escalation check**: any item halted to respect the primitive budget, with 2–3 concrete options.
