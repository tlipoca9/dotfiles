# Design Doc Standard

Use this reference when writing or reviewing a technical design document for a complex change. The goal is a document where readers can naturally follow the path from current facts to the final design while detailed evidence stays available as end notes.

## Contents

- Hard requirements
- Core stance
- Writing workflow
- Establish reader context
- Describe current state only
- Add code structure analysis
- Derive the problem
- Design from the whole project
- Keep concepts few and bounded
- Prefer simple, hard-to-misuse interfaces
- Use upstream patterns as calibration
- Make diagrams current
- Validate by scenarios
- Iterate on gaps found while writing
- Add corruption guards
- Finish with consistency sweep
- Recommended document structure
- Human readability standard
- Review checklist
- Red flags

Write the design document in Chinese by default. Keep code identifiers, file paths, API names, struct names, config keys, and upstream project names in their original language. Only write the document in another language when the user explicitly asks for it.

Writing the document is part of the design process. While explaining the system, you will often discover missing fields, unclear ownership, impossible paths, stale assumptions, or overcomplicated abstractions. Treat those discoveries as first-class design feedback. Raise them, investigate them, and revise the design until the document is coherent and complete.

## Hard Requirements

These are acceptance gates, not suggestions. If the document cannot satisfy them, stop and report the missing evidence or unresolved design gap instead of producing a finished-looking document.

- Section titles, report labels, scenario labels, and prose must be Chinese by default. Keep only code identifiers and upstream names in their original language.
- The document must not read like a filled template. Remove irrelevant sections, rename headings to match the problem, and keep only sections that carry reasoning.
- The document must read like a human technical lead explaining a design to other humans. It needs narrative flow, transitions, and judgment; not a pile of generated checklist sections.
- Every major design conclusion must be traceable to explicit evidence: file path, symbol name, test name, log, reproducible behavior, or upstream source.
- A package list is not enough. For key claims, cite the concrete struct, method, field, or config that proves the claim.
- Detailed evidence must not become the main document structure. Use compact citation markers in the body and put source details in a final `证据注释` or `参考资料与证据` section.
- Do not put a large `证据` table or `事实 / 证据 / 推理 / 结论` frame near the front unless the user asked for an investigation report instead of a design document.
- Current state must not contain future design language. Design sections must not restate current facts without deriving a decision from them.
- Gaps found while writing must change the design or be explicitly scoped out. Do not leave them as vague TODOs.
- If a gap changes the design, update the summary, diagrams, scenarios, interface definitions, test plan, and guardrails so the whole document tells one story.
- Do not claim confidence "high" unless the supporting code/test evidence is named in the document.
- Do not use "recommended", "suggested", or "can" for behavior that is required by the target semantics. Use "must" and explain the enforcement point.
- Before finalizing, include concise end-note evidence coverage: list the key conclusions, citation marker, and supporting sources after the main design narrative.

## Core Stance

Do not start with the preferred design. Start with the problem, evidence standard, source priority, and report shape.

Before collecting evidence or judging a design, state:

- **Question**: what this document must answer, and what is out of scope.
- **Evidence standard**: what would support, weaken, or disprove a claim.
- **Source priority**: current repository, reproducible behavior, tests, logs, official or upstream docs, then lower-confidence experience or secondary summaries.
- **Report format**: separate facts, evidence, reasoning, conclusions, confidence, and open questions.

If evidence is insufficient, say so. Do not convert guesses into confident design language.

For final design documents, this start gate is a working contract, not a required opening section. The finished document may summarize it briefly in the introduction, while detailed evidence standards and source notes sit near the end when that is better for readability.

## Writing Workflow

### 1. Establish Reader Context

Explain the product or system background before introducing internal abstractions. Define terms the first time they appear.

For documents read by both product and engineering, avoid starting with implementation vocabulary. Start with:

- why the system exists
- what user or platform problem is visible
- what current behavior fails
- what success should feel like

Write for a human reader. Each section should answer why the reader is seeing this section now, and how it prepares them for the next one. Add short transition paragraphs between major sections when the reasoning would otherwise feel abrupt.

### 2. Describe Current State Only

The current-state section must not contain future design, migration hints, or new abstraction names.

Good current-state content:

- existing flows
- current data model
- current configuration sources
- where decisions are made today
- failure examples
- observed limitations

Avoid phrases like:

- "this can evolve into..."
- "this already has the basis for..."
- "we can later introduce..."

Save those for design derivation.

### 3. Add Code Structure Analysis

For a non-trivial codebase, include a dedicated section after current state and before design. This section should help a new reader locate the problem in code.

Recommended shape:

```text
Packages and responsibilities
Core structs / interfaces
Core methods / builders / handlers
Configuration sources
Current sequence diagrams
Current structural problems
```

Use concrete file, type, method, and config names from the repository. Keep this section factual; do not smuggle design conclusions into it.

For every code fact that later drives a design decision, capture at least one of:

- file path + symbol
- file path + line reference when available
- test name
- migration name
- config key or API field

Avoid unsupported summaries such as "the service already supports this" unless the concrete method or test is named.

Use lightweight citation markers when writing the body, for example `调度状态目前由 WorkspaceLeaseStatus 承载 [E3]`. Put the full file path, symbol, and what the evidence proves in the final evidence notes instead of interrupting the section with source inventory.

### 4. Derive the Problem

After current state and code structure, state the root cause in terms of responsibility boundaries.

Prefer:

```text
The issue is not one missing field.
The issue is that multiple flows independently interpret the same configuration.
```

Over:

```text
We need abstraction X.
```

The root cause should explain why local patches are not enough.

### 5. Design from the Whole Project

Do not design around the most visible failing path only. Ask what the abstraction must explain across the whole project:

- creation
- update
- matching or scheduling
- background jobs
- replay / restore / resume
- runtime hooks
- provider or backend implementations
- observability and debugging

If an abstraction only solves one local path and does not compose with sibling paths, treat it as suspect.

### 6. Keep Concepts Few and Bounded

For every proposed concept, define:

- what it owns
- what it does not own
- who creates it
- who consumes it
- whether it is persisted
- whether it is a fact source or a derived artifact
- what must never be hidden inside it

Delete or merge concepts that cannot answer these questions clearly.

Prefer one canonical fact source plus deterministic derived artifacts. Avoid multiple writable sources for the same fact.

### 7. Prefer Simple, Hard-to-Misuse Interfaces

Assume maintainers have uneven context and documents will become stale. Choose interfaces that make the correct path obvious and the wrong path difficult.

Good interface properties:

- few public methods
- clear ownership of mutation
- fixed execution order when order matters
- validation after mutation
- derived objects built by a single builder or compiler
- no hidden reads after identity/hash/key calculation

Be skeptical of generic effect, patch, contribution, diagnostics, context, or resolver objects unless they remove real complexity. If they mostly rename uncertainty, remove them.

### 8. Use Upstream Patterns as Calibration

Look for mature open-source or upstream designs that face similar boundaries. Use them to calibrate responsibility, not to decorate the document with names.

Useful analogies:

- **Admission/defaulting**: mutate or default a canonical object before validation and reconciliation.
- **Controller/reconciler**: read desired state and drive external systems toward it.
- **Runtime/provider interface**: keep domain intent separate from backend-specific execution.
- **Driver-specific config**: put backend-only fields in backend specs, not domain objects.
- **Pipeline configuration**: separate component configuration from enablement and execution wiring.

When citing a pattern, state exactly what it proves and what it does not prove.

### 9. Make Diagrams Current

Architecture and sequence diagrams must match the final design. Update them after every major design change.

At minimum, include:

- current-state or problem flow when it clarifies failure
- final architecture diagram
- key sequence diagrams for creation, matching, fallback, runtime hook, or other critical paths

Do not leave old diagrams in place after changing the text.

### 10. Validate by Scenarios

After the design, test it on concrete scenarios. For each scenario, write:

```text
Scenario
Old risk
New behavior
Remaining edge cases
```

Choose scenarios from real product paths, not only happy-path unit cases.

Each scenario must be decision-bearing. If a scenario does not confirm, weaken, or change the design, remove it.

### 11. Iterate on Gaps Found While Writing

Do not treat the first design draft as fixed. As the document becomes more detailed, actively look for places where the explanation breaks.

Common discoveries:

- a field has no clear owner
- a lifecycle path is not covered
- a runtime value accidentally enters stable identity
- a backend-specific detail leaks into the domain model
- two abstractions express the same fact
- a diagram cannot be made consistent with the text
- a scenario works only by adding an implicit fallback
- a proposed interface is too flexible and easy to misuse
- a "current state" claim is not supported by code

When a gap appears, do not hide it in vague language. Use this loop:

```text
Name the gap
-> collect code or upstream evidence
-> decide whether it is a real requirement, an implementation detail, or out of scope
-> revise the design if needed
-> update diagrams, scenarios, interfaces, and guardrails
-> record remaining open questions explicitly
```

If the gap changes the architecture, rewrite the affected sections so the reader sees the new reasoning path. Do not leave the old reasoning in place.

Do not put all discoveries only in a late "gaps found" section. That section is an audit trail. The actual design corrections must be reflected where readers first encounter the affected concept.

### 12. Add Corruption Guards

Complex refactors fail when future changes silently bypass the intended path. Add guardrails:

- single source of truth rules
- canonical builder/compiler rules
- field ownership tables
- hash/key input projection tests
- request/spec equivalence tests
- persistence immutability rules
- consistency checks for old terminology

Explain how a future contributor can know where a new field belongs.

### 13. Finish with Consistency Sweep

Before finalizing, search the repository or document for removed or replaced concepts.

Search for:

- old struct/interface names
- old method names
- old config names
- old comments
- old test names
- old diagrams
- old failure descriptions

Update or remove stale references. If an old path must remain, document why, when it triggers, and how it is validated.

Also sweep the document itself for template residue:

- English headings that should be Chinese
- generic labels such as "Scenario", "Old risk", "New behavior" when the document language is Chinese
- duplicated conclusions
- confidence labels without evidence
- late gaps that were not reflected into earlier sections
- evidence tables that have become the main reading path instead of supporting notes

## Recommended Document Structure

Use this structure as a default, but adapt when the problem shape requires it:

```text
0. Summary
1. Background and terminology
2. Current state
3. Code structure analysis
4. Root cause and goals
5. Design
6. Key sequence diagrams
7. Scenario analysis
8. Data and interface changes
9. Gaps found while writing and resulting design changes
10. Guardrails and anti-corruption
11. Rollout / compatibility / risks
12. Test plan
13. Open questions
14. 证据注释与参考资料
```

Do not preserve these headings mechanically. Rename them to fit the actual document, merge adjacent sections when the distinction is artificial, and delete sections that do not carry reasoning. A readable document with fewer sections is better than a complete-looking document that feels generated.

## Human Readability Standard

Before finalizing, read the document as if you were a product owner or engineer who was not in the design conversation.

The document should:

- have a clear opening that explains why the problem matters
- introduce terms before relying on them
- move from fact to implication to decision
- keep source details in end notes while using short citation markers in the body
- use paragraphs to connect tables and diagrams instead of dropping artifacts one after another
- avoid repeated boilerplate labels such as "Scenario / Old risk / New behavior" when prose or a compact table reads better
- make important tradeoffs sound like engineering judgment, not template output
- keep summaries short and specific, not generic
- explain why rejected paths are rejected
- avoid overusing "本方案", "当前", "需要", and repetitive sentence frames
- end with what is settled, what remains open, and what evidence would close the open questions

If the document feels like a checklist was filled in, revise the structure before polishing wording.

## Review Checklist

Use this checklist when reviewing a design doc:

- Does the document define the question, evidence standard, source priority, and report format?
- Are headings and labels Chinese, except for code identifiers and upstream names?
- Does the document avoid obvious template residue?
- Does the document read like a human-facing explanation rather than generated scaffolding?
- Do sections have transitions that explain why the next topic follows?
- Does current state avoid future-design language?
- Is there a code structure analysis before the design?
- Are key code claims backed by concrete files, symbols, tests, or config names?
- Are facts, evidence, reasoning, and conclusions separable?
- Is detailed evidence kept in final notes or references instead of dominating the main body?
- Do inline citation markers make major claims traceable without breaking narrative flow?
- Does the abstraction cover the whole project, not only the failing path?
- Does each concept have clear ownership and non-ownership?
- Is there exactly one canonical fact source for each stable fact?
- Are derived plans/specs built by fixed builders or compilers?
- Are interfaces simple enough for uneven maintainers?
- Are upstream references used to justify boundaries, not as name-dropping?
- Are diagrams current?
- Are important scenarios validated step by step?
- Did the writer surface gaps found while writing instead of hiding them?
- Were design changes from those gaps reflected back into earlier sections?
- Are corruption guards and consistency sweeps specified?
- Is there end-note evidence coverage for the major conclusions?

## Red Flags

Treat these as signs to revise:

- The design introduces many nouns but cannot explain field ownership.
- The document mechanically follows the template even when a section does not help the argument.
- The document is a stack of tables, bullets, and diagrams without connective reasoning.
- The evidence section appears before the reader understands the problem and decisions.
- Source excerpts, file inventories, or evidence matrices replace the design argument.
- Every scenario uses the same repeated labels even when prose would be clearer.
- The opening states the conclusion before earning it through evidence.
- Paragraphs repeat the same sentence shape and feel generated.
- Headings remain in English despite a Chinese-document requirement.
- Major claims cite only "current code" without naming the code.
- A section titled "current state" mentions the new abstraction.
- A feature/plugin can write both the canonical object and the derived plan.
- Hash/key calculation and request generation read configuration through different paths.
- Backend-specific fields leak into domain models without justification.
- Runtime-only values enter stable identity.
- Diagrams describe an older version of the design.
- The document claims "solves all scenarios" without scenario-by-scenario proof.
- Discovered gaps are left as vague TODOs instead of being investigated or explicitly scoped out.
- The document keeps old reasoning after changing the final design.
- The final confidence section is stronger than the end-note evidence coverage supports.
- Old names remain in comments, tests, diagrams, or examples after the design changed.
