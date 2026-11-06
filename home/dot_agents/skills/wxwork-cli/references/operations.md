# Index synchronization and recovery

Use these procedures for the indexed backend. Keep the account and configuration
consistent across queries, daemon control, synchronization, and rebuilds. Use
`wxwork <command> --help` for the installed command's options.

## Diagnose the state

Run `wxwork daemon status` when setup or a query fails. Top-level `ok: true`
means the diagnostic ran; it does not establish service readiness. Status
fields are under `data`; query responses put index metadata under `meta.index`.

| Status field | Interpretation |
| --- | --- |
| `service.enabled`, `service.installed`, `service.running` | Startup enabled, service registration present, daemon running |
| `service.elasticsearch_available` | ES status and index checks succeeded |
| `ready` | Initial full import completed; may be cached while ES is unavailable |
| `syncing`, `scanned`, `written` | Current sync and its progress |
| `last_successful_sync`, `last_error` | Last completed sync and source/index error |
| `service.last_error` | Managed service failure |
| `service.container`, `service.volume` | Resources owned by this service |

Check availability and readiness together. A missing index alias can also
make availability false; inspect the error message before treating it as a
connection failure. ES can serve existing history while the daemon is stopped.

## No ES or an incomplete first import

1. Inspect `wxwork daemon status` and its errors.
2. To enable managed indexing, run `wxwork daemon start`. It enables automatic
   startup and prepares its managed ES service. Respect an intentional service
   stop. If the command reports missing runtime prerequisites, report those
   specific requirements; repeatedly starting or rebuilding will not fix them.
3. Startup and the first full import run asynchronously. Check status at spaced
   intervals, watching availability, readiness, progress, and errors. Avoid
   duplicate starts or sync requests while work is progressing.
4. Once ES is available and `ready: true`, retry the requested query. If progress
   stops with a repeated error, address that error rather than polling forever.

`sync --wait` requires an available ES service; it does not start ES. Use it
when a completed fresh sync is required. It may wait behind an existing writer.
A plain `sync` request requires a running daemon and returns before completion.

## Handle failures

| Error or observation | Next action |
| --- | --- |
| `index_unavailable` | Inspect service status and errors. A running managed daemon retries service recovery. If stopped and resuming is intended, run `daemon start`; retry the query after recovery. |
| `index_not_ready` | Inspect import progress and source errors. Let an active import finish, or run one `sync --wait` against available ES. |
| `index_missing` | Verify the intended account, endpoint, and index configuration. If data was lost, the daemon or `sync --wait` can import what remains in the source. |
| Source/key/snapshot error with a ready index | Query retained history and disclose the last successful sync time. Diagnose the source with `doctor`; fix the reported cause before requesting another sync. |
| `account_mismatch` | Correct the account/configuration mismatch. Do not replace another account's index. |
| `invalid_reference` | Check that the complete opaque reference was passed unchanged; use a reference returned by the CLI. |
| `message_not_found` | Report that the referenced record is absent from retained history. Keep any supplied snapshot as historical evidence. |
| `index_upgrade_required` from `messages senders` | Follow the sender-index upgrade below. Other indexed reads remain available. |
| `invalid_cursor`, `cursor_query_mismatch`, `cursor_generation_mismatch` | Restart sender discovery from its first page with the intended account and original query. |
| `index_changed` | Retry the read once against the current generation. |
| `capture_pending` | Let the daemon recover the capture batch, or run `sync --wait`, then retry the incremental check. |
| `checkpoint_busy` | Let the other incremental delivery finish, then retry. Do not reset its checkpoint. |
| `daemon_not_running` from `sync` | Start the daemon if intended, or use `sync --wait` against available ES. |
| `daemon_running` | Reuse the running daemon instead of starting another foreground instance. |
| `indexed_freshness_unsupported` | Remove `--refresh` / `--freshness`; use `sync --wait` before querying when fresh data is required. |
| `capture_since_unsupported` | Use `history --since` for a send-time window. |
| Container ownership, port, or configuration conflict | Inspect the reported resources and correct the specific conflict while preserving indexed data and unrelated services. |
| Other errors | Read `error.message` and service diagnostics. Identify the cause before retrying. |

`doctor` checks source databases, keys, and caches. Inspect
`data.required_dbs[].source_exists` and `key_present`; top-level success alone
does not prove the source is usable. For missing account setup, inspect
`wxwork init --help` and use the intended database directory and available
keys. Existing ES history remains usable during source outages.

Do not rebuild an index to repair a connection failure. Rebuilds also require
ES to be available. Preserve the service's data volume during recovery.

## Service control

- `daemon start` enables automatic startup and starts managed indexing.
- `daemon stop` disables automatic startup and stops the managed services,
  retaining indexed data.
- `daemon run` runs indexing in the foreground against an already available
  ES service. `daemon run --once` completes one sync and exits. These modes
  do not manage ES containers.

A running service uses a copied executable. After an intended CLI upgrade,
or when recovering a stuck service, use:

```sh
wxwork daemon stop
wxwork daemon start
wxwork daemon status
```

Wait for readiness and retry the affected query. A successful start command
alone does not verify recovery.

## Sender-index upgrade

An older index can serve `query`, `get`, `search`, and `history` while
`messages senders` returns `index_upgrade_required`. Ordinary synchronization
supports the old format without upgrading sender discovery. When that upgrade is intended, run:

```sh
wxwork rebuild
wxwork messages senders -n 20
```

This rebuild uses retained ES history and preserves message references and capture
checkpoints. Queries keep using the old index until the rebuilt index is published.
Verify rebuild completion and a successful sender query. If rebuilding fails,
inspect its error and retained-index readiness before retrying. A successful
rebuild invalidates existing sender cursors; start again without `--cursor`.
`--from-source` replaces retained history and is not the sender-index upgrade.

## Rebuilds and retained history

ES retains captured messages after source records disappear, keeping the
latest observed content of each message. It is the retained history store;
source-only recovery cannot restore records that existed only in lost ES data.

| Operation | Effect |
| --- | --- |
| `wxwork rebuild` | Rebuilds search structure from retained ES history. Queries use the old index until cutover; retained messages and capture checkpoints survive. |
| `wxwork rebuild --from-source` | Replaces retained history with the current source. ES-only history is lost, the generation changes, and incremental reads establish a new baseline. Use when replacement is intended. |
| `wxwork sync --wait` after ES data loss | Imports the current source into a new generation; it cannot recover lost ES-only history. |

Monitor `rebuilding`, `rebuild_copied`, and `rebuild_total` for a retained-history
rebuild. Verify completion and the affected query before reporting recovery.
