---
name: domain-modeling
description: Build and sharpen a project's domain model. Use when discussing codebase terminology, maintaining business knowledge, writing or editing a GLOSSARY.md, or recording or editing an ADR.
---

# Domain Modeling

Actively build and sharpen the project's domain model as you design. This is the *active* discipline: challenging terms, inventing edge-case scenarios, and writing the glossary and decisions down the moment they crystallise. (Merely *reading* `GLOSSARY.md` for vocabulary is not this skill: that's a one-line habit any skill can do. This skill is for when you're changing the model, not just consuming it.)

## File structure

Most repos have a single context:

```
/
├── GLOSSARY.md
├── docs/
│   └── adr/
│       ├── 0001-event-sourced-orders.md
│       └── 0002-postgres-for-write-model.md
└── src/
```

If a `GLOSSARY-MAP.md` exists at the root, the repo has multiple contexts. The map points to where each one lives:

```
/
├── GLOSSARY-MAP.md
├── docs/
│   └── adr/                          ← system-wide decisions
├── src/
│   ├── ordering/
│   │   ├── GLOSSARY.md
│   │   └── docs/adr/                 ← context-specific decisions
│   └── billing/
│       ├── GLOSSARY.md
│       └── docs/adr/
```

Create files lazily: only when you have something to write. If no `GLOSSARY.md` exists, create one when the first term is resolved. If no `docs/adr/` exists, create it when the first ADR is needed.

## During the session

### Challenge against the glossary

When the user uses a term that conflicts with the existing language in `GLOSSARY.md`, call it out immediately. "Your glossary defines 'cancellation' as X, but you seem to mean Y. Which is it?"

### Sharpen fuzzy language

When the user uses vague or overloaded terms, propose a precise canonical term. "You're saying 'account': do you mean the Customer or the User? Those are different things."

### Discuss concrete scenarios

When domain relationships are being discussed, stress-test them with specific scenarios. Invent scenarios that probe edge cases and force the user to be precise about the boundaries between concepts.

### Cross-reference with code

When the user states how something works, check whether the code agrees. If you find a contradiction, surface it: "Your code cancels entire Orders, but you just said partial cancellation is possible. Which is right?"

### Track conflicts to closure

When confirmed rules, code, tests, documents, or earlier decisions conflict,
trace the affected sources. Resolve the conflict within the current scope or
record an unchecked item in local `TODO.md` before moving on. Reuse the relevant
existing file; otherwise create it at the repository root. This is the default
even when the repository configures an external tracker. Use another tracker
or Wayfinder only when the user explicitly requests that workflow.

Keep each item concise: the conflict and evidence, the next action or open
decision, and what counts as done. Include affected artifacts and prerequisites
where needed. Group related conflicts by the action that closes them, updating
an existing item when possible. Link from the owning design to `TODO.md` and
keep completion status there. Revisit relevant open items when continuing the
work or when their assumptions change.

Separate deciding the rule from bringing the implementation into agreement.
After a decision, reconcile the affected current definitions, rules, examples,
and design assumptions, and mark superseded historical decisions explicitly.
Keep remaining code and test changes tracked, with unresolved decisions as
dependencies. Close each item only with its resolution and evidence that its
affected artifacts agree; implementation items also need executed behavioral
verification. Recording a discrepancy or agreeing on a design leaves the
implementation item open. Deferred work retains its reason and revisit condition.

### Align code names with business and product language

Inspect existing and proposed names throughout the affected code: packages,
directories, types, interfaces, functions, fields, variables, states, and
externally visible names. Compare them with product scenarios, business docs,
and the glossary. Look for multiple names for one concept, one name covering
different concepts, unexplained abbreviations, and vague or misleading terms.
Existing code is evidence to examine; its vocabulary still needs justification.

When context is missing, work through concrete scenarios with the user to
establish what each actor, object, action, and state means. Treat inferred
meanings and names as proposals. Resolve the vocabulary over successive rounds,
creating the glossary when the first term is confirmed. Save confirmed business
scenarios and rules in `docs/business/` by default, following project conventions.

Use one canonical term per concept within its domain context, with an agreed
code-language equivalent when product language differs. Keep distinct concepts
distinct. Use the repository's casing and abbreviation conventions consistently;
retain established technical vocabulary for genuinely technical roles.
When conventions are absent or conflicting, propose and agree on a consistent
convention with the user.

Group mismatches by concept. Show representative code locations, current names,
business meaning, proposed names, rationale, and affected callers or data. Ask
the user whether to keep, rename, or defer them. Include compatibility implications for
public interfaces and persisted names. Record agreed renames, boundary mappings,
and deferred work in the shared design document; keep the glossary focused on
canonical terms, definitions, and synonyms to avoid.

During implementation, apply the agreed vocabulary and rename decisions across
the affected definitions, references, tests, and docs. Recheck touched names
against the glossary and naming conventions so the increment introduces no
unexplained competing terminology. Reopen the relevant discussion when a new
concept or a conflict appears.

### Consolidate business knowledge

When creating or updating business documents, read
[BUSINESS-DOCS.md](./BUSINESS-DOCS.md). Reuse the project's established document
structure across sessions and integrate each confirmed answer into its owning
topic so the documents form a coherent current reference. Reconcile
related definitions, examples, design assumptions, and decisions when meaning
changes; saving another paragraph is not sufficient.

### Update GLOSSARY.md inline

When a term is resolved, update `GLOSSARY.md` right there. Don't batch these up: capture them as they happen. Use the format in [GLOSSARY-FORMAT.md](./GLOSSARY-FORMAT.md).

`GLOSSARY.md` should be totally devoid of implementation details. Do not treat `GLOSSARY.md` as a spec, a scratch pad, or a repository for implementation decisions. It is a glossary and nothing else.

### Offer ADRs sparingly

Only offer to create an ADR when all three are true:

1. **Hard to reverse**: the cost of changing your mind later is meaningful
2. **Surprising without context**: a future reader will wonder "why did they do it this way?"
3. **The result of a real trade-off**: there were genuine alternatives and you picked one for specific reasons

If any of the three is missing, skip the ADR. Use the format in [ADR-FORMAT.md](./ADR-FORMAT.md).
