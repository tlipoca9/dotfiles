# dotfiles repository guide

This repository manages one personal macOS development environment with
upstream chezmoi. It rebuilds capabilities, not an identical version snapshot;
maintainability and a clear declaration source take priority over continuous
state convergence.

## Ownership boundaries

- `.chezmoiroot` points at the isolated `home` source state.
- Darwin packages and VS Code extensions live in their respective TOML files
  under `home/.chezmoidata/darwin/`.
- Small ordered Darwin interpreters live under `home/.chezmoiscripts/darwin/`.
  Add a sibling platform only when it has a real implementation; do not add an
  empty universal abstraction.
- Zsh pins live only in `home/dot_zsh_plugins_pre.txt` and
  `home/dot_zsh_plugins_post.txt`.
- Pi extension pins live only in
  `home/dot_pi/private_agent/modify_settings.json`; its modifier must preserve
  runtime-owned fields.
- Vendored skill directories under `home/dot_agents/skills` are the whitelist.
- Native Git worktree delegation guidance lives only in
  `home/dot_agents/skills/git-worktree-delegation/SKILL.md`.
- `home/dot_codex/AGENTS.md` is independent global user guidance.

## Apply and check

Use upstream chezmoi directly—no bootstrap wrapper, Taskfile, or custom doctor.
Before a real-HOME apply run `chezmoi diff`; after it run `chezmoi verify`.
Repository validation uses one offline, temporary-HOME entry point:

```sh
python3 tests/check.py
```

The check uses Python's standard library and installed upstream commands. It
must not use the network, decrypt secrets, or mutate the real HOME.

## Package and script rules

- A Darwin package requires `manager = "homebrew"` and `kind` (`formula` or
  `cask`), with optional safe `name` and `check.command` fields.
- Package presence comes only from `brew list --formula` or `brew list --cask`.
  Install missing declarations only. Never auto-upgrade, remove, clean up, or
  roll back software.
- Homebrew and VS Code versions float by design. DSH `install_version` selects
  only a missing DSH's first npm installation; never inspect, upgrade, or
  downgrade an existing DSH.
- Never hardcode a Homebrew prefix. Discover `brew`, evaluate `brew shellenv`,
  and reuse the compile-time shell helper template where applicable. Every
  rendered script remains self-contained.
- A `run_onchange` script must render its declaration/checksum so edits retrigger
  it; retriggering is not continuous convergence.
- Zsh startup is offline. Build both pinned bundle halves before atomically
  publishing one generation; do not roll back or automatically prune old
  generations.
- Pi health follows command exit status, not English output fragments.

## Security and preservation

- The age identity is manually restored at `~/.config/chezmoi/age.txt` with mode
  `0600`; never manage, commit, read, or print it.
- Manage only `~/.ssh/id_ed25519` and `id_ed25519.pub`. Never add SSH config,
  known_hosts, another key, or log private material.
- Do not use exact-directory semantics for `.codex`, `.agents`, `.ssh`, `.pi`,
  or VS Code user directories. Preserve unmanaged application/runtime files and
  keep `private_agent` so `~/.pi/agent` is mode `0700`.
- Pi auth, trust, sessions, caches, and package directories remain runtime state.
- Skill and Pi pin updates are supply-chain changes reviewed as code.
- `chezmoi apply` remains non-destructive. Tests exclude encrypted content and
  scripts when applying a temporary destination.

After changes run the local entry point, Zsh syntax, `git diff --check`, and the
configured pre-commit hook before handoff. Do not stage or commit unless
explicitly requested.
