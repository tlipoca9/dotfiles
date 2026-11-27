---
name: prod-db-safety
description: Safe read-only querying and production data-fix SQL authoring for live databases (shared, staging, pre-prod, and production, including read-only replicas). Use before running ad-hoc SQL via CLI, kubectl exec, or temporary pods, inspecting large or unknown-scale tables, writing backfill/cleanup UPDATE or DELETE runbooks, or diagnosing slow live queries. Excludes local dev and unit-test databases.
---

# Production database safety

Treat every shared, staging, pre-prod, and production database—including read-only replicas—as live production infrastructure. A slow read-only scan still exhausts IOPS, evicts the buffer pool, and increases replication lag.

Follow the gates below in order. Do not skip a gate because a query looks simple or targets a replica.

## Operating rules

- **Read-only replica by default**: run all ad-hoc inspection and export queries against a read-only replica whenever one exists.
- **No autonomous production writes**: default to producing a verified SQL runbook for human review. Execute `INSERT`, `UPDATE`, `DELETE`, or DDL against a live database only when explicitly authorized with bounded scope.
- **Verify every instance independently**: never assume schemas, column types, row counts, or indexes match across regions, clusters, or shards.
- **Branch to data-fix runbook**: whenever the task includes drafting or executing production `UPDATE`, `DELETE`, or backfill SQL, read [`references/data-fix-runbook.md`](references/data-fix-runbook.md) and satisfy every step in it.

## Gate 0 — Safe connection and timeout fuse

Configure mechanical safeguards before sending any query:

1. Confirm you are connected to a read-only replica (check `read_only` / `pg_is_in_recovery()`).
2. Enforce **both** a read-only transaction mode and a statement execution timeout (start at 5 seconds) at session startup.
3. Set a short connection timeout (`--connect-timeout=5` / `connect_timeout=5`).
4. If you launch a temporary pod or container to reach the database, record its name and guarantee deletion when finished.
5. **Client kill does not stop server scans**: if you interrupt a client or delete a temporary pod while a query is running, verify in the server process list that the backend query stopped; cancel it explicitly (`KILL QUERY` / `pg_cancel_backend`) if it is still running.

Done when the connection is verified read-only (for inspection), timeout is active in the session, and any temporary pod is tracked for cleanup.

## Gate 1 — O(1) metadata preflight

Inspect table scale, column types, and actual indexes on **the exact target instance** before reading any rows:

1. Check approximate row count and data size via metadata (zero row scan).
2. Check exact column types (watch for `json` vs `text`, `varchar` vs integer implicit-cast mismatches) and all available indexes.
3. Repeat this check for every region/cluster involved in the task before writing or running queries for it.

Done when you know the table's approximate row count, exact column types for referenced columns, and exact index definitions on the target instance.

## Gate 2 — `EXPLAIN` stop-the-line gate

Run `EXPLAIN` on every query other than a single-row primary-key or unique-key lookup before executing it.

- **Use `EXPLAIN`, never `EXPLAIN ANALYZE`, as a preflight check.** `EXPLAIN ANALYZE` executes the query and hits live data with the full scan cost.

Stop and rewrite the query if `EXPLAIN` shows any of these red flags:

- **MySQL / TXSQL**:
  - `type` is `ALL` or `index` on a table with > 100k rows.
  - `key` is `NULL` (no index chosen).
  - Estimated `rows` exceeds 50k–100k without an explicit bounded primary-key chunk range.
  - `Extra` shows `Using filesort` or `Using temporary` over a large estimated row set.
- **PostgreSQL**:
  - `Seq Scan` on a table with > 100k rows.
  - Large estimated `rows=` / `cost=` without an index bound, or `Nested Loop` pairing a large outer set with an unindexed inner scan.
- **Common index-busters to check and eliminate**:
  - Implicit type conversion (comparing an integer column to a string literal or vice versa).
  - Wrapping an indexed column in a function or expression (`DATE(created_at) = ...`, `LOWER(col) = ...`).
  - Leading wildcards (`LIKE '%foo'`), `OR` across unindexed columns, or high-`OFFSET` pagination.

Done when you have read the `EXPLAIN` output and confirmed a bounded index plan with timeout active.

## Gate 3 — Bounded execution and unindexed-table patterns

Avoid three high-frequency illusions on large tables:

- **`LIMIT N` illusion**: `WHERE unindexed_col = 'x' LIMIT 10` is **not** cheap—if fewer than 10 rows match (or matches are sparse), the engine scans the entire table or index range looking for them.
- **`COUNT(*)` illusion**: `SELECT COUNT(*) WHERE unindexed_col = 'x'` scans just as many rows as `SELECT *`. Do not run unindexed counts to "quickly check how many rows match."
- **Single-region extrapolation**: an index present in region A may be absent in region B.

When no index supports the filter predicate:

1. **Point sample first**: inspect known primary/unique keys (`WHERE id = ...` or `WHERE uk = ...`), or read `SELECT MIN(id), MAX(id)` (O(1) on the primary index) and scan a small bounded slice (`id >= X AND id < X + 50000`).
2. **Primary-key chunking for full extraction** (on read-only replica only): iterate `WHERE id >= ? AND id < ?` in chunks of 50k–200k primary-key values, verify the chunk query with `EXPLAIN` first, and keep the session timeout enabled.

## Engine quick reference

| Safeguard | MySQL 8 / TXSQL | PostgreSQL |
| :--- | :--- | :--- |
| Connect read-only + timeout | `mysql --connect-timeout=5 --init-command="SET SESSION transaction_read_only=1, SESSION max_execution_time=5000;"` | `PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=5000' psql "connect_timeout=5 ..."` |
| In-session read-only | `SET SESSION transaction_read_only = 1;` | `SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY;` |
| In-session timeout | `SET SESSION max_execution_time = 5000;` or `/*+ MAX_EXECUTION_TIME(5000) */` | `SET statement_timeout = '5s';` |
| Verify replica | `SHOW VARIABLES WHERE Variable_name IN ('read_only','super_read_only');` | `SELECT pg_is_in_recovery();` |
| Table scale (O(1)) | `SHOW TABLE STATUS LIKE '<table>';` | `SELECT reltuples::bigint AS est_rows, pg_size_pretty(pg_total_relation_size(oid)) FROM pg_class WHERE relname = '<table>';` |
| Schema & indexes | `SHOW CREATE TABLE <table>\G` and `SHOW INDEX FROM <table>;` | `\d+ <table>` or `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = '<table>';` |
| Plan preflight | `EXPLAIN <sql>;` | `EXPLAIN (COSTS ON) <sql>;` |
| Check / cancel hung query | `SHOW PROCESSLIST;` → `KILL QUERY <id>;` | `SELECT pid, now()-query_start, state, left(query,120) FROM pg_stat_activity WHERE state <> 'idle';` → `SELECT pg_cancel_backend(<pid>);` |

**MySQL caveat**: `max_execution_time` applies only to top-level read-only `SELECT` statements (not DML or stored routines). Always pair it with `transaction_read_only = 1` for inspection connections.

## Completion criteria

A live-database task is complete only when:

1. Every queried table had its size and indexes checked on that exact target instance before reading rows.
2. Every non-PK/non-UK query passed `EXPLAIN` (not `EXPLAIN ANALYZE`) with a bounded index plan and an active execution timeout.
3. Any temporary pod/container is removed and no orphaned server query remains running.
4. Any production write SQL follows every step in [`references/data-fix-runbook.md`](references/data-fix-runbook.md).
