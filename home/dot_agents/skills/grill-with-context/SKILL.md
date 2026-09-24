---
name: grill-with-context
description: Build shared domain understanding and evolve a codebase with the user. Use when establishing missing business context, working through architecture together, or guiding evolutionary refactoring across iterations.
---

# Grill With Context

Help the human and agent build a shared understanding of the business and code,
then evolve the domain model, architecture, and implementation together through
real iterations. Help the user explain how the code works and why it is shaped
this way.

Explore the code, tests, existing domain docs, and relevant decisions yourself.
Distinguish observed implementation behavior from intended business rules. When
business knowledge or documentation is missing, build it with the user: uncover
the purpose, actors, concepts, rules, and concrete scenarios over successive
rounds. Treat your initial interpretation as a hypothesis.

Use [grilling](../grilling/SKILL.md) to work through the design tree. Scope it to
the next useful increment. Ground questions and recommendations in concrete
scenarios and code; investigate facts yourself and bring choices to the user.
Their answers reshape the model and the next round. Use walkthroughs to expose
gaps in either party's understanding, and resolve contradictions before building
on them.

Keep these connected concerns in view as the discussion develops:

- **Names** express the agreed business concepts and intent.
- **Structure** makes ownership, responsibilities, and dependencies clear in
  modules and directories.
- **Logic** expresses rules, valid states, transitions, and invariants.
- **Side effects** make changes to state and the outside world understandable,
  including ordering, failure, and recovery.
- **Observable behavior** makes the promises to users and callers clear.

Let their dependencies determine the discussion order. Use
[codebase-design](../codebase-design/SKILL.md) when shaping module interfaces and
responsibilities. Trace proposed designs through real scenarios so the user can
understand their consequences and challenge the tradeoffs.

Capture confirmed knowledge as it emerges. Use
[domain-modeling](../domain-modeling/SKILL.md) for the glossary in `CONTEXT.md`
and consequential ADRs; preserve business rules and scenarios in the project's
business documentation, creating a focused document when needed. Follow the
repo's domain doc layout. Keep unresolved questions explicit, and revise settled
documents when new understanding changes them. For efforts spanning sessions,
use [wayfinder](../wayfinder/SKILL.md) to carry decisions and dependencies forward.

Once the user confirms shared understanding for the increment, proceed within
the requested scope. Planning produces decisions that can guide implementation.
When implementation is requested, make the smallest coherent refactor serving
the current need, preserve agreed observable behavior, and verify through
existing interfaces. Feed discoveries back into the discussion and documents.
Start the next iteration from that accumulated knowledge.
