# Setup and recovery

Run `wxwork` from PATH as described in [SKILL.md](../SKILL.md). Resolve failures
from status and the error message before changing services or data. A
connection failure is not a reason to rebuild an index.

## Installation and updates

Install the local finofliu fork into `~/.local/bin`, which this Mac's shell
configuration includes in PATH:

```sh
cargo install --path "$HOME/code/cnb.woa.com/finofliu/wxwork-cli" \
  --root "$HOME/.local" --locked --force
command -v wxwork
wxwork daemon --help
```

Verify that command lookup resolves `~/.local/bin/wxwork` and that the indexed
commands are available; the version string alone does not distinguish builds.
If lookup selects another installation, remove that obsolete installation
and refresh the shell's command cache with `rehash` in Zsh or `hash -r` in Bash.
Use the installed command for queries. If a daemon is already running, also
follow [the restart procedure](#service-control-and-binary-upgrades) so it
loads the installed build.

## Configuration and service status

The default root is `~/.wxwork-cli`. `WXWORK_HOME` selects another root;
`WXWORK_CONFIG` or `--config` selects a config file, and `WXWORK_DB_DIR`
overrides its source database directory. `--config` alone does not relocate
keys, state, or checkpoints. Keep these settings identical across queries,
sync, and daemon control. Reuse the configured account even when its source
is temporarily offline.

Run `wxwork daemon status`. Top-level `ok: true` means the diagnostic
ran, not that the service is healthy. Inspect these fields under `data`:

| Field | Meaning and next check |
| --- | --- |
| `service.enabled` / `installed` / `running` | Login startup enabled, launchd job file present, daemon process running |
| `service.elasticsearch_available` | ES status/index check succeeded; inspect errors if false |
| `ready` | First full import completed; may be cached when ES is unavailable |
| `syncing`, `scanned`, `written` | Current sync and its progress |
| `last_successful_sync`, `last_error` | Last full sync and source/index failure |
| `service.last_error` | Managed container or daemon failure |
| `service.container`, `volume`, `launchd_label` | Actual resources for this state directory |

Readiness requires a successful ES check and `ready: true`. A missing index
alias can also make `elasticsearch_available` false; use the error message
to distinguish it from a stopped server. ES can serve queries while the
daemon is stopped. A daemon process alone does not prove that ES is usable.

## No ES or first startup

1. Check `daemon status` and the existing configuration. If source setup is
   missing, run `doctor` and inspect `data.required_dbs[].source_exists` and
   `key_present`. Its top-level `ok` only means the diagnostic ran. Reuse
   existing keys. For an unconfigured account with an available key file:

   ```sh
   wxwork init --db-dir "<account-database-directory>" --keys-json "<local-key-file>"
   ```

   When keys are unavailable, report that prerequisite and consult the fork's
   `docs/macos-key-capture-runbook.md`; `init` does not provide automatic macOS
   key extraction. Avoid printing keys or replacing a working account config.
2. Before container work, read
   `~/.agents/skills/local-machine-environments/SKILL.md` and its Podman
   instructions. Inspect `podman machine list` and
   `podman system connection list`. Managed mode expects the single existing
   `podman-machine-default` and its rootless connection. If Podman or that
   machine is absent, resolve the runtime prerequisite; `daemon start`
   cannot install Podman or create the VM. Preserve the shared machine and
   other workloads.
3. Run `wxwork daemon start` when enabling the service is within the
   request or existing authorization. First enablement registers login
   startup. The daemon starts the existing VM if needed and creates or starts
   its own ES container and persistent volume. It binds loopback and uses
   4 CPU, 8 GiB memory, and a 4 GiB JVM heap. No separate ES install or manual
   `podman run` is needed. Respect an intentional prior `daemon stop`.
4. Startup is asynchronous. Check `daemon status` at spaced intervals while
   the image downloads, ES starts, and the first full import runs. Report
   progress during long waits; inspect logs if progress stops. Do not launch
   repeated starts, syncs, or rebuilds. `sync --wait` does not start ES; use
   it once ES is reachable only when an explicit completed sync is needed.
5. Verify `ready: true` with ES available, then retry the requested query.
   Completion means that query succeeds. If a prerequisite or repeated error
   remains, report it with the next concrete repair instead of polling forever.

The managed loop checks the service and retries failures about every five
seconds. After the initial import it syncs hourly, with one catch-up sync
when overdue after login or wake. Source and query failures are handled
separately below.

## ES stopped or unavailable

For `index_unavailable`, inspect status and these diagnostics as needed:

```sh
WXWORK_ROOT="${WXWORK_HOME:-$HOME/.wxwork-cli}"
tail -n 80 "$WXWORK_ROOT/state/daemon.log"
podman --connection podman-machine-default ps -a
podman --connection podman-machine-default logs --tail 80 "<service.container>"
```

Use the resource names returned by status, not guessed names or another
account's container. The daemon also caches its report in
`$WXWORK_ROOT/state/service-status.json`.

| Observation | Action |
| --- | --- |
| Enabled daemon is running; owned container is stopped or missing | Let its recovery loop start/recreate the container using the retained volume, then retry the query once ES is available. Inspect the service error if recovery fails. |
| Daemon is not running and service startup/recovery is authorized | Run `daemon start`, inspect status/logs, and verify the query. If an installed job remains stuck, use the stop/start sequence below. |
| Podman connection or VM is unavailable | Follow the local environment skill's connection checks. Correct the endpoint or start the expected machine; a shared VM restart affects other workloads. |
| Port is occupied or a container/volume belongs to another service | Identify the owner and correct this project's configuration. Do not take over the other service or delete its data. |
| Owned container configuration mismatch | Inspect ownership and mounts. Stop this service, remove only the named container without removing its volume, then start again. Use the exact retained volume reported in the diagnostic. |
| ES is running but returns resource/disk errors | Inspect container logs and Podman capacity. Apply the local environment skill's applicable recovery; keep the ES data volume. |

Do not delete ES volumes, reset the shared VM, switch accounts, or fall back
to the legacy CLI to make an ES error disappear. There is no automatic
direct-database fallback for the six macOS read commands.

## Index and source failures

| Error or state | Action |
| --- | --- |
| `index_not_ready` | First import is incomplete. Inspect progress and errors; let the daemon finish or run one `sync --wait` against available ES. Queries return promptly instead of waiting for the build. |
| `index_missing` | Verify endpoint, account, and prefix first. If this is the correct ES and its data was lost, the daemon or `sync --wait` can import current source data. ES-only history is unrecoverable. |
| `ready: true` with a source/key/snapshot error | Keep querying retained history with its last successful sync time. Use `doctor` for source/key diagnostics, fix the reported cause, then `sync --wait`. Stale legacy caches do not invalidate ES. |
| `account_mismatch` | Compare configured source account, `WXWORK_HOME`, and ES prefix. Restore the intended settings; do not wipe or adopt another account's index. |
| `index_changed` | Retry the read once against the new generation. |
| `capture_pending` | A capture batch needs completion/recovery. Let the daemon recover or run `sync --wait`, then retry `new-messages`. |
| `checkpoint_busy` | Another `new-messages` delivery owns the checkpoint. Let it finish, then retry; do not reset the checkpoint. |
| `daemon_not_running` from `sync` | Start the service if intended, or use `sync --wait` against already available ES. |
| `daemon_running` | Reuse the running daemon; do not start a second foreground instance. |
| `indexed_freshness_unsupported` | Remove `--refresh` / `--freshness`; use `sync --wait` first if fresh data is required. |
| `capture_since_unsupported` | Use `history --since` for a send-time window. |
| `runtime_error`, `index_error`, or another code | Read `error.message` and status/logs. Fix its concrete cause before retrying; do not treat every failure as missing ES. |

## Service control and binary upgrades

`daemon stop` disables login startup, waits for the job to exit, and stops
only this project's container. It retains the data volume. `daemon start`
enables startup and resumes the service.

The launchd job runs a copied binary under the state directory. Rebuilding
the CLI does not update the running process. For an intended upgrade or a
stuck job, use the same config/root and installed command:

```sh
wxwork daemon stop
wxwork daemon start
wxwork daemon status
```

Wait for readiness and verify the affected query. Do not edit the generated
launchd job or stop unrelated containers as a routine repair.

For an independently managed local ES, use `daemon run` in the foreground;
`daemon run --once` performs one sync and exits. Both require ES to be
available and do not manage containers. `daemon start` always uses this
project's managed container. The default endpoint is `http://127.0.0.1:9200`,
prefix `wxwork`, and query timeout 2000 ms; overrides live in the config's
`elasticsearch` object (`url`, `index_prefix`, `timeout_ms`).

## Rebuild and retained history

ES is the sole retained history store. Source records disappearing does
not delete indexed messages; updates replace the last observed content.
There is no separate archive or backup.

| Operation | When to use it and what survives |
| --- | --- |
| `rebuild` | Rebuild search structure/analyzers from existing ES history. Old data remains readable until cutover; retained messages and capture checkpoints survive. Monitor `rebuilding`, `rebuild_copied`, and `rebuild_total`. |
| `rebuild --from-source` | Deliberately replace the index with current source data. ES-only history is lost, the generation changes, and `new-messages` establishes a new baseline. Use only when that replacement is intended. |
| Daemon sync or `sync --wait` after actual ES data loss | Import what the current source still contains. A fresh generation cannot recover history that existed only in the lost ES volume. |

Rebuilds need a working ES endpoint. For connectivity problems, restore the
service first. For implementation details or behavior absent from help,
consult `docs/indexed-search.md`, `src/cli/indexed.rs`, and `src/indexed/` in
`~/code/cnb.woa.com/finofliu/wxwork-cli`; keep recovery scoped to the configured
account.
