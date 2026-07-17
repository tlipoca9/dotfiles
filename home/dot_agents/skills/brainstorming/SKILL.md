---
name: brainstorming
description: "Brainstorm before creative or ambiguous implementation work: creating features, changing behavior, building UI/components, designing architecture, or turning rough ideas into scoped designs. Use to explore intent, constraints, alternatives, risks, and approval gates before implementation."
---

# Brainstorming

Turn a rough request into an approved design before implementation starts.

Do not write code, scaffold files, modify behavior, or perform implementation work until the user has approved the design. For very small changes, the design can be a few sentences, but the approval gate still applies.

## Workflow

1. Explore the current context.
   - Read the relevant files, docs, configuration, recent local changes, or command output needed to understand the request.
   - If the request spans multiple independent systems, stop and decompose it into smaller pieces before designing the first piece.
   - Completion criterion: the project shape, relevant constraints, and likely scope are clear enough to ask targeted questions.

2. Ask clarifying questions one at a time.
   - Prefer multiple-choice questions when the options are clear.
   - Use open-ended questions when the user's intent, constraints, or success criteria are still unclear.
   - Do not bundle unrelated questions into one message.
   - Completion criterion: purpose, in-scope behavior, out-of-scope behavior, constraints, and success criteria are known or explicitly marked as assumptions.

3. Propose 2-3 viable approaches.
   - Lead with the recommended approach and explain why.
   - Include trade-offs, risks, complexity, and what each approach preserves or gives up.
   - Remove unnecessary features aggressively.
   - Completion criterion: the user can choose an approach or ask for a revision from a concrete option set.

4. Present the design in sections sized to the problem.
   - Cover architecture, components, data flow, error handling, migration or compatibility concerns, and testing where relevant.
   - For straightforward work, keep sections short.
   - For nuanced work, present one section at a time and ask whether it looks right before continuing.
   - Completion criterion: every section needed for implementation has been reviewed, revised if needed, and approved by the user.

5. Capture the approved design when useful.
   - If the design is substantial, write it to a project-appropriate spec path, using the repository's existing docs conventions if present.
   - If no convention exists, use `docs/specs/YYYY-MM-DD-<topic>-design.md`.
   - Do not create a spec for a tiny change unless it would reduce ambiguity or the user asks for one.
   - Completion criterion: the final design is either documented or compact enough to remain clear in the conversation.

6. Self-review before implementation.
   - Check for unfinished markers, contradictions, ambiguous requirements, oversized scope, unrequested features, and missing validation.
   - Fix issues inline before asking for final approval.
   - Completion criterion: there are no known design gaps that would predictably derail implementation.

7. Wait for approval.
   - Ask the user to approve the design or request changes.
   - If the user requests changes, revise the design and repeat the self-review.
   - Completion criterion: the user explicitly approves proceeding.

## Design Standards

- Follow existing project patterns before inventing new structure.
- Improve local design problems only when they affect the requested work.
- Avoid unrelated refactors.
- Prefer small, well-bounded units with clear responsibilities and interfaces.
- For each proposed unit, be able to state what it does, how callers use it, and what it depends on.
- Treat assumptions as visible assumptions, not facts.

## Output Shape

When reporting a design, separate:

- Facts: context observed in the repo or environment.
- Assumptions: details not yet verified or chosen defaults.
- Options: viable approaches with trade-offs.
- Recommendation: the chosen approach and why.
- Design: concrete behavior, boundaries, data flow, errors, and tests.
- Open questions: anything still blocking approval.
