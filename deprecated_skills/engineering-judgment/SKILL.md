---
name: engineering-judgment
description: Resolve consequential engineering design, contract, and implementation trade-offs, or review code and designs. Routine edits with settled behavior need only the normal final diff check.
---

# Engineering Judgment

Judge the result against the user's intended behavior and current constraints.
Existing code establishes what happens today; it does not by itself justify a
product concept, recovery path, compatibility obligation, or future feature.

Use concrete scenarios to test consequential decisions. Identify who needs the
behavior, what varies, which facts each module owns, and what callers must know.
Compare the benefit with the added concepts, coordination, and maintenance cost.
An interface or directory earns its place by solving a demonstrated problem.

## Load only the relevant guidance

- [design.md](references/design.md): unresolved requirements, contracts,
  implementation facts, meaningful alternatives, and design documents.
- [modules.md](references/modules.md): responsibility placement, caller knowledge,
  dependency isolation, naming, and test boundaries.
- [review.md](references/review.md): a requested review, or a consequential change
  or claim needing deeper scrutiny than a routine final diff check.

These are references, not consecutive phases. A tracker, formal spec, fixed
number of alternatives, or approval round is not a prerequisite. Use the user's
request and settled decisions when no separate specification exists. Consulting
one reference does not require loading the others.

## Decide and finish

Investigate material factual uncertainty; choose routine reversible details
within the authorized scope. Ask only for unresolved decisions that materially
affect the outcome. A proposed future use can test a boundary without authorizing
implementation of that feature.

Review against business scenarios and actual changes, not package counts, naming
patterns, test totals, or reviewer consensus. Reconcile evidence with the latest
user decisions. Fix authorized in-scope defects and verify affected behavior;
state any evidence gap that limits the completion claim.

At delivery, explain the result, verification actually performed, and material
limits. No fixed PASS/FAIL wording or separate review report is required.
