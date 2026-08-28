---
name: brainstorming
description: "Explore a design when the user explicitly asks to brainstorm or when implementation has unresolved choices that would materially change behavior, scope, architecture, or UI direction. Do not use for clear, bounded tasks whose decisions are already settled or recoverable from current repository evidence."
---

# Brainstorming

Turn a genuinely ambiguous request into an approved design before implementation starts.

## Activation gate

Inspect the request and available repository evidence before opening a design discussion.

- Use this workflow when the user explicitly asks to brainstorm, compare approaches, or design before implementation.
- Also use it when an unresolved choice would materially change customer-visible behavior, scope, compatibility, architecture, data flow, or UI direction.
- Do not use it merely because work is creative, touches a feature, changes code, or could be described in more than one way.
- If current evidence yields one clear, bounded implementation, exit this skill and proceed normally without requesting design approval.

Once this workflow is active, do not implement the unsettled behavior until the decisions that materially affect it are approved. Continue read-only inspection while resolving them.

## Workflow

1. Inspect the current context.
   - Read the relevant files, docs, configuration, recent local changes, or command output needed to understand the request.
   - Resolve factual questions from available evidence instead of asking the user.
   - Completion criterion: facts, settled decisions, genuine choices, and constraints are separated.

2. Ask only decision questions that current evidence cannot settle.
   - Include a recommended answer and the consequence of each viable choice.
   - Group independent questions when that shortens the round without creating dependency confusion.
   - Completion criterion: every choice that would materially alter the design is answered or explicitly delegated to a stated assumption.

3. Propose alternatives only where they are real.
   - Lead with the recommended approach and explain why.
   - Compare trade-offs, risks, complexity, and what each option preserves or gives up.
   - Do not manufacture 2–3 approaches when evidence leaves one coherent design.
   - Completion criterion: the user can approve the recommendation or choose a materially different alternative.

4. Present the smallest design that closes the ambiguity.
   - Cover architecture, components, data flow, error handling, migration or compatibility concerns, and testing where relevant.
   - Omit sections that do not affect the requested outcome.
   - Completion criterion: behavior, boundaries, important failure paths, and validation are concrete enough to implement.

5. Capture the approved design when useful.
   - Persist it only when the user requests a design document or the repository has a durable convention that this decision genuinely belongs in.
   - Do not create task-local design notes or invent a new documentation location.
   - Completion criterion: the decision is recoverable at the appropriate durable location, or is compact enough to remain in the conversation.

6. Review and request approval.
   - Check for unfinished markers, contradictions, ambiguous requirements, oversized scope, unrequested features, and missing validation.
   - Ask for approval of the material decisions, not ceremonial approval of already-settled details.
   - Completion criterion: the user approves the design or all previously unresolved choices, after which implementation may proceed.

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
- Open questions: only decisions that still block implementation.
