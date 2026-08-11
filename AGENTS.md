# dotfiles repository guide

This repository manages one personal macOS development environment.

## Ownership boundaries

- `bootstrap.sh` only breaks the bootstrap dependency loop.
- `Taskfile.yml` is the only public workflow entry after bootstrap.
- `platform/darwin/Brewfile` is the only software allowlist for the implemented Darwin adapter.
- `home/` is the chezmoi source state selected by `.chezmoiroot`.
- `tasks/` contains platform-neutral capability Taskfile modules.
- `platform/darwin/` owns Homebrew and Darwin-specific validation; no unimplemented platform directories are kept.
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

- Target macOS only. Keep Darwin-specific implementation in `platform/darwin/`; do not add speculative Windows/Linux adapters or machine-specific profiles.
- Prefer Homebrew formulae/casks, official CLIs, and chezmoi primitives over
  custom installers or wrappers.
- Python scripts must use the standard library only.
- Do not hardcode `/opt/homebrew` or `/usr/local`; use `brew shellenv` or
  `brew --prefix`.
- Shell startup must be offline. Zsh plugin updates are explicit and pinned.
- Codex skills under `home/dot_agents/skills` are vendored source. Keep the
  approved whitelist exact and review third-party updates as code changes.
- Pi packages in `home/dot_pi/private_agent/modify_settings.json` are an exact-version
  allowlist. Keep Pi on OpenAI Codex/GPT models and review package bumps as code
  changes; never manage Pi auth, trust decisions, sessions, caches, or package
  installation directories with chezmoi.
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
- New platforms extend the platform adapter boundary; they must not duplicate `home/` or the root public Task API.
- Before delivery, search for removed platform/tool names across code, docs,
  tests, workflows, and examples. References inside byte-identical vendored
  skills are intentional; other retained references require a stated reason
  and validation method.
- Never print private key or age identity contents in logs or diagnostics.
