---
name: tlipoca9-code-review-gate
description: >-
  Require every code change to pass a final review using $evidence-driven-review before Codex
  claims completion or hands the change off. Use whenever a task creates, modifies, deletes,
  or renames source code, tests, executable scripts, migrations, build or CI definitions, or
  runtime configuration in any repository, regardless of change size. Also use when continuing
  a task that already contains unreviewed code changes. Do not use for read-only diagnosis or
  review, or for documentation-only edits that cannot affect executable behavior.
---

# tlipoca9 Code Review Gate

Treat `$evidence-driven-review` as a required final quality gate for code changes. Implement and
verify the requested change normally, then review the final diff against the user's request and
current evidence. Do not substitute test success or the implementer's confidence for this gate.

## Establish the review boundary

Before the first mutation:

1. Inspect the repository instructions and current worktree state.
2. Record which existing changes predate the task. Preserve them and exclude them from the
   completion claim. If old and new work overlap in one hunk, review the whole hunk conservatively.
3. State the requested observable result and the evidence needed to support it.
4. Tell the user that the `evidence-driven-review` gate will run before delivery.

If no code changes remain at delivery, do not manufacture a review result. State that the gate was
not applicable because the final code diff is empty.

## Run the gate

Run the gate only after implementation, formatting, autofixes, code generation, and task-level
verification are complete:

1. Read `/Users/tlipoca9/.agents/skills/evidence-driven-review/SKILL.md` completely and activate
   `$evidence-driven-review`. If the Skill is already fully
   present in the current context, do not reread it merely for ceremony.
2. Review the actual final diff, including staged, unstaged, and relevant untracked files. Use the
   current versions of changed files, repository instructions, tests, logs, and the user's latest
   decisions as evidence.
3. Evaluate the exact claim: the final code change achieves the requested result, stays within the
   authorized scope, preserves protected state and compatibility, handles relevant failure paths,
   and is supported by evidence at the claimed observation layer.
4. Record concrete findings with file and line references when possible. Distinguish a verified
   defect from a question or optional improvement.
5. Return one gate outcome:
   - `PASS`: no unresolved finding remains in correctness, customer-visible semantics, scope,
     protected state, compatibility, verification, or delivery claims.
   - `FAIL`: at least one such finding remains, or the available evidence cannot support the
     intended completion claim.

Never award `PASS` because the diff is small, tests exit successfully, another reviewer agrees, or
the change appears conventional.

## Resolve failures

For a `FAIL` outcome:

1. Fix every in-scope finding that can be resolved within the approved behavior and authority
   boundary.
2. Re-run the smallest verification that proves the fix at the relevant layer.
3. Re-run the entire review gate against the new final diff.

Any code change after `PASS`, including a formatter, autofix, generated file, or review fix,
invalidates that result. Review the resulting diff again. Continue until the gate returns `PASS`.

Stop and ask the user only when resolving a finding would change product semantics, cross the
authority boundary, risk irreversible impact, or require a choice that current repository evidence
cannot settle. A user's explicit acceptance of a specific residual risk may become part of the
review boundary; silence is not acceptance.

## Deliver the result

Do not say the code change is complete while the gate is missing, stale, or failing. In the final
response, report concisely:

- `evidence-driven-review: PASS` and what final diff or paths were reviewed;
- the verification actually run and its observation layer;
- any user-approved residual risk or intentionally excluded pre-existing change.

If blocked, report `evidence-driven-review: FAIL`, the unresolved finding, and the exact user
decision or external evidence needed to continue. Do not dilute a failure into a generic caveat.
