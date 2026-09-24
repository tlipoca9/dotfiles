---
name: librarian
description: "Cache and refresh remote git repositories for read-only reference. When a referenced repository needs edits, use an existing checkout in the task working directory or clone it there instead of modifying the cache or working under /tmp."
---

Use this skill when the user points you to a remote git repository (GitHub/GitLab/Bitbucket URLs, `git@...`, or `owner/repo` shorthand).

The goal is to keep a reusable read-only checkout that is:
- **stable** (predictable path)
- **up to date** (periodic fetch + fast-forward when safe)
- **efficient** (partial clone with `--filter=blob:none`, no repeated full clones)

The shared cache is reference material, not a task workspace.

## Cache location

Repositories are stored at:

`~/.cache/checkouts/<host>/<org>/<repo>`

Example:

`github.com/mitsuhiko/minijinja` → `~/.cache/checkouts/github.com/mitsuhiko/minijinja`

## Command

```bash
bash checkout.sh <repo> --path-only
```

Examples:

```bash
bash checkout.sh mitsuhiko/minijinja --path-only
bash checkout.sh github.com/mitsuhiko/minijinja --path-only
bash checkout.sh https://github.com/mitsuhiko/minijinja --path-only
```

The script will:
1. Parse the repo reference into host/org/repo.
2. Clone if missing.
3. Reuse existing checkout if present.
4. Fetch from `origin` when stale (default interval: 300s).
5. Attempt a fast-forward merge if the checkout is clean and has an upstream.

## Update strategy

- Default behavior is **throttled refresh** (every 5 minutes) to avoid unnecessary network calls.
- Force immediate refresh with:

```bash
bash checkout.sh <repo> --force-update --path-only
```

## Read-only workflow

1. Resolve repository path via `checkout.sh --path-only`.
2. Use that path for searching, reading, and analysis.
3. On later references to the same repo, call `checkout.sh` again; it will find and update the cached checkout.

## Editable workflow

Decide where edits will happen before changing directory into the cache. Treat the task's
initial working directory as the task workspace.

1. If the task workspace is already a checkout of the target repository, modify it directly.
2. Otherwise clone the repository into `<task-workspace>/<repo>` and make all changes there.
3. If that destination already exists, verify that it is the intended repository and preserve
   any existing changes before using it.
4. If a read-only investigation becomes an implementation task, stop using the cached path and
   switch to an editable clone in the task workspace before the first modification.

Never edit the shared cache. Never create an editable checkout under `/tmp` or another temporary
directory. Do not copy the cached checkout or attach a task-specific worktree to it as a substitute
for a clone in the task workspace.

## Notes

- `owner/repo` defaults to `github.com`.
