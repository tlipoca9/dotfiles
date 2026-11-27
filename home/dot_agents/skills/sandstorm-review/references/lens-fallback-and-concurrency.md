# Lens: Fallback, Fencing, and Concurrency

Use this lens to audit concurrency liveness, bounded retry/CAS exhaustion semantics, post-outage cache recovery, and protection symmetry across flag and dependency-health states.

## 1. Concurrency liveness and fencing

Safety fences (epochs, generation counters, version keys, CAS targets, `WATCH`, rebuild locks, singleflight gates) prevent stale writes but can cause deterministic livelock when paired with multi-step work. For every touched fence or optimistic retry loop:

- **Complete writer inventory**: Audit every writer that creates, rotates, or invalidates the fence across the codebase, including Go callers, Lua scripts, legacy/compatibility paths, routine lifecycle transitions (start, pause, resume, stop, update), error/repair handlers, and background workers.
- **Conditional invalidation**: Confirm each writer rotates or invalidates the fence only when it actually mutates protected state; flag unconditional writes on no-op paths (missing target key, zero affected entries, or already-settled state).
- **Scope separation**: Confirm routine high-frequency operations are isolated from slow rebuild, backfill, or repair fences (or preserve forward progress under concurrent writes) rather than sharing an unguarded tenant-wide, pool-wide, or global epoch.
- **Liveness inequality (`T_work` vs. `T_invalidate`)**: Compute the full guarded critical window `T_work` (scan/pagination RTTs + DB queries + external RPCs + final writes from fence sample to commit) at hot-tenant scale (`10^4–10^5` entries / `100 ms–1 s+` for multi-round scans or heavy queries), and compare it against the concurrent fence-mutation arrival interval `T_invalidate` (`3–15 ms` under `70–320+` ops/s peak lifecycle/update traffic) across all writers in the inventory. Whenever `T_work` can approach or exceed `T_invalidate`, bounded optimistic retries amplify latency and exhaust into failure; flag this as a blocking liveness defect.

## 2. Exhaustion and fallback return contracts

Proving that a retry or CAS loop terminates (for example, max 3 attempts) is only half the check. Audit what the function **returns** when retries exhaust, a lock/lease times out, or a dependency degrades:

- **Never trust an inline comment alone**: If a comment claims "does not overwrite Redis or local cache", verify every caller in the call stack rather than stopping at the callee.
- **Trace every returned field upward**: When an exhausted or degraded branch returns `err == nil` alongside a stale snapshot, sentinel value, synthetic/forged `generation`/`version` token, or a `cacheable=false` flag, trace all callers up to every **shared-store writer** (Redis, DB, shared in-memory cache) and every **admission, isolation, or lifecycle gate**.
- **Check for cache poisoning and fail-open bypass**: Confirm that no caller can write uncommitted/synthetic metadata into shared Redis keys or accept a CAS-rejected stale snapshot as an authoritative "allow" decision.
- **Preferred terminal design**: Exhausted retry/CAS paths should emit an explicit metric/reason and return a typed error (such as `ErrRedisUnavailable`) so all callers converge on one fail-safe bypass + DB fallback path instead of relying on each caller to remember subtle partial-return invariants.

## 3. Protection symmetry matrix (Flag × Dependency Health)

Whenever a hot path uses protective mechanisms (`singleflight`, negative caching, circuit breakers, rate limits, local fences, or timeouts), build the 2×2 matrix instead of checking flags and backend failures independently:

| | Dependency healthy | Dependency degraded / fenced / overflowing |
|---|---|---|
| **Feature flag OFF (default)** | Protection & DB QPS amplification | Protection & DB QPS amplification |
| **Feature flag ON** | Protection & DB QPS amplification | Protection & DB QPS amplification |

Check two invariants:
- **No degraded regression**: Enabling a feature flag must not make the degraded/fenced fallback path weaker than the flag-OFF path (for example, `singleflight` present when flag is OFF, but missing when flag is ON and Redis fails or an unconfirmed-invalidation fence triggers).
- **Single-layer ownership**: Coalescing and fallback protection should live in one coherent layer (typically the cache or repository boundary) rather than being split or duplicated across service and cache layers.

## 4. Post-outage stale-cache resurrection

Proving fail-safe DB fallback *during* a Redis or cache outage is insufficient. For every post-commit cache invalidation (`DEL`, generation rotation, tombstone):

- Trace what happens when the invalidation fails during a brief outage and the cache later recovers before a long TTL (for example 5–30 min) expires.
- Any security, billing, isolation, or lifecycle gate whose stale entry could fail-open after recovery requires a durable compensation path (outbox, pending flag re-driven by a scanner, or bounded reconciliation) rather than fire-and-forget logging.
- Check fence overflow/cap behavior: if an in-memory or Redis pending-invalidation structure caps out or drops entries, verify the fallback window bounds both staleness and DB fallback amplification.
