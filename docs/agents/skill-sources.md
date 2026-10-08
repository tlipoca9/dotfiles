# Vendored skill sources

Shared skills are maintained in `home/dot_agents/skills` and deployed through
chezmoi. Revisions below identify the upstream snapshots used for comparison;
local adaptations are listed separately. Skills are not updated automatically.

## Sources

| Source | Revision | Upstream paths | License |
| --- | --- | --- | --- |
| [mattpocock/skills](https://github.com/mattpocock/skills) | `b0618bc436ad893b3c5e84e55fba86586d34a404` | `skills/engineering/<name>`, `skills/productivity/<name>` | [MIT](skill-licenses/mattpocock-skills.txt) |
| [mitsuhiko/agent-stuff](https://github.com/mitsuhiko/agent-stuff) | `0865c849befd2021490679f96a8dee58c84ac857` | `skills/<name>` | [Apache-2.0](skill-licenses/agent-stuff.txt) |
| [JetBrains/go-modern-guidelines](https://github.com/JetBrains/go-modern-guidelines) | `155dc7ca10da5e1f6c841503086957b1b37f5815` | `plugin/skills/use-modern-go` | [Apache-2.0](skill-licenses/go-modern-guidelines.txt) |

Matt Pocock engineering skills: `ask-matt`, `code-review`, `codebase-design`,
`diagnosing-bugs`, `domain-modeling`, `grill-with-docs`, `implement`,
`implement-spec`, `improve-codebase-architecture`, `pr`, `prototype`, `research`,
`retro`, `setup-matt-pocock-skills`, `tdd`, `to-spec`, `to-tickets`, `triage`,
`wayfinder`, `wizard`.

Matt Pocock productivity skills: `grill-me`, `grilling`, `handoff`, `teach`,
`to-questionnaire`, `wait-what`, `writing-for-agents`.

Agent Stuff skills: `commit`, `github`, `update-changelog`, `uv`.

The Modern Go skill pins its CLI independently in `scripts/VERSION`.

## Local adaptations

- `domain-modeling` adds business and product naming alignment and ongoing
  domain discovery. Preserve local additions when merging upstream changes.
- `grill-with-context` and `design-patterns` are local skills, not upstream
  copies. Their references follow the shared `GLOSSARY.md` convention.
- `resolving-merge-conflicts` is retired upstream. Its last vendored copy is in
  `deprecated_skills/resolving-merge-conflicts`, matching Matt Pocock revision
  `c55ee46073ed923f86ce59a5eb3b6d895095d1b7`. It is not deployed.

Internal Tencent Cloud skills and `iwiki-doc` have separate sources and are
outside this open-source update set.

## Updating

Fetch each upstream into a temporary directory outside this repository. Compare
the recorded revision, current upstream, and local files before copying changes.
Preserve local adaptations, uncommitted work, invocation policy, supporting
resources, and attribution. Include newly referenced skills when an updated
workflow depends on them.

Update the corresponding revision above and keep domain-document names aligned
across skills, `AGENTS.md`, `docs/agents/domain.md`, and
`home/.chezmoitemplates/agents-md`. Archive retired skills outside `home/` and
list obsolete deployed paths in `home/.chezmoiremove`.

Check skill metadata and references, and exercise changed scripts in a temporary
workspace. Preview and apply only affected chezmoi targets, then verify those
targets. Keep temporary checkouts, scripts, and reports outside the repository.
