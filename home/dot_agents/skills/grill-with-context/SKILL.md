---
name: grill-with-context
description: Build shared domain understanding and evolve a codebase with the user. Use when establishing missing business context, working through architecture together, or guiding evolutionary refactoring across iterations.
---

# Grill With Context

Use [grilling](../grilling/SKILL.md) to build a shared domain model and architecture
with the user, working from a living design document. Help the user understand
and challenge the design, then evolve the code through real iterations.

Explore the code, tests, existing domain docs, and relevant decisions yourself.

Start business knowledge discovery in `docs/business/`. Use
[domain-modeling](../domain-modeling/SKILL.md) to organize and consolidate
confirmed scenarios, rules, rationale, and boundaries into reusable topic
documents. Follow project documentation conventions and update the owning
document as knowledge emerges.

Distinguish observed implementation behavior from intended business rules. When
business knowledge is missing, uncover the purpose, actors, concepts, rules, and
concrete scenarios over successive rounds. Treat your interpretation as a
hypothesis; use existing agreements as the starting point.

When discovered behavior has unclear business meaning, show the concrete
scenario and code evidence. Ask the user whether it represents a business
requirement, a technical constraint or workaround, or behavior to change, and
why it exists. Clarify when it applies and its exceptions before recommending
preserving or removing it. Keep unanswered cases explicit. Record the confirmed
meaning, rationale, and boundaries in the appropriate business or design
document in that round, and use them to guide refactoring. For discrepancies
with existing code or decisions, use domain-modeling to
[track conflicts to closure](../domain-modeling/SKILL.md#track-conflicts-to-closure),
including the remaining work after a business rule is confirmed.

Choose and tell the user where the shared design will live. Reuse the relevant
architecture document; otherwise create `docs/design/<topic>.md`.
As soon as a concept or rule is confirmed, write it down in that round, before
asking the next questions. Use [domain-modeling](../domain-modeling/SKILL.md)
for the glossary in `GLOSSARY.md` and consequential ADRs. Keep architecture and
design rationale in the shared design document, linking to business knowledge
and authoritative definitions instead of duplicating them. Distinguish current
behavior, agreed target behavior, proposals, and unresolved decisions.

The document is a working surface for the conversation. Show and link its
updates so the user can correct the model. Update it as answers change the
design; documenting confirmed knowledge is part of the discussion, and starts
before the whole design is settled.

Keep these branches in the design tree, and put concrete proposals to the user:

- **Names:** use [domain-modeling](../domain-modeling/SKILL.md) to align all code
  naming with the business and product vocabulary. Inspect existing names as
  well as proposed ones, discuss concrete mismatches and rename suggestions,
  and record the user's decisions as the shared vocabulary develops.
- **Structure:** show a scoped directory tree, each module's responsibility, and
  dependency directions; discuss what should move, merge, or remain.
- **Logic:** walk through business scenarios, states, transitions, and invariants.
- **Side effects:** trace state changes and external actions, their owners,
  ordering, failure, and recovery; establish which effects the business needs.
- **Observable behavior:** agree on what users and callers can observe, including
  failures and intentional behavior changes.

Prioritize [design-patterns](../design-patterns/SKILL.md) when exploring how the
requirements will be implemented. Research and discuss pattern choices for
each affected module, including how multiple patterns compose within and
across modules. Keep its decision map in the shared design document; an explicit
choice of a simple implementation also counts. Resolve these choices with the
user before implementing the affected increment, and revisit them together
when implementation reveals new constraints.

Use [codebase-design](../codebase-design/SKILL.md) to shape module interfaces and
responsibilities. Let prerequisites determine the rounds. Once responsibilities
are clear enough, bring a provisional naming scheme and directory tree into the
discussion while deeper mechanisms remain open. Revise them together as the
model develops. Every concern the user explicitly raised stays open until it
has been discussed and resolved or deliberately deferred by the user.

An increment is ready when its business rules, names, structure, module pattern
choices, composition, flows, and effects have been reviewed with the user,
confirmed knowledge is consolidated in its owning documents, and no
implementation-blocking decision remains. Known implementation gaps have
tracked corrective work for the increment.
Use the document and concrete scenarios to confirm shared understanding;
agreement on scope alone is insufficient. Carry unresolved work across sessions
in local `TODO.md`, following domain-modeling's conflict closure rules.

Apply grilling's final confirmation to implementation. When implementation is
requested and the increment is ready, make the smallest coherent refactor
serving the current need and verify the agreed behavior through existing
interfaces. Recheck touched names against the agreed vocabulary and naming
decisions. Feed discoveries back into the model and documents. Resume the next
iteration from that accumulated knowledge.
