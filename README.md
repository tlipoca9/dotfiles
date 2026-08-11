# dotfiles

Personal macOS development environment managed directly by
[chezmoi](https://www.chezmoi.io/) and [Homebrew](https://brew.sh/).

The repository is public. The SSH private key is committed only as
age-encrypted ciphertext. Its age identity is restored manually on each Mac and
is never managed by chezmoi or committed to Git.

## Initialize a new Mac

Restore the backed-up age identity at chezmoi's standard configuration path:

```sh
mkdir -p "$HOME/.config/chezmoi"
cp /secure/backup/age.txt "$HOME/.config/chezmoi/age.txt"
chmod 700 "$HOME/.config/chezmoi"
chmod 600 "$HOME/.config/chezmoi/age.txt"
```

Then install chezmoi and initialize this repository over HTTPS:

```sh
sh -c "$(curl -fsLS get.chezmoi.io)" -- \
  -b "$HOME/.local/bin" init --apply --use-builtin-git=true \
  https://github.com/tlipoca9/dotfiles.git
```

chezmoi's Darwin before-script checks the Command Line Tools. If they are
absent, it starts the official installer and stops; finish that installation,
then run `"$HOME/.local/bin/chezmoi" apply` again. The same script installs a
missing Homebrew with the official installer and discovers its environment
through `brew shellenv`.

> Back up `~/.config/chezmoi/age.txt` before relying on the encrypted SSH key.
> Losing every copy makes the committed ciphertext unrecoverable. Never add the
> identity to this or any other repository.

## Daily commands

```sh
chezmoi apply    # install missing declarations and apply managed configuration
chezmoi diff     # preview managed HOME changes
chezmoi update   # pull the source repository and apply it
chezmoi doctor   # run upstream chezmoi diagnostics
chezmoi verify   # verify managed targets match their target state
```

`chezmoi apply` installs only missing Homebrew formulae/casks and declared
extensions. It does not upgrade installed software, clean Homebrew, uninstall
undeclared software, or remove unmanaged HOME files. `chezmoi update` is
chezmoi's pull-and-apply operation; it is not a Homebrew or plugin upgrade
workflow.

Package and extension interpreters use `run_onchange`, so declaration and pin
changes rerun automatically. If an exceptional manual deletion removes a
cached Zsh bundle, clear chezmoi's script state before applying again:

```sh
chezmoi state delete-bucket --bucket=scriptState
chezmoi apply
```

## Managed environment

- macOS only; no machine-specific profiles
- system Zsh with pinned Antidote plugins, fzf-tab, vi mode, Starship, and local
  shared history
- Ghostty using Maple Mono NF CN and Catppuccin Mocha
- official Visual Studio Code with minimal settings and one global theme
  extension
- ChatGPT/Codex desktop entry and Codex CLI
- Pi coding agent on OpenAI Codex/GPT models with an exact extension allowlist
- vendored user Codex skills in `~/.agents/skills`
- global Codex rules in `~/.codex/AGENTS.md`
- `~/.ssh/id_ed25519` encrypted with age in the public repository

System packages are declared in
`home/.chezmoidata/darwin/packages.toml`; VS Code extensions are declared in
`home/.chezmoidata/darwin/vscode.toml`. Future platforms add real sibling data
and scripts only when they are implemented.

Project language runtimes, macOS system preferences, Git configuration, and
application account state are intentionally outside this repository. See
[docs/pi.md](docs/pi.md) for the Pi package policy.
