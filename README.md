# dotfiles

Personal macOS development environment managed directly by
[chezmoi](https://www.chezmoi.io/) and [Homebrew](https://brew.sh/).

This repository rebuilds the environment's **capabilities**, not an identical
version snapshot. Homebrew formulae/casks and VS Code extensions intentionally
follow their current upstream versions. Homebrew packages are installed only
when missing; later `chezmoi apply` runs do not upgrade, downgrade, or otherwise
converge installed tools.

The repository is public. The managed SSH private key is age-encrypted. Its age
identity is restored manually on each Mac and is never managed or committed.

## Initialize a new Mac

Restore the backed-up identity at chezmoi's standard configuration path:

```sh
mkdir -p "$HOME/.config/chezmoi"
cp /secure/backup/age.txt "$HOME/.config/chezmoi/age.txt"
chmod 700 "$HOME/.config/chezmoi"
chmod 600 "$HOME/.config/chezmoi/age.txt"
```

Then install chezmoi and initialize over HTTPS:

```sh
sh -c "$(curl -fsLS get.chezmoi.io)" -- \
  -b "$HOME/.local/bin" init --apply --use-builtin-git=true \
  https://github.com/tlipoca9/dotfiles.git
```

The Darwin package installer starts Apple's Command Line Tools installer when
needed and asks you to apply again after it finishes. It also installs a
missing Homebrew interactively, discovers its prefix, and caches only the
rendered `brew shellenv` with mode `0600`.

> Keep a separate backup of the age identity. Losing every copy makes the
> encrypted SSH key unrecoverable. Never add the identity to a repository.

## Daily use

```sh
chezmoi diff     # always preview changes before applying to the real HOME
chezmoi apply
chezmoi verify   # verify after applying
chezmoi update
chezmoi doctor   # upstream chezmoi diagnostics
```

`run_onchange` means declaration edits retrigger their installer or builder; it
is not a continuous state-convergence system. Existing Homebrew packages are
left alone. Exact Zsh and Pi pins change only when their single source
declarations are reviewed and edited.

If a manually deleted Zsh cache must be rebuilt without changing its manifests,
clear chezmoi's script state and apply again:

```sh
chezmoi state delete-bucket --bucket=scriptState
chezmoi apply
```

## Managed scope

- macOS only, without machine-specific profiles
- system Zsh with exact, reviewed Antidote plugin commits
- current Homebrew packages and current VS Code extension releases
- Pi with exact, reviewed extension pins and preserved runtime state
- shared vendored skills deployed to `~/.agents/skills`, plus explicitly
  whitelisted Codex-specific skills deployed to `~/.codex/skills`
- only `~/.ssh/id_ed25519` and `id_ed25519.pub` under SSH management

System declarations live in `home/.chezmoidata/darwin/packages.toml`; VS Code
extensions live in `home/.chezmoidata/darwin/vscode.toml`; Pi pins live only in
`home/dot_pi/private_agent/modify_settings.json.tmpl`; shared user skills live
only in `home/dot_agents/skills`. Installers and generators must update the
matching chezmoi source instead of creating duplicate runtime copies.
Codex-specific skills live only in `home/dot_codex/skills`.
Skills derived from private conversations are age-encrypted in the public
source and decrypted only when chezmoi applies them. The repository retains
only current declarations and durable lifecycle automation; completed
migrations and retired capabilities remain available through Git history.
Project runtimes, macOS preferences, Git configuration, application accounts,
and unmanaged runtime files are outside this repository.
