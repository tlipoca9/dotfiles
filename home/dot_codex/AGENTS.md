When producing substantive documents or discussions, use `$write-coherent-content` at `/Users/tlipoca9/.agents/skills/write-coherent-content/SKILL.md`.

User-level skills have one declaration source and one runtime target:

- Manage them in this dotfiles repository under `home/dot_agents/skills`.
- Deploy them with chezmoi to `~/.agents/skills`.
- Do not persist user-created or downloaded skills under `~/.codex/skills`;
  that tree is reserved for Codex-owned system and runtime state.
- When installing, generating, or updating a skill, change the chezmoi source
  and apply it instead of maintaining duplicate runtime copies.
- Keep skills derived from private conversations age-encrypted in this public
  repository; never replace their encrypted source files with plaintext.
