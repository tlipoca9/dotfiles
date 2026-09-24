---
name: engineering-judgment
description: >-
  Apply engineering judgment to technical design, architecture, refactoring,
  implementation uncertainty, observable contract changes, and code or design
  review. Use before delivering any change to source code, tests, executable
  scripts, migrations, build/CI definitions, or runtime configuration, including
  small edits and continued work with unreviewed changes. For prose-only tasks,
  use when technical design or review is requested.
---

# Engineering Judgment

Use the same standard to choose a design, implement it, and review the result:
the requested behavior, supported by evidence, with the smallest coherent
solution that remains reliable and maintainable.

## Shared judgment

Understand the actual goal and current constraints before selecting a pattern
or technology. Follow the active `AGENTS.md` and the user's current decisions.
Distinguish what the system must do from what its current implementation does;
neither a familiar pattern nor existing code is proof of the right behavior.

Keep responsibilities clear and interfaces easy to use. Reuse existing code
and dependencies where they fit. Apply KISS, DRY, and SOLID to reduce real
complexity; small repetition can be cheaper than a premature abstraction.
Require a current reason for new dependencies, configuration, public concepts,
fallbacks, and extension points. Remove obsolete paths once their support
obligations end, while preserving required compatibility and data safety.

Inspect available evidence before asking factual questions. Separate observed
behavior, contractual guarantees, inferences, and unresolved decisions. Test
material assumptions that could change the implementation, then stop exploring
when enough is known to proceed reliably.

Choose routine, reversible implementation details within the authorized scope.
Ask only when missing intent or authority materially changes the result and
cannot be recovered from the task or current artifacts. Continue independent
work while awaiting a required decision; do not treat silence as approval.

## Use only the relevant depth

- **Clear implementation:** inspect the affected paths, make the bounded change,
  verify its behavior, and run the final review below. No separate design phase
  is required merely because code changes.
- **Unsettled design or implementation facts:** use
  [design.md](references/design.md) for technical brainstorming, contracts,
  evidence gathering, meaningful alternatives, and design documents. Apply only
  the parts that resolve a real decision or uncertainty.
- **Module or interface design:** use [modules.md](references/modules.md) when
  responsibility, caller knowledge, dependency isolation, or test boundaries
  are the issue. Consulting vocabulary does not start a new approval workflow.
- **Review or validation:** use [review.md](references/review.md) to judge the
  actual diff, proposal, or failure claim. A review-only request authorizes
  inspection and findings; change code or external state only when the user
  also requests that action.

These are parts of one judgment process, not mandatory consecutive phases.
An issue tracker, ticket, formal spec, design document, or fixed number of
alternatives is not a prerequisite. Use the user's request and current decisions
as requirements when no separate spec exists. Specialized workflows such as TDD
or diagnosis can supply their own mechanics without changing this standard.

## Final review for code changes

Every task that changes source code, tests, executable scripts, migrations,
build/CI definitions, or runtime configuration must pass a review before it is
reported complete. Keep the effort proportional to the actual change and risk;
test success alone does not replace review.

Before editing, identify pre-existing changes and the intended result. After
implementation, formatting, generation, and relevant verification finish, use
the review reference to inspect the final task diff, including staged,
unstaged, and relevant untracked files. Protect unrelated work; review a whole
overlapping hunk when its effects cannot be separated confidently.

Judge whether the result meets the request, stays within scope, preserves
protected behavior and state, handles relevant failure paths, and supports the
precise verification and delivery claims. Independent review is useful when it
adds coverage or challenges assumptions; no fixed reviewer count is required.

- **PASS:** no unresolved defect, required-standard violation, or material
  evidence gap prevents the stated completion claim. Optional improvements and
  unrelated pre-existing problems do not block it.
- **FAIL:** an in-scope defect remains, or evidence cannot support that claim.
  Fix what is authorized, run the relevant verification, and review the new
  final diff. Request a decision only if resolving it needs missing intent,
  authority, or acceptance of a specific residual risk.

Any later code change, including a formatter or generated output, invalidates
the result. Review the resulting final diff again. Do not manufacture a gate
result when no code change remains or when the task is purely read-only.

At delivery, state `engineering-judgment review: PASS` or `FAIL`, the reviewed
scope, the verification actually performed, and any material limits. Distinguish
implemented, locally verified, remotely verified, and deployed. Do not claim
completion while the required review is missing, stale, or failing.
