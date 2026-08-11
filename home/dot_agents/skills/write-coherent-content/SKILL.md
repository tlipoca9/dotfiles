---
name: write-coherent-content
description: Produce self-contained, causally coherent, consistent, appropriately detailed writing. Use for substantive content that may be saved, shared, or used as a basis for decisions, including documents, specifications, proposals, reviews, analyses, summaries, and multi-paragraph discussions. Do not use for brief questions and answers, status updates, or simple confirmations.
---

# Write Coherent Content

Write for a domain-literate colleague who has not seen the current chat and does not know its hidden context. Preserve the reader's attention: include what changes understanding, not everything available to say.

## Select the mode

- **Document mode:** Make the finished artifact independently understandable. Never treat chat history as part of the document.
- **Discussion mode:** Do not repeat all established context in every message, but connect each judgment to its stated basis. When the discussion converges, changes topic, or ends, restate the current result as a standalone synthesis.

Apply the remaining rules in both modes unless a rule explicitly concerns the finished document.

## Establish the content contract

Before drafting, form a compact working outline that identifies:

- the reader and what the reader should understand after reading;
- the central question and the current conclusion, if one exists;
- the facts, constraints, and reasoning needed to support that conclusion;
- the scope and relevant non-goals;
- information that is still missing.

Treat the requested reader outcome and scope as an upper bound, not an invitation to complete every adjacent design problem. Keep the outline private unless showing it would help the collaboration. If available materials or project files can resolve a gap, inspect them. If a gap would materially change the conclusion, scope, or solution, ask the single most important question. Otherwise proceed with the smallest reasonable assumption and state only assumptions that affect the result. Never invent details, import unrelated best practices to make the content appear complete, or hide uncertainty behind diffuse caveats.

## Build one causal spine

Organize the content around this semantic progression, adapting its surface structure to the task:

> purpose or problem -> current facts -> governing constraints -> alternatives or implications -> conclusion -> effect

Do not force these labels into headings. Do ensure every important conclusion can be traced through the progression. Supply the missing premise when moving between sections; do not rely on adjacency to imply causality.

Lead with a short statement of purpose, core conclusion, and main effect. If no conclusion exists yet, lead with the decision question, established facts, and unresolved disagreement. Use the rest of the content to support that opening rather than withholding the point until the end.

Use paragraphs to develop claims and their implications. Use transitions to name causal, contrasting, or dependency relationships. Do not assemble locally polished fragments that leave the reader to infer why they belong together.

## Make the content standalone

- Define project-specific terms before first use. Do not explain ordinary domain knowledge to the default reader.
- Include the background and prior decisions required to understand the conclusion.
- When another artifact is a necessary dependency, identify it and summarize the premise that matters here. Do not write only "see earlier discussion" or an equivalent pointer.
- Avoid deictic references such as "the above solution" when a precise name would remain clear after sections are moved or excerpted.

## Preserve semantic consistency

Maintain a working consistency ledger while drafting. Track relevant terms, entities, fields, states, units, defaults, scenarios, and exceptions; do not expose the ledger unless the reader benefits from a glossary or schema.

- Use one name for one concept and one concept for one name. Do not vary terminology merely for stylistic variety.
- Give each field one baseline meaning. Express scenario-specific behavior as an explicit condition or override; never silently change the field's meaning between sections.
- Make states, units, defaults, and exception precedence explicit when they affect interpretation.
- Treat definitions, rules, and decisions as authoritative. Examples must conform to them and must not introduce a second semantics.
- State when an example omits irrelevant fields. Label an example as normative only when it is intended to be complete.

Before finishing, compare definitions, examples, flows, scenarios, and conclusions across the whole content. Resolve contradictions instead of documenting both versions without explanation.

## Separate epistemic status

Keep facts, assumptions, recommendations, decisions, and unresolved questions distinguishable without mechanically labeling every sentence.

- Present verified observations as facts and attach a basis when it matters.
- Mark unverified premises as assumptions.
- Call an unapproved option a proposal or recommendation, not a decision or requirement.
- Reserve decision language for settled choices.
- Identify unresolved questions and what they prevent when that consequence matters.

Make decision-driving claims traceable. Ground descriptions of existing behavior in code, tests, configuration, logs, or existing documents when available; prefer primary sources for external facts. If no reliable basis exists, mark the claim for validation.

Keep evidence unobtrusive. Prefer short references at the end of the relevant sentence, footnotes, or a references section. Put investigation details in the main narrative only when they are part of the reasoning the reader must evaluate.

## Control detail and repetition

Keep a detail in the main narrative only when it is necessary for the content contract **and** changes the reader's understanding of at least one of:

- the conclusion;
- implementation;
- verification;
- risk.

Relevance to implementation, verification, or risk is not by itself permission to expand the scope. Do not turn a synthesis into a comprehensive proposal, or a proposal into an implementation manual. Introduce a new recommendation only when it is needed to answer the central question or resolve a material contradiction, and keep it to the minimum defensible form.

Otherwise delete the detail, compress it, or move it to an appendix, note, or linked artifact. Prioritize what, why, and effect. Expand how only to the depth required for the requested reader outcome. Do not repeat a definition or argument after it has done its job; refer back by its stable name.

## Use structure and visuals deliberately

- Use connected prose for causal reasoning.
- Use lists for genuinely parallel items.
- Use tables for exact mappings, field definitions, or multi-dimensional comparisons.
- Make headings reflect meaningful hierarchy; do not create a heading for every small fragment.

Do not be reluctant to draw. Whenever three or more nodes participate in a dependency, causal chain, sequence, state transition, data flow, or architecture, actively test whether a diagram would reduce the reader's effort. If it would, create the diagram.

Prefer a standalone SVG for durable artifacts. Give it a descriptive title, explicit labels, directions, and a legend when needed. Place a short textual takeaway near it so the document remains understandable when the SVG cannot render. Do not reproduce every visual relationship again in prose, and do not make the visual the only source of a normative rule. Use another format only when SVG cannot be created or embedded in the target surface.

## Revise before delivering

Perform a silent whole-content pass:

1. **Standalone:** Can the default reader understand the purpose and conclusion without the chat?
2. **Definition order:** Is every project-specific term defined before use?
3. **Causality:** Can each important conclusion be traced to facts and constraints?
4. **Consistency:** Do fields, scenarios, examples, and conclusions share one semantics?
5. **Epistemic status:** Are fact, assumption, proposal, decision, and unknown distinguishable?
6. **Proportion:** Does every retained detail earn its place, with repetition removed?
7. **Evidence experience:** Are important claims grounded without interrupting the narrative?
8. **Visual opportunity:** Would an SVG materially clarify any complex relationship?

Fix failures in the content. Do not append this checklist or describe the drafting process unless the user asks for it.
