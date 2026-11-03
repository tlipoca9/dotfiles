---
name: dotfiles-skills
description: Maintain this Mac's chezmoi-managed dotfiles. Read before changing any agent configuration (AGENTS.md, skills under ~/.agents/skills, MCP servers, Codex, Cursor, or Pi settings and extensions) or any other file chezmoi manages. Covers where each source lives, the edit, preview, apply, and verify loop, encrypted content, and committing.
---

# Dotfiles

Home-directory configuration is deployed by chezmoi from a local checkout of
the public GitHub repository `tlipoca9/dotfiles`. Its `.chezmoiroot` makes
`home/` the source state; repository-only files such as `README.md` and
`tests/` sit beside it.

The repository is the source of truth. A deployed file edited in place is
overwritten by the next `chezmoi apply`.

## Locating the repository

Use the first location that applies:

1. A path the user names.
2. The checkout under `~/code`, currently
   `~/code/github.com/tlipoca9/dotfiles`.
3. `~/.local/share/chezmoi`, chezmoi's default source directory.

`chezmoi source-path` reports the source state chezmoi is configured to use.
When it does not point into the chosen repository, pass
`--source <repository>` to every chezmoi command instead of editing the other
checkout.

## Rules

- Change the source, never the deployed target. Locate it with
  `chezmoi source-path <target>`. If the target is not managed, it is outside
  the dotfiles; ask before bringing it under management.
- When a target has already changed in place (by a tool, an installer, or an
  earlier edit), port that change into the source before applying.
  `chezmoi diff <target>` shows what an apply would discard. Never `--force` a
  target whose diff you have not inspected.
- Scope `chezmoi diff`, `apply`, and `verify` to the targets you changed.
  Report unrelated drift instead of applying it.
- Private content is age-encrypted as `encrypted_*.age`. Add it with
  `chezmoi add --encrypt` and edit it with `chezmoi edit <target>`. Never write
  its plaintext into the repository.

## Where agent configuration lives

| Target | Source under `home/` |
| --- | --- |
| `~/.agents/AGENTS.md`, `~/.codex/AGENTS.md`, `~/.pi/agent/AGENTS.md` | `.chezmoitemplates/agents-md`, included by the one-line wrappers `dot_agents/AGENTS.md.tmpl`, `dot_codex/AGENTS.md.tmpl`, and `dot_pi/private_agent/AGENTS.md.tmpl` |
| `~/.agents/skills/`, shared by Cursor, Codex, and Pi | `dot_agents/skills/` |
| MCP servers for Cursor, Codex, and Pi | `.chezmoidata/mcp.toml`, merged into each client by `dot_cursor/modify_private_mcp.json.tmpl`, `dot_codex/modify_private_config.toml.tmpl`, and `dot_pi/private_agent/modify_private_mcp.json.tmpl` |
| MCP credentials | `dot_config/encrypted_private_taihu.txt.age`, `dot_config/private_firecrawl/encrypted_private_api-key.age` |
| Pi settings, extensions, and themes | `dot_pi/private_agent/`; extension pins live in `modify_settings.json.tmpl` and are installed by `.chezmoiscripts/darwin/run_onchange_after_40-install-pi-extensions.sh.tmpl` |
| Agent CLIs and other packages | `.chezmoidata/darwin/packages.toml` |

`modify_` templates merge their entries into the live file and preserve
entries they do not own. Edit the template, not the merged output.

Cursor has no global AGENTS.md loader. A Cursor User Rule, stored in the
Cursor account rather than in the dotfiles, tells its agent to read
`~/.agents/AGENTS.md`. Keep that path stable.

## Workflow

1. Run `chezmoi source-path <target>` and edit the source.
2. Run `chezmoi diff <targets>` and confirm it shows only the intended change.
3. Run `chezmoi apply <targets>`, then `chezmoi verify <targets>`.
4. Commit in the repository with the git-skills commit sub-skill, staging only
   the changed paths. Push only when asked.

## Skills

- Add a skill by writing it under `dot_agents/skills/<name>/`, or create it at
  `~/.agents/skills/<name>/` and `chezmoi add` the directory, with `--encrypt`
  for private content. Leave caches such as `__pycache__` out of the source.
- Router skills ship a `scripts/update.py` that rewrites its own skill
  directory. Run it in the deployed `~/.agents/skills/<router>/`, then mirror
  the result back: delete `dot_agents/skills/<router>/` and
  `chezmoi add ~/.agents/skills/<router>`, so files removed upstream leave the
  source too.
- Remove a skill by deleting both its source directory and its deployed
  directory. Chezmoi does not delete a target whose source has disappeared.
