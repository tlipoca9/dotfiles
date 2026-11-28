# Lens: Fallback, Fencing, and Concurrency

Use this lens to audit concurrency liveness, bounded retry/CAS exhaustion semantics, post-outage cache recovery, flag × health protection symmetry, and state-space proportionality.

## 1. Concurrency liveness and fencing

Safety fences (epochs, generation counters, version keys, CAS targets, `WATCH`, rebuild locks, singleflight gates) prevent stale writes but can cause deterministic livelock when paired with multi-step work. For every touched fence or optimistic retry loop:

- **Complete writer inventory**: audit every writer that creates, rotates, or invalidates the fence (Go callers, scripts, legacy paths, routine lifecycle transitions, repair handlers, background workers).
- **Conditional invalidation**: confirm writers rotate or invalidate only when state actually mutates; flag unconditional writes on no-op paths.
- **Scope separation**: isolate routine high-frequency operations from slow rebuild/backfill/repair fences rather than sharing an unguarded tenant-, pool-, or cluster-wide epoch.
- **Liveness inequality (`T_work` vs. `T_invalidate`)**: compare the full guarded window `T_work` (scan/pagination RTTs + DB queries + RPCs + final writes) at hot-tenant scale (`10^4–10^5` entries / `100 ms–1 s+`) against concurrent fence-mutation intervals `T_invalidate` (`3–15 ms` under `70–320+` ops/s peak). When `T_work` approaches or exceeds `T_invalidate`, flag a blocking liveness defect.

## 2. Exhaustion and fallback return contracts

Proving a retry/CAS loop terminates is only half the check. Audit what it **returns** on exhaustion, lock timeout, or degradation:

- Verify callers directly instead of trusting inline comments claiming "does not overwrite cache".
- Trace every returned field upward (`err == nil` with stale snapshots, sentinel/synthetic version tokens, or `cacheable=false` flags) to every shared-store writer and admission/isolation/lifecycle gate.
- Confirm no caller writes uncommitted/synthetic metadata into shared stores or treats a CAS-rejected snapshot as an allow decision.
- **Preferred terminal design**: emit an explicit metric/reason and return a typed error (such as `ErrRedisUnavailable`) so all callers converge on one fail-safe bypass + DB fallback path.

## 3. Protection symmetry matrix (Flag × Dependency Health)

Build the 2×2 matrix for every protected hot path (`singleflight`, negative caching, circuit breakers, rate limits, local fences, timeouts):

| | Dependency healthy | Dependency degraded / fenced / overflowing |
|---|---|---|
| **Feature flag OFF (default)** | Protection & DB QPS amplification | Protection & DB QPS amplification |
| **Feature flag ON** | Protection & DB QPS amplification | Protection & DB QPS amplification |

Verify two invariants:
- **No degraded regression**: enabling a flag never leaves the degraded/fenced fallback weaker than the flag-OFF path.
- **Single-layer ownership**: coalescing and fallback live in one owning layer rather than duplicating across adjacent layers.

## 4. Post-outage stale-cache resurrection

For every post-commit invalidation (`DEL`, generation rotation, tombstone), trace what happens when invalidation fails during a brief outage and the cache recovers before TTL expiry:

- **Long-TTL security, billing, isolation, or lifecycle gates** that could fail-open after recovery need durable compensation—prefer reusing an existing durable DB state or reconciliation scanner over inventing a new queue or cross-pod protocol.
- **Short-TTL optimization caches or narrow operational-transition windows** (such as flag toggles combined with abrupt crashes inside one short TTL) should rely on bounded TTL, a short-timeout best-effort invalidation, or an explicit runbook `Accepted Boundary` rather than adding cross-pod leases or durable queues.
- Check cap/overflow behavior: when a pending-invalidation buffer caps out, bound both staleness and DB fallback amplification.

## 5. State-space proportionality and subtraction

Reliable concurrent code comes from a small, legible state space rather than stacked defenses policing an expanding one:

- **Primitive justification**: check each newly introduced coordination primitive against the commit trajectory. Flag any mechanism that adds large interaction state space merely to close a narrow edge window absorbable by a bounded TTL, existing durable scanner, or runbook precondition.
- **Volatile-memory discipline**: flag in-process maps or retry buffers that have crept into quasi-distributed queues (stacking layered caps, backoff schedulers, drain protocols, and cross-process leases onto volatile memory).
- **Patch-breeding check**: when a mechanism was introduced solely to patch an earlier fix commit's side effect, recommend deleting or redesigning the root mechanism (or dropping a low-value optimization branch) instead of adding another guard.
- **Test-scaffolding alarm**: when concurrency/cache tests need heavy internal interceptors, private-field mutation, or oversized setup to prove one narrow edge case, flag the underlying production seam complexity and prefer simplifying the module plus folding coverage into a compact contract test table.
