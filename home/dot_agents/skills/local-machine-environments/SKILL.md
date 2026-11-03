---
name: local-machine-environments
description: Router over this Mac's local runtime environments. Use before creating or selecting a local container runtime, for local container builds, runs, Compose, Docker-compatible SDKs, or Testcontainers, and when diagnosing local Podman connection or disk-space failures. Excludes remote container hosts and cloud deployments.
---

# Local machine environments

Each **sub-skill** describes one runtime on this machine and lives in `references/<name>/` with its entry point at `references/<name>/INSTRUCTIONS.md`. All are hand-written (listed under `local` in `sources.json`), so they hold this machine's actual setup rather than generic advice.

## Running a sub-skill

1. Pick every sub-skill below whose trigger matches the task.
2. Read its `INSTRUCTIONS.md` in full and follow it. Links and paths inside resolve from that file's folder; `<skill-dir>` means this router's folder.
3. Done when the sub-skill's own completion criterion is met.

| Sub-skill | Reach for it when |
|---|---|
| [`podman`](references/podman/INSTRUCTIONS.md) | Any local container work: builds, runs, Compose, Docker-compatible SDKs, Testcontainers, or Podman connection and disk-space failures |

## Updating

When the machine's setup changes, edit the affected `INSTRUCTIONS.md` directly. To add a runtime, write `references/<name>/INSTRUCTIONS.md`, list `<name>` under `local` in `sources.json`, add its row above, then run `uv run scripts/update.py --lint` from this skill's folder until it exits 0.
