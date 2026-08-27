# Subagent Wayfinder policy

This global Pi extension makes Wayfinder the required planning and tracking layer for substantial `subagent(...)` executions.

## Scope

The hard gate covers initial model-issued `subagent` tool executions. Management/control actions, retained top-level resume, and human slash-command or extension-RPC entry points are outside the gate.

A single `reviewer`, `oracle`, or `advisor` child may declare the `one-shot-read-only` exemption. Writers, artifact-producing scouts/researchers, multiple children or stages, worktrees, and explicitly long runs require a map plus one ticket per literal child key. Only supported pi-subagents builtins are accepted so the child policy extension and native supervisor channel are guaranteed.

Tracker selection first checks `docs/agents/issue-tracker.md`. Frontmatter declaring `tracker: tapd_mini` with a numeric `workspace_id` overrides origin detection. Without that declaration:

- `github.com` → GitHub
- `git.woa.com` → Gongfeng
- every other or missing remote → local markdown

Cross-repository work uses separate workflows and maps.

## Binding

Pass the map and tickets on the top-level subagent call:

```json
{
  "extensionBindings": {
    "tlipoca9.wayfinder/1": {
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
        }
      ]
    }
  }
}
```

Ticket order must exactly match the literal workflow child order. The gate injects a child-scoped binding into each launch, so workflow children must not declare their own `extensionBindings`.

The only exemption is:

```json
{
  "extensionBindings": {
    "tlipoca9.wayfinder/1": {
      "mode": "exempt",
      "reason": "one-shot-read-only"
    }
  }
}
```

Local `ref` values are repository-relative regular files, must resolve inside the repository, and must exist. GitHub and Gongfeng refs are HTTPS issue URLs under the current repository/project. TAPD mini bindings use the canonical machine ref `https://tapd.woa.com/tapd_fe/t/index/<workspace_id>?mini_item_id=<item_id>` and must match the declared workspace. The `mini_item_id` query parameter is the gate's item identity; the URL opens the workspace and is not claimed to be a TAPD UI deep link. Remote checks are deliberately static: the gate validates URL shape, repository/workspace ownership, distinct identities, and child-key order, but it never contacts GitHub, Gongfeng, or TAPD and does not require evidence that a remote artifact exists, is readable, or has a particular parent relationship.

## Shared pitfall log

Tracked children use the map's tracker-specific pitfall log as shared operational memory. GitHub and Gongfeng use append-only comments headed `WAYFINDER PITFALL`; TAPD mini uses entries appended under the Map description's `## Pitfall log` because its MCP comment tools do not accept mini-items. Before commands or diagnosis, each child reads every entry; after an unexpected failure it searches them by symptom and component before another attempt. New reusable obstacles record the ticket, scope, symptom, cause, resolution, verification, and resolved/unresolved status.

An execution-bearing map has one retained map-supervisor workflow for its whole active execution. Every concurrent execution agent runs beneath it, and later work resumes it rather than starting a second supervisor. Children never write the shared log directly. They send each complete candidate to the map supervisor with `contact_supervisor` reason `pitfall_report`. The map supervisor is the map's single writer: immediately before writing it re-reads the tracker-specific log and compares normalized scope + symptom + cause, then either returns the existing entry or appends exactly one new entry. Ticket resolutions and the supervisor handoff disclose new, reused, and unresolved entries, or explicitly state `Pitfalls: None`.

Local tracker refs are rejected for worktree-isolated workflows because each worktree would see a different file rather than one canonical log. Use GitHub/Gongfeng/TAPD mini tracking or run without worktree isolation.

## Clarification

Each child receives its map/ticket boundary. It first checks that context and repository evidence. A remaining material ambiguity is sent to the parent with `contact_supervisor` reason `interview_request`, exactly one question per request. The parent answers from settled decisions when possible; otherwise it uses the `grilling` skill to ask the user one question and replies through `subagent_supervisor`.

The child extension acknowledges itself as `tlipoca9.subagent-wayfinder`; absence of that acknowledgement means the run is not policy-compliant.

## Test

```sh
node --experimental-strip-types --test policy.test.mjs
```
