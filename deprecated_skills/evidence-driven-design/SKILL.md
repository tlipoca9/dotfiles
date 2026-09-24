---
name: evidence-driven-design
description: Use when the user asks for technical design, architecture or refactor planning, solution design, RFC/ADR/proposal work, design-doc review, Socratic/Socratic-style technical inquiry, or risk/alternative comparison where current code, reproducible evidence, production constraints, upstream docs, scenarios, and validation must drive the answer.
---

# Evidence-Driven Design

Use this skill to derive, write, or review technical designs from evidence instead of preference. The reasoning path must stay visible, but the final document must read as a human design narrative, not as an evidence dump.

Write Chinese design material by default. Keep code identifiers, file paths, API names, struct names, config keys, and upstream project names in their original language.

## Start Gate

Before collecting evidence or judging a design, state:

- **Question**: what must be answered, and what is out of scope.
- **Evidence standard**: what would support, weaken, or disprove a claim.
- **Source priority**: current repository, reproducible behavior, tests, logs, official/upstream docs, then lower-confidence experience or secondary summaries.
- **Report format**: separate facts, evidence, reasoning, conclusions, confidence, and open questions.

If evidence is insufficient, say so and name the missing verification. Do not turn guesses into confident design language.

## Socratic Inquiry Layer

Use questioning to remove false certainty before deriving a design. The goal is not to interrogate the user for its own sake; it is to expose unclear concepts, hidden assumptions, weak evidence, missing alternatives, and consequences that would change the design.

Run this loop whenever a conclusion, abstraction, fallback, or trade-off starts to feel obvious:

1. Clarify the claim.
   - What exact behavior, boundary, or guarantee is being asserted?
   - Which words are overloaded or hiding multiple meanings?
   - What is explicitly out of scope?

2. Surface assumptions.
   - What must be true for this claim to hold?
   - Which assumption comes from code, tests, logs, user constraints, or upstream docs?
   - Which assumption is only experience or preference?

3. Demand evidence.
   - What would prove the claim in this repository or runtime?
   - What evidence would weaken or disprove it?
   - If the evidence is available locally, inspect it instead of asking the user.

4. Test alternatives and counterexamples.
   - What is the strongest competing explanation or design?
   - Which scenario breaks the preferred design first?
   - Does a standard or upstream primitive express the target semantics more directly?

5. Trace consequences.
   - What must change in data ownership, APIs, tests, rollout, rollback, observability, or docs if this conclusion is true?
   - What stale path, fallback, or term must be removed for consistency?
   - What remains uncertain, and what verification would close it?

Ask the user only for decisions they own. For questions answerable by repository inspection, commands, tests, logs, or upstream documentation, gather the evidence directly.

## Evidence Placement Contract

Use evidence to drive the work, not to structure the final document.

- In final design documents, organize the body around the reader's problem, current context, derived model, decisions, scenarios, risks, rollout, and validation.
- Keep evidence citations lightweight in the body, like paper references: use short markers such as `[E1]`, `[E2]`, or named footnotes when a claim needs traceability.
- Put detailed evidence in a final section such as `证据注释` or `参考资料与证据`, after the design argument is complete.
- Do not make `事实 / 证据 / 推理 / 结论` the main document skeleton unless the user explicitly asks for an investigation report instead of a design document.
- Do not put a large evidence table near the front. A short reader-context paragraph can mention the evidence base, but the detailed source notes belong at the end.
- Each evidence note should state only what the source proves, what it does not prove, and the claim it supports. Keep raw paths, symbols, tests, logs, and upstream links there.
- When reviewing a design, require traceability, but mark readability regressions when evidence sections interrupt the design narrative.

## Reference Map

- Read [references/derivation-workflow.md](references/derivation-workflow.md) for full solution design, production architecture, large refactors, architecture comparisons, ambiguous technical problems, or step-by-step derivation of a final plan.
- Read [references/design-doc-standard.md](references/design-doc-standard.md) when writing or reviewing a design document, RFC, ADR, proposal, architecture note, or cross-team technical plan.
- Read both references when the task requires deriving a design and delivering it as a formal document.

Do not use this skill for routine small edits, mechanical formatting, or local bug fixes unless the user asks for design judgment, alternatives, risks, or a design document.

## Design Loop

1. Frame the problem.
   - Separate product outcome, implementation mechanism, and delivery channel.
   - Preserve user constraints as requirements.
   - Name non-goals before optimizing a mechanism.

2. Gather evidence.
   - Inspect current code, tests, logs, production workarounds, and upstream docs as applicable.
   - Record what each source proves and does not prove.
   - Prefer standard or upstream primitives when they directly express the target semantics.

3. Derive the model.
   - Validate scenarios across creation, update, runtime, failure, rollback, and observability.
   - Identify ownership boundaries before naming abstractions.
   - Prefer one canonical fact source plus deterministic derived artifacts.
   - Use the Socratic inquiry layer to challenge each major concept before accepting it.

4. Reject unsafe shortcuts.
   - Explain why tempting approaches fail under real constraints.
   - Keep legacy compatibility separate from the formal default path.
   - Do not keep a fallback unless its production condition is observable and validated.

5. Finish with verification and consistency.
   - Check scenarios, status semantics, rollback/audit, security, operability, and testability.
   - Search for replaced names, commands, fields, comments, tests, fixtures, scripts, docs, diagrams, and examples.
   - Update stale references or document intentionally retained compatibility paths with trigger conditions and validation.

## Output Contract

Keep facts, observations, reasoning, and conclusions separable in the thinking and report, but do not force those labels into the main body of a design document. Every major conclusion needs traceable evidence: file path, symbol, test name, log, reproducible behavior, or upstream source. Confidence must match the end-note evidence coverage.

Design documents must read like a human technical lead explaining the path from current facts to final decisions. Use citation markers and final evidence notes to preserve traceability without making evidence the document backbone. Avoid template residue, unsupported claims, stale diagrams, and old terminology left behind after the design changes.
