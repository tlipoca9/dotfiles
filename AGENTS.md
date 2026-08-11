# dotfiles repository guide

This repository manages one personal macOS development environment with
upstream chezmoi.

## Ownership boundaries

- `.chezmoiroot` contains `home`, the isolated chezmoi source state.
- `home/.chezmoidata/darwin/packages.toml` is the system software allowlist.
- `home/.chezmoidata/darwin/vscode.toml` is the VS Code extension allowlist.
- `home/.chezmoiscripts/darwin/` contains small, ordered interpreters for the
  Darwin declarations. Add real sibling platform data and scripts only when a
  platform is implemented; do not create empty adapters or a universal layer.
- Zsh plugin pins remain in `home/dot_zsh_plugins_pre.txt` and
  `home/dot_zsh_plugins_post.txt`.
- Pi extension pins remain in
  `home/dot_pi/private_agent/modify_settings.json`.
- The directories under `home/dot_agents/skills` are the Codex skill whitelist.
- `home/dot_codex/AGENTS.md` is global user guidance and is independent of this
  repository guide.

## Commands

```sh
chezmoi apply
chezmoi diff
chezmoi update
chezmoi doctor
chezmoi verify
```

Use upstream chezmoi directly. There is no bootstrap wrapper, Taskfile API, or
custom doctor. Before applying to the real home directory, use `chezmoi diff`.
Repository checks must render or apply only to temporary destinations.

## Package and script rules

- Each Darwin package table has required `manager = "homebrew"` and `kind`
  (`formula` or `cask`), optional `name`, and optional post-install
  `check.command`. Presence means enabled.
- Package state comes only from `brew list --formula` or `brew list --cask`.
  Command presence is not package state.
- Scripts install missing declarations only. Never add automatic upgrade,
  cleanup, removal, rollback, or arbitrary installer/post-install shell to the
  package data.
- Never hardcode `/opt/homebrew` or `/usr/local`; discover Homebrew and use
  `brew shellenv` or `brew --prefix` in every process that consumes it.
- `run_onchange` rendered output must contain its declarations or source
  checksums so changes retrigger it.
- Shell startup is offline. Zsh plugin changes are explicit and pinned.
- Prefer upstream commands and chezmoi primitives. If Python is necessary, use
  the standard library only; do not recreate a large validation framework.

## Security and preservation

- The age identity is manually restored to `~/.config/chezmoi/age.txt` with
  mode `0600`; never manage, commit, or print it.
- Manage only `~/.ssh/id_ed25519` and `id_ed25519.pub`. Never add another key,
  age identity, SSH config, or known_hosts, and never log private material.
- Do not use exact-directory semantics for `.codex`, `.agents`, `.ssh`, `.pi`,
  or VS Code user directories. Unmanaged runtime and application files must
  survive. Keep `private_agent` so `~/.pi/agent` remains mode `0700`.
- Pi auth, trust decisions, sessions, caches, and package installation
  directories are runtime state and must not be managed.
- Vendored Codex skill and exact Pi package updates are supply-chain changes
  and must be reviewed as code.
- CI must not require an age identity, decrypt the SSH private key, apply the
  full environment, or mutate the runner's real HOME.
- `chezmoi apply` must remain idempotent and non-destructive.

After changes, validate TOML/JSON, rendered templates, shell syntax, temporary
chezmoi apply/verify behavior, source naming and permissions, secret absence,
and the Git diff. Run the configured pre-commit hook before handoff. Do not
stage or commit unless explicitly requested.
