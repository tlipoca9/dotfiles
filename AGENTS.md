# dotfiles repository guide

This repository manages one personal macOS development environment. The design
and decision record is in `plan.md`; keep implementation and documentation
consistent with it.

## Ownership boundaries

- `bootstrap.sh` only breaks the bootstrap dependency loop.
- `Taskfile.yml` is the only public workflow entry after bootstrap.
- `Brewfile` is the only software allowlist.
- `home/` is the chezmoi source state selected by `.chezmoiroot`.
- `tasks/` contains internal Taskfile modules.
- `scripts/` contains Python 3 standard-library-only validation or orchestration
  that cannot be expressed directly by an upstream command.
- `.local/` contains per-clone secrets and generated state and must remain
  ignored by Git.

## Commands

```sh
task apply
task diff
task update
task doctor
task check
```

Run `task check` after every change. Run `task doctor` and `task diff` before
applying changes to the real home directory.

## Conventions

- Target macOS only. Do not add speculative Windows/Linux branches or
  machine-specific profiles.
- Prefer Homebrew formulae/casks, official CLIs, and chezmoi primitives over
  custom installers or wrappers.
- Python scripts must use the standard library only.
- Do not hardcode `/opt/homebrew` or `/usr/local`; use `brew shellenv` or
  `brew --prefix`.
- Shell startup must be offline. Zsh plugin updates are explicit and pinned.
- Codex skills under `home/dot_agents/skills` are vendored source. Keep the
  approved whitelist exact and review third-party updates as code changes.
- `home/dot_codex/AGENTS.md` is the global user guidance. The root `AGENTS.md`
  is repository-specific; never template one from the other.
- Manage only `id_ed25519` and `id_ed25519.pub` under SSH. Never add an age
  identity, another private key, SSH config, or known_hosts.
- Do not use exact-directory semantics for `.codex`, `.agents`, `.ssh`, or VS
  Code user directories; unmanaged runtime/application files must survive.
- `task apply` must remain idempotent and non-destructive. Do not add
  `brew bundle cleanup`, legacy cleanup, or automatic rollback.

## Verification and consistency

- Tests must protect observable behavior and stable contracts, not helper names
  or temporary migration shapes.
- CI must not need an age identity, decrypt SSH, or apply the full environment.
- Before delivery, search for removed platform/tool names across code, docs,
  tests, workflows, and examples. References inside `plan.md` and byte-identical
  vendored skills are intentional; other retained references require a stated
  reason and validation method.
- Never print private key or age identity contents in logs or diagnostics.
