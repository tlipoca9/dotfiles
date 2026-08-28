# OMP Task Wayfinder policy

This global Oh My Pi extension gates the native `task` tool behind Wayfinder planning and tracking. It is an OMP-native sibling of the existing Pi `subagent-wayfinder`; the Pi implementation remains independent and unchanged.

## Contract

The extension shadows OMP's built-in `task` tool, adds a required `wayfinder` field, validates it, injects one scoped map/ticket contract into each child assignment, removes the extension-only field, and delegates to the native task implementation through `ctx.invokeTool()`.

Every child needs an explicit, unique `name`. A tracked batch looks like:

```json
{
  "context": "Shared execution context",
  "tasks": [
    {
      "name": "implementation",
      "agent": "task",
      "task": "Implement the migration."
    },
    {
      "name": "review",
      "agent": "reviewer",
      "task": "Review the implementation."
    }
  ],
  "wayfinder": {
    "mode": "tracked",
    "tracker": "github",
    "map": {
      "name": "Plan the migration",
      "ref": "https://github.com/acme/widgets/issues/100"
    },
    "tickets": [
      {
        "key": "implementation",
        "name": "Implement the migration",
        "ref": "https://github.com/acme/widgets/issues/101"
      },
      {
        "key": "review",
        "name": "Review the migration",
        "ref": "https://github.com/acme/widgets/issues/102"
      }
    ]
  }
}
```

Ticket order and keys must exactly match task item names.

## Read-only exemption

The only exemption is one non-isolated `wayfinder-reviewer` task:

```json
{
  "name": "review",
  "agent": "wayfinder-reviewer",
  "task": "Review the current diff.",
  "wayfinder": {
    "mode": "exempt",
    "reason": "one-shot-read-only"
  }
}
```

The managed `wayfinder-reviewer` excludes shell, write/edit, and LSP tools. OMP's bundled `reviewer` includes `bash`, so it is deliberately not eligible for this exemption.

## Tracker selection

`docs/agents/issue-tracker.md` frontmatter may select `tapd_mini` with a numeric `workspace_id`. Otherwise the extension derives the tracker from `origin`:

- `github.com` -> GitHub Issues
- `git.woa.com` -> Gongfeng issues
- any other or missing remote -> repository-local Markdown

Remote references are validated statically for URL shape and repository/workspace ownership; the extension does not contact the tracker or prove that an issue exists. Local references must be existing regular files inside the repository. Local tracking cannot be combined with `isolated` tasks because isolated workspaces would not share one canonical pitfall log.

## Supervisor protocol

Each tracked child receives only the shared map and its own ticket. It reads the tracker-specific pitfall log before work and reports through OMP `hub`:

- `[wayfinder:interview_request]` for exactly one unresolved material question
- `[wayfinder:pitfall_report]` only for a non-obvious operational obstacle from build, deploy, tooling, permissions, environment, or shared infrastructure that can recur in another independent ticket and be reused without knowing the current ticket's decision history

Normal ticket iteration—hypotheses, rejected options, clarification, feedback, prototype changes, changing understanding, routine trial and error, typos, and transient failures from code under change—is not a pitfall. The parent remains the single pitfall-log writer, rejects out-of-scope candidates, and acknowledges qualifying reports before accepting completion.

## Failure behavior

The wrapper fails closed when validation fails or OMP does not expose the native same-tool delegation seam. The extension never reimplements task execution.

## Test

```sh
node --experimental-strip-types --test policy.test.mjs
```
