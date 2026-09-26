---
name: domain-modeling
description: Build and sharpen a project's domain model. Use when discussing codebase terminology, writing or editing a CONTEXT.md, or recording or editing an ADR.
---

# Domain Modeling

Actively build and sharpen the project's domain model as you design. This is the *active* discipline: challenging terms, inventing edge-case scenarios, and writing the glossary and decisions down the moment they crystallise. (Merely *reading* `CONTEXT.md` for vocabulary is not this skill: that's a one-line habit any skill can do. This skill is for when you're changing the model, not just consuming it.)

## File structure

Most repos have a single context:

```
/
├── CONTEXT.md
├── docs/
│   └── adr/
│       ├── 0001-event-sourced-orders.md
│       └── 0002-postgres-for-write-model.md
└── src/
```

If a `CONTEXT-MAP.md` exists at the root, the repo has multiple contexts. The map points to where each one lives:

```
/
├── CONTEXT-MAP.md
├── docs/
│   └── adr/                          ← system-wide decisions
├── src/
│   ├── ordering/
│   │   ├── CONTEXT.md
│   │   └── docs/adr/                 ← context-specific decisions
│   └── billing/
│       ├── CONTEXT.md
│       └── docs/adr/
```

Create files lazily: only when you have something to write. If no `CONTEXT.md` exists, create one when the first term is resolved. If no `docs/adr/` exists, create it when the first ADR is needed.

## During the session

### Challenge against the glossary

When the user uses a term that conflicts with the existing language in `CONTEXT.md`, call it out immediately. "Your glossary defines 'cancellation' as X, but you seem to mean Y. Which is it?"

### Sharpen fuzzy language

When the user uses vague or overloaded terms, propose a precise canonical term. "You're saying 'account': do you mean the Customer or the User? Those are different things."

### Discuss concrete scenarios

When domain relationships are being discussed, stress-test them with specific scenarios. Invent scenarios that probe edge cases and force the user to be precise about the boundaries between concepts.

### Cross-reference with code

When the user states how something works, check whether the code agrees. If you find a contradiction, surface it: "Your code cancels entire Orders, but you just said partial cancellation is possible. Which is right?"

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

### Update CONTEXT.md inline

When a term is resolved, update `CONTEXT.md` right there. Don't batch these up: capture them as they happen. Use the format in [CONTEXT-FORMAT.md](./CONTEXT-FORMAT.md).

`CONTEXT.md` should be totally devoid of implementation details. Do not treat `CONTEXT.md` as a spec, a scratch pad, or a repository for implementation decisions. It is a glossary and nothing else.

### Offer ADRs sparingly

Only offer to create an ADR when all three are true:

1. **Hard to reverse**: the cost of changing your mind later is meaningful
2. **Surprising without context**: a future reader will wonder "why did they do it this way?"
3. **The result of a real trade-off**: there were genuine alternatives and you picked one for specific reasons

If any of the three is missing, skip the ADR. Use the format in [ADR-FORMAT.md](./ADR-FORMAT.md).
