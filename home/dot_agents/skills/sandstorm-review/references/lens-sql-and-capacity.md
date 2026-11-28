# Lens: SQL, Query Plans, and Capacity

Use this lens to audit every SQL statement (both runtime code and operational documentation), transaction snapshot atomicity, hot-path capacity, and steady-state collection growth.

## 1. Hot-tenant baseline envelope

Quantify rather than describe. Unless live metrics, `agentruntime-context`, or service configs show a stricter scale, size every hot path against at least these single-region, hot-tenant baseline orders of magnitude (calibrated from 7-day multi-region production traffic and live table sizes; never size from average traffic):

| Dimension | Baseline floor (hot tenant / single region) | Primary review risk |
|---|---|---|
| Live instances (`RUNNING` vs. `PAUSED`) | `~10^5` `RUNNING` (one tenant / region); **`10^6–5×10^6` `PAUSED`** (`10^6+` in one tenant, 30–40× `RUNNING`) | Queries/scans over `PAUSED` or non-deleted instances, pause-release queues, checkpoints, and bucket rebuilds |
| Core MySQL table scale (single region) | Live `sandbox_instances`: **`1.5×10^7+` rows / `450–600+ GB`**; daily event shards: `~10^7` rows/day (`~6 GB/day`); companion tables (`volumes`, `tokens`, `tools`, `tasks`, `pre_cache_images`, `billing_stat`): **`10^6–5×10^6` rows** (`3–20 GB`) | Full/wide index scans, `COUNT`/`SUM` timeouts (`>5 s`), online DDL locks, and unsharded growth |
| Read & invoke hot-path QPS | `1.5–2×10^3` ops/s per hot tenant (`3–4×10^3+` region total) | Uncached DB reads, cache/lock contention, and fan-out scans on list/describe/invoke paths |
| Lifecycle & update write QPS (peak 1m) | `200–320+` ops/s for start/stop/update (`3–5 ms` interval; up to `3.5×10^5`/h single-tenant creates, `4×10^6`/day region); `~170` ops/s for pause incl. auto-pause (`~6 ms` interval); `~70` ops/s for resume (`~14 ms` interval) | Optimistic-fence livelock (`T_invalidate` in single-digit ms) and serial-worker backlog |
| Unreclaimed TTL accumulation | `10^5–10^6` entries / `1h` window; `10^6–10^7+` entries / `24h` window (`write_rate × TTL`) | Unbounded companion hashes, queues, pending sets, or multi-day watermark maps |
| Redis cluster RTT & multi-round scan | `1.5–4 ms` per op (P50–P95, `~80 ms` tail); `40–400+` `HSCAN`/`SCAN` rounds (`100 ms–1 s+`) at `10^4–10^5` entries (multi-second at `10^6`) | Synchronous `O(N)` scans exceeding `T_invalidate` or request latency budgets |
| DB query & async-batch load | Point ops `2–10 ms` (P50–P95); broad `SELECT` P99 `50–300 ms` (multi-second/`>5 s` timeout tail); async flush `350–550+` batches/s | Critical-section / lock-hold / fence-window duration and connection-pool exhaustion |
| Replicas & concurrency | `6–26` pods per major region (`3–6` smaller regions); `10^2–10^3` concurrent hot-tenant requests | Cross-pod lock contention, miss stampedes, and retry/connection amplification |

## 2. Complete SQL inventory and real `EXPLAIN` coverage

Build one unified inventory before running `EXPLAIN`. It must include **both**:

1. **Runtime SQL**: every new or modified query, upsert, batch update, scanner query, and pagination query in Go/code.
2. **Operational & Document SQL**: every DDL statement, migration script, backfill/re-labeling SQL, cleanup SQL, and rollback SQL embedded in `docs/`, runbooks, schema-upgrade guides, or release checklists.

Rules for SQL verification:
- **Syntax/execution pass is insufficient**: Do not stop at proving a backfill or rollback SQL runs without error on toy data. Run real MySQL `EXPLAIN` (matching production MySQL major version, e.g., 8.0) on **every statement in the inventory** and inspect `type`, `key`, `rows`, `Extra`, and lock scope under `REPEATABLE READ`.
- **MySQL 8 generated-column predicate trap**: MySQL 8 does **not** automatically rewrite a predicate on a base column (e.g., `destroy_at IS NOT NULL`) into a predicate on a virtual/stored generated column index (e.g., `active_slot IS NULL`). Verify that both runtime queries and runbook backfill/rollback queries explicitly match the indexed generated-column predicate (and `FORCE INDEX` if required) so `UPDATE`/`DELETE`/`SELECT ... FOR UPDATE` cannot fall back to `type=ALL` and lock active rows.
- **Hot-path and lock-holding boundaries**: Flag routine SQL, full/wide index scans, or `O(N)` Redis reads (`HSCAN`/`SCAN`/`HGETALL`/`SMEMBERS`) on hot API paths or lock-holding rebuild paths.
- **Compact SQL test hygiene**: Prefer shared MySQL schema fixtures and table-driven `EXPLAIN`/lock assertion cases over duplicating schema setup and seed boilerplate per query or fix round.

## 3. Multi-branch query snapshot atomicity (`TX-09`)

Whenever a multi-status or composite read is split into multiple per-status `SELECT`s and K-way merged in memory (cursor pagination, cleanup scanners, TTL expiration scans, reconciliation pages):

- Verify all branches execute inside a single `ReadOnly` consistent-snapshot transaction (or a single `UNION ALL` query).
- Flag any split read without a shared snapshot where concurrent state transitions between branch queries can drop rows from every branch or prematurely terminate cursor pagination.

## 4. Storage capacity and steady-state reclamation

For every new or modified Redis hash, set, sorted set, stream, database table, queue, or in-memory buffer:

- Quantify rows/keys scanned and written per cycle, day, and region; read/update QPS, batch size, pagination rounds, lock duration, and retry amplification; account/region skew and event/billing volume.
- Compute steady-state cardinality against the baseline floor as `write_rate × retention_or_TTL_window` (e.g., `10^5–10^6` entries over 1h or `10^6–10^7+` per day).
- Verify an active, bounded steady-state reclamation path (handoff/deletion on async commit completion or bounded background drain) that keeps cardinality proportional to true in-flight work rather than cumulative throughput over the TTL window.
- Flag deferred synchronous cleanup when a hot request path, cache-miss rebuild, or lease-holding worker must scan backlog accumulated since the last expiry or reconciliation.
- If a design adds a table, Redis structure, field, queue, fence, or middleware, verify why existing structures cannot satisfy the invariant and how the new structure remains bounded and maintainable.
