# Production data-fix SQL runbook

Use this workflow whenever drafting or executing production `UPDATE`, `DELETE`, or backfill SQL. Never run a broad unindexed `UPDATE`/`DELETE` directly on a live primary—even when a filter matches few rows, scanning a large range holds locks and stalls concurrent traffic.

## Step 1 — Per-region schema and index check

Inspect `SHOW CREATE TABLE` / `SHOW INDEX` (or `\d+`) on **every** target region, cluster, or shard. Record any index or column-type differences before finalizing the SQL for that target.

Done when every target environment's schema and indexes are verified rather than inferred from another environment.

## Step 2 — Extract target keys and before-image backup on the replica

Run the selection query on a **read-only replica**, not the primary:

1. If no narrow index matches the filter, compute `SELECT MIN(id), MAX(id) FROM <table>;` and scan in primary-key chunks (`WHERE id >= ? AND id < ?`, 50k–200k per chunk), verifying the chunk query with `EXPLAIN` and an active timeout.
2. Export the exact target primary keys (or unique keys) together with the original values of every column that will be modified or deleted. Keep this export as the rollback/audit baseline.

Done when the exact list of target keys and their before-images is captured from the replica.

## Step 3 — Single-row Dry-Run preview

Before writing any mutation, run a single-row `SELECT` against a real target row (by primary/unique key) that computes the exact new column values side by side with the old values.

- Verify edge cases explicitly: `NULL`, empty string, empty JSON array/object (`[]`, `{}`), and fields that must remain untouched.
- For JSON/structured rewrites, confirm no unintended keys are dropped, renamed, or type-coerced.

Done when the before/after preview on a real target row matches the intended result verbatim.

## Step 4 — Author PK/UK-batched DML with idempotency guard

Structure every primary `UPDATE` or `DELETE` with all four safeguards:

1. **Primary-key or unique-key targeting only**: `WHERE id IN (...)` or `WHERE <unique_key> IN (...)`, verified by `EXPLAIN` to use `PRIMARY` or a unique index.
2. **Small batches**: 100–200 rows per statement (at most 500 for lightweight rows), committed per batch—never one transaction spanning the entire fix.
3. **Idempotency guard in `WHERE`**: include the expected dirty state/value (for example `AND dirty_col IN (...)` or `AND status = '...'`) so re-runs or rows already updated by live traffic are skipped instead of clobbered.
4. **Lock/lag pacing**: set a short lock timeout where supported (PostgreSQL `SET lock_timeout = '2s';`, MySQL `SET SESSION innodb_lock_wait_timeout = 5;`), pause briefly between batches on busy primaries, and abort if replication lag spikes.

Done when the mutation SQL is PK/UK-indexed, batched, idempotent, and verified with `EXPLAIN` on the target schema.

## Step 5 — Single-row canary

Execute the change on **one** low-risk target row first (together with any required cache invalidation in Step 6). Verify the updated database row, application logs/metrics, and live request behavior before running remaining batches.

Done when the canary row produces the expected end-to-end behavior.

## Step 6 — Downstream consistency and straggler check

1. **Cache invalidation**: identify every cache layer that mirrors the modified rows (Redis, local process cache, CDN/projection store) and include the exact invalidation commands alongside each batch.
2. **Concurrent write-back / straggler re-check**: after all batches and cache invalidations complete, wait for in-flight requests and cache TTLs to settle, then check logs/metrics or re-verify target state for any rows overwritten concurrently during the rollout. Patch stragglers by their exact keys using Steps 4–6.

Done when caches are invalidated, error/miss signals return to baseline, and no stragglers remain.
