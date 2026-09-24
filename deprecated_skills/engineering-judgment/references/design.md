# Design Judgment

Use the parts of this reference that can change the decision. A clear local
change may need only a few checks; a consequential architecture decision may
need scenarios, experiments, or a design document. None requires an issue
tracker, a formal plan, a report, or a new approval round by default.

## Start with the actual goal

Identify the user outcome, the operating environment, the relevant constraints,
and what observable result would count as success. Separate the outcome from
the proposed mechanism and its delivery channel. An attractive mechanism is
still a candidate until it satisfies the goal in the intended environment.

Inspect existing code, dependencies, documentation, and working behavior before
inventing concepts. A production workaround can reveal real constraints: learn
which parts are proven, which depend on controlled conditions, and which cannot
observe or recover from failure. Existing implementation does not establish the
right product model by itself.

Clarify overloaded terms and hidden assumptions. Ask what would disprove the
preferred explanation and which realistic scenario breaks it first. Investigate
factual questions directly; ask the user only for consequential choices that
available evidence and existing authorization cannot settle. Do not manufacture
alternatives when there is one coherent, bounded solution.

## Separate intended behavior from current behavior

Establish intended behavior from the latest explicit user decision, still-active
contracts, scope, non-goals, and acceptance criteria. Establish current behavior
from reproducible observations, requests, traces, tests, code, configuration,
schemas, and deployment state. A discrepancy is a finding to resolve, not a
reason to silently replace either category with the other.

For observable changes, examine the relevant actor, object, operations,
identity, lifecycle, ownership, permissions, and failure or recovery semantics.
An internal table, controller, or runtime object deserves a public concept only
when users need its independent identity, lifecycle, operations, permissions,
audit, recovery, or other observable behavior.

Make each significant claim traceable to a concrete source or check. Record the
version, environment, and scope where they affect the conclusion. Evidence that
a mechanism works in one controlled context does not establish its reliability
in a different runtime, deployment, or permission model.

## Resolve uncertainty that can change implementation

Reduce material uncertainty to concrete questions. Determine what observation
would support or weaken each answer. If the repository already establishes the
answer, use it; avoid turning implementation work into a technology survey.

For external guarantees, consult the relevant standard or versioned official
documentation, then upstream source and tests when implementation details
matter. Mature implementations can reveal constraints and failure modes; they
do not override this project's contract or prove a copied design is suitable.
Understand license and attribution requirements before copying external code.

When the uncertainty is empirical, use a small executable experiment that
answers one question in the relevant environment. Distinguish a mechanism that
cannot work from one that was tested without its required capabilities. Keep
experiments disposable and outside the repository where possible; do not build
production abstractions or durable tests around exploratory scaffolding.
Respect existing authorization for any external or shared-system mutation.

Separate observed behavior, specified guarantees, experimental results, and
remaining inference. Stop investigating when the material uncertainty is
resolved. If it remains, state how it limits the proposed solution and the
evidence that would close it; do not conceal it behind confident language.

## Choose and evolve the smallest coherent solution

Use concrete scenarios to distinguish designs: relevant creation and update
paths, runtime behavior, failure, retry, deletion, restore, and operational
constraints. Include sibling paths affected by a shared abstraction without
expanding into an unrelated repository-wide redesign. A scenario is useful when
it confirms, weakens, or changes a decision.

Define who owns each fact and mutation. Prefer one authoritative source with
deterministic derivation over independently writable copies. Keep transient
runtime values out of stable identity unless the contract requires them. Ensure
validation and identity or request construction use the intended final values;
hidden reads or later mutations must not invalidate an established invariant.
Use [modules.md](modules.md) when interface shape or responsibility placement is
the actual decision.

Treat compatibility as three explicit sets: external behavior that remains
protected, clients or persistent data needing transition, and internal paths
that can be removed. Remove obsolete paths when support obligations allow it.
Any retained fallback needs a current reason, a defined trigger, observable
behavior, and relevant validation. Name an exit condition for temporary paths.

Evolve from a working system in usable increments. Consider partial failure,
recovery, rollback, and audit when the affected operations require them. An
explicit plan or result model can help with consequential mutations, but does
not justify introducing planners, manifests, adapters, or status frameworks
without a current need. Report meaningful distinctions such as applied versus
verified or effective now versus after restart when users must act on them.

## Write a design only when it is useful

Persist a document when requested or when a durable repository convention makes
the decision worth retaining. Otherwise keep the explanation in the
conversation. Use the project's established language; default to Chinese for
new design documents while preserving identifiers and proper nouns.

Organize the document for a reader who was not in the conversation: the problem
and goal, relevant current behavior, the resulting design, consequential
trade-offs, scenarios, and validation or rollout concerns. Include only sections
that advance the argument. Distinguish current facts from proposed behavior.
Use repository symbols and paths where they locate the problem; a package
inventory alone is not evidence of a behavior claim.

Keep the narrative readable. Use lightweight citations for important claims
and place detailed source notes at the end when the evidence is extensive.
Notes should explain what a source proves, its limits, and the supported claim.
Do not make a facts/evidence/reasoning table the document's main structure unless
the user requested an investigation report. Use diagrams only where they help.

Maintain one coherent design at the requested scope. Incorporate settled changes
into it rather than adding a new document for each discussion topic. Split out a
document only when it has a distinct lasting audience or maintenance purpose.

Treat gaps found while writing as design feedback. Resolve them, narrow the
scope, or identify a concrete open decision; then update the affected model,
interfaces, diagrams, scenarios, and validation together. Search affected
artifacts for replaced names and stale behavior descriptions. Preserve rejected
alternatives only when their rationale has lasting value, and match confidence
to the evidence actually obtained.
