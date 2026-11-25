# dotfiles

Personal macOS development environment and shared macOS and Linux dotfiles
managed by chezmoi. macOS packages are managed by Homebrew.

This repository rebuilds the environment's **capabilities**, not an identical
version snapshot. Homebrew formulae/casks and VS Code extensions intentionally
follow their current upstream versions. Homebrew packages are installed only
when missing; later `chezmoi apply` runs do not upgrade, downgrade, or otherwise
converge installed tools.

The repository is public. The managed SSH private key is age-encrypted. Its age
identity is restored manually on each machine and is never managed or committed.

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

## Initialize Linux

Install chezmoi if needed and make sure `$HOME/.local/bin` is on your `PATH`.
Run these commands as the user who runs Codex.

```sh
sh -c "$(curl -fsLS get.chezmoi.io)" -- -b "$HOME/.local/bin"
```

If chezmoi is already configured, check `chezmoi source-path` before running
`init`. If it points to another repository, use a separate `--config` file
for this checkout and pass that option to each command.

Restore the age identity at `$HOME/.config/chezmoi/age.txt` with mode `0600`.
Chezmoi uses it for the SSH private key, private skills, and MCP credentials.
Install Python 3 for the Codex config modifier and Node.js with `npx` for
the Firecrawl launcher.

From the root of your existing checkout, initialize and preview the targets.
chezmoi records this checkout's path in its configuration.

```sh
chezmoi --source "$PWD" init
chezmoi managed
chezmoi diff
```

Linux manages `~/.agents/AGENTS.md`, `~/.codex/AGENTS.md` (the global
instructions for the default Codex home), `~/.gemini/config/rules/AGENTS.md`
(global instructions for Antigravity), all shared skills under
`~/.agents/skills` (referenced by Antigravity via
`~/.gemini/config/skills.json`), and the Ed25519 key pair under `~/.ssh`. It
also merges the shared MCP servers into Codex and Antigravity
(`~/.gemini/config/mcp_config.json`) settings and deploys their credentials and
Firecrawl launcher. The merge preserves unrelated settings and MCP servers. Use
`codex mcp list` or `agy mcp list` to check the registered servers.

If the preview shows existing files you want to keep, pass only the
conflict-free target paths to both `apply` and `verify`. Check for
`~/.codex/AGENTS.override.md` as well. Codex gives that file priority over
`~/.codex/AGENTS.md`.

```sh
chezmoi apply
chezmoi verify
```

Start a new Codex session to load the global instructions and discover the
skills. Individual workflows may need tools such as `uv` for Python, Go for
the Go guidelines wrapper, Python 3 for frontend helpers, and `gh` for
GitHub operations. Install them as needed for the workflows you use.

To update, run these commands from the checkout root and review the preview
before applying. Use the same target selection if any conflicts remain.

```sh
git pull --ff-only
chezmoi init
chezmoi diff
chezmoi apply
chezmoi verify
```

## Daily use on macOS

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

## macOS managed scope

- system Zsh with exact, reviewed Antidote plugin commits
- current Homebrew packages and current VS Code extension releases
- Pi with exact, reviewed extension pins and preserved runtime state
- Firecrawl, Peekaboo (macOS only), iWiki, TAPD, Gongfeng, and Zhiyan Log MCP
  servers shared by Antigravity, Cursor, Codex, and Pi
- shared vendored skills deployed to `~/.agents/skills` (referenced by
  Antigravity via `~/.gemini/config/skills.json`)
- one shared agent instruction file deployed to Antigravity
  (`~/.gemini/config/rules/AGENTS.md`), Codex, Pi, and `~/.agents/AGENTS.md`;
  Cursor has no global AGENTS.md loader, so a Cursor User Rule directs its agent
  to read `~/.agents/AGENTS.md`
- only `~/.ssh/id_ed25519` and `id_ed25519.pub` under SSH management

System declarations live in `home/.chezmoidata/darwin/packages.toml`; VS Code
extensions live in `home/.chezmoidata/darwin/vscode.toml`; Pi pins live only in
`home/dot_pi/private_agent/modify_settings.json.tmpl`; shared user skills live
only in `home/dot_agents/skills`. Installers and generators must update the
matching chezmoi source instead of creating duplicate runtime copies.
Vendored router skills record their upstream sources, pinned revisions, and
licenses inside their own skill directories.
Shared agent instructions live only in `home/.chezmoitemplates/agents-md`.
Shared MCP endpoints live in `home/.chezmoidata/mcp.toml`. Each client's MCP
modifier preserves unrelated servers. The Firecrawl launcher reads its
age-managed API key from
`~/.config/firecrawl/api-key`. iWiki, TAPD, Gongfeng, and Zhiyan Log share
the bearer token in `~/.config/taihu.txt`, which is age-managed with mode
`0600`. Antigravity, Cursor, and Codex receive the token in their private MCP
configurations; Pi reads it from the file when connecting. The file contains
only the raw token, without a `Bearer ` prefix.
Shared skills use plain source or age-encrypted source for private content.
Chezmoi decrypts private skills when deploying them to `~/.agents/skills`.
Removed skills are deleted from the source and their deployed paths are listed
in `home/.chezmoiremove`.
The repository retains
current declarations and durable lifecycle automation; completed migrations
remain available through Git history.
Project runtimes, macOS preferences, Git configuration, application accounts,
and unmanaged runtime files are outside this repository.
