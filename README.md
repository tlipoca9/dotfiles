# dotfiles

Personal macOS development environment managed by [Task](https://taskfile.dev/),
[Homebrew](https://brew.sh/), and [chezmoi](https://www.chezmoi.io/).

The repository is public. The SSH private key is committed only as age-encrypted
ciphertext; its age identity is local to each clone and ignored by Git.

## Bootstrap a new Mac

Install the Command Line Tools if Git is not available:

```sh
xcode-select --install
```

Clone this repository over HTTPS into any directory:

```sh
git clone https://github.com/tlipoca9/dotfiles.git
cd dotfiles
```

Restore the backed-up age identity inside this clone:

```sh
mkdir -p .local/age
cp /secure/backup/identity.txt .local/age/identity.txt
chmod 700 .local .local/age
chmod 600 .local/age/identity.txt
```

Then run:

```sh
./bootstrap.sh
```

The script installs the minimal bootstrap dependencies and delegates to
`task bootstrap`. After the managed SSH key is verified, the repository remote
is changed from HTTPS to SSH.

> Back up `.local/age/identity.txt` before relying on the encrypted SSH key.
> Losing every copy of the age identity makes the committed ciphertext
> unrecoverable. Never add the identity to Git.

## Daily commands

```sh
task apply      # install missing software and apply managed configuration
task diff       # preview chezmoi changes
task update     # explicitly update Homebrew formulae and Zsh plugins
task doctor     # diagnose the declared local environment
task check      # run repository checks and smoke tests
```

`task apply` does not upgrade installed software, run Homebrew cleanup, uninstall
software absent from the Brewfile, or remove unmanaged files from the home
directory.

## Managed environment

- macOS only; no machine-specific profiles
- system Zsh with Antidote, fzf-tab, vi mode, Starship, and local shared history
- Ghostty using Maple Mono NF CN and Catppuccin Mocha
- official Visual Studio Code with minimal settings and one global theme extension
- ChatGPT/Codex desktop entry and Codex CLI
- user Codex skills in `~/.agents/skills`
- global Codex rules in `~/.codex/AGENTS.md`
- `~/.ssh/id_ed25519` encrypted with age in the public repository

Project language runtimes, macOS system preferences, Git configuration, and
application account state are intentionally outside this repository.

See [plan.md](plan.md) for the complete design, evidence, and migration record.
