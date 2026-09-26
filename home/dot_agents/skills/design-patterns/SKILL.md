---
name: design-patterns
description: Research, choose, and apply design patterns with the user. Use when comparing patterns for module responsibilities, composing patterns across modules, or implementing and refactoring code around agreed patterns.
---

# Design Patterns

Help the user understand which patterns fit the current requirements, how they
work together, and what they cost. Ground choices in business scenarios and
actual code. A requirement can need several patterns across or within modules;
each choice should solve a concrete design problem.

## Explore and research

Read the confirmed business knowledge, existing design decisions, code, and
tests. Map the affected module responsibilities, what varies independently,
invariants, and side effects. Surface missing business rules before building a
pattern choice on assumptions.

Use [the source guide](references/sources.md) to research candidates, starting
with Refactoring.Guru. Read the relevant pattern pages for applicability,
tradeoffs, and related patterns; follow the enterprise and messaging catalogs
when those problems arise. Cite the specific pages used and distinguish source
guidance from your judgment about this codebase. If a source is unavailable,
state what remains unverified and use another authoritative source when possible.

## Decide together, module by module

Maintain a compact decision map in the shared design document:

| Module / responsibility | Scenario and design problem | Candidates and tradeoffs | Proposed or agreed choice | Collaborators and open questions |
| --- | --- | --- | --- | --- |

Cover every affected module with a pattern choice, an explicit choice of a
simple implementation, or an unresolved decision. Keep internal roles within
their owning module when that makes the design easier to understand.

For each meaningful choice, compare suitable patterns with a straightforward
implementation. Explain the change each option makes easier, the indirection
and state it adds, and the assumptions under which it stops fitting. Recommend
an option and ask the user to choose or revise it. Plain functions, data, or
conditionals are valid choices when further structure adds no useful capability.

Use [domain-modeling](../domain-modeling/SKILL.md) to check existing and proposed
code names against the shared business and product vocabulary. Map pattern
roles to those agreed names, adding technical qualifiers where they clarify
responsibility. Show concrete interfaces and a scoped directory tree.
Use [codebase-design](../codebase-design/SKILL.md) to assess responsibility,
depth, and dependency direction. Trace a normal scenario and a relevant failure
through the combined design: who calls whom, who owns state and external
actions, and how ordering, retries, and recovery work. Check the interactions
between selected patterns as carefully as each pattern in isolation.

Use [grilling](../grilling/SKILL.md) for successive rounds driven by unresolved
dependencies. When called from another skill, integrate these decisions into
its ongoing discussion and document. Preserve existing agreements. Record
confirmed choices, rationale, alternatives that explain the decision, and
remaining questions as the user answers; reuse the project's design document
or create `docs/design/<topic>.md`. Use
[domain-modeling](../domain-modeling/SKILL.md) for consequential ADRs.

Before implementing an increment, confirm its module choices and their
composition with the user. A pattern list alone does not settle the design;
the user should be able to follow the concrete responsibilities and flows.

## Implement and evolve

When implementation is requested, realize the agreed roles using the language's
idioms and existing abstractions. Apply the agreed vocabulary and rename
decisions consistently. Implement the smallest coherent increment and verify
its agreed contracts and failure behavior through module interfaces, including
interactions across modules. Tests should protect behavior and invariants that
survive a change of pattern.

If implementation reveals a poor fit, bring the evidence and alternatives back
to the user for the affected decision. Update the shared design as it evolves,
and resume subsequent iterations from that accumulated understanding.
