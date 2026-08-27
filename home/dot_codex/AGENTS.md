When producing substantive documents or discussions, use `$write-coherent-content` at `/Users/tlipoca9/.agents/skills/write-coherent-content/SKILL.md`.

Every user-level skill has one declaration source and one runtime target:

- Manage shared skills under `home/dot_agents/skills` and deploy them to
  `~/.agents/skills`.
- Manage explicitly Codex-specific skills under `home/dot_codex/skills` and
  deploy them to `~/.codex/skills`; currently this whitelist contains
  `hatch-pet`.
- Never keep the same skill in both trees.
- When installing, generating, or updating a skill, change the chezmoi source
  and apply it instead of maintaining duplicate runtime copies.
- Keep skills derived from private conversations age-encrypted in this public
  repository; never replace their encrypted source files with plaintext.
