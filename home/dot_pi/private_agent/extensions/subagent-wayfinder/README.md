# Subagent Wayfinder policy

This global Pi extension makes Wayfinder the required planning and tracking layer for substantial `subagent(...)` executions.

## Scope

The hard gate covers initial model-issued `subagent` tool executions. Management/control actions, retained top-level resume, and human slash-command or extension-RPC entry points are outside the gate.

A single `reviewer`, `oracle`, or `advisor` child may declare the `one-shot-read-only` exemption. Writers, artifact-producing scouts/researchers, multiple children or stages, worktrees, and explicitly long runs require a map plus one ticket per literal child key. Only supported pi-subagents builtins are accepted so the child policy extension and native supervisor channel are guaranteed.

Tracker selection follows the workflow repository's `origin`:

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

Local `ref` values are repository-relative regular files, must resolve inside the repository, and must exist. GitHub and Gongfeng refs are HTTPS issue URLs under the current repository/project. Before launch, the extension reads every GitHub ref with `gh issue view`; Gongfeng refs must survive a non-redirecting successful `curl` read of the exact issue URL. Missing, inaccessible, or authentication-redirected maps/tickets block the workflow.

## Shared pitfall log

Tracked children use append-only comments on the map as shared operational memory. Before commands or diagnosis, each child reads every comment headed `WAYFINDER PITFALL`; after an unexpected failure it searches the same entries by symptom and component before another attempt. New reusable obstacles record the ticket, scope, symptom, cause, resolution, verification, and resolved/unresolved status.

An execution-bearing map has one retained map-supervisor workflow for its whole active execution. Every concurrent execution agent runs beneath it, and later work resumes it rather than starting a second supervisor. Children never write the shared log directly. They send each complete candidate to the map supervisor with `contact_supervisor` reason `pitfall_report`. The map supervisor is the map's single writer: immediately before writing it re-reads the latest comments and compares normalized scope + symptom + cause, then either returns the existing entry or appends exactly one new comment. Ticket resolutions and the supervisor handoff disclose new, reused, and unresolved entries, or explicitly state `Pitfalls: None`.

Local tracker refs are rejected for worktree-isolated workflows because each worktree would see a different file rather than one canonical log. Use GitHub/Gongfeng tracking or run without worktree isolation.

## Clarification

Each child receives its map/ticket boundary. It first checks that context and repository evidence. A remaining material ambiguity is sent to the parent with `contact_supervisor` reason `interview_request`, exactly one question per request. The parent answers from settled decisions when possible; otherwise it uses the `grilling` skill to ask the user one question and replies through `subagent_supervisor`.

The child extension acknowledges itself as `tlipoca9.subagent-wayfinder`; absence of that acknowledgement means the run is not policy-compliant.

## Test

```sh
node --experimental-strip-types --test policy.test.mjs
```
