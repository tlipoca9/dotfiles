# Business knowledge documents

Write for someone who needs to understand the domain without the conversation
or investigation that produced the documents. Preserve useful rules, reasons,
and qualifications while making the answers easy to find.

## Keep one project convention

Use the project's documentation conventions, with `docs/business/` as the
default home for business knowledge. Read the existing topic and neighboring
documents of the same kind before choosing a format. Their established
structure carries across sessions. Methodologies inform this convention;
they are not alternative layouts to select on each invocation.

- `GLOSSARY.md` owns canonical terms and concise definitions.
- Business documents own reusable scenarios, relationships, rules, and their
  rationale and boundaries, including external behavior callers rely on.
- The shared design owns implementation choices, code mismatches, proposed
  changes, and unresolved questions for the current design.
- ADRs own consequential decisions and the history needed to understand them.

For a new business topic without an established format, use this order:
purpose and scope; concepts and relationships; business rules grouped by
scenario or action; sources and applicability. Link glossary definitions.
Keep each rule's rationale and exceptions beside it; disclose substantial
technical evidence in an appendix. Use the project's language for headings
and omit sections with no content. For new glossaries and ADRs without a
project format, use `GLOSSARY-FORMAT.md` and `ADR-FORMAT.md` respectively.

For ordinary knowledge updates, retain the document's path, title, section
order, and table columns. Update the owning section, adding a row or subsection
when the new knowledge needs one. Restructure when the user requests it or a
concrete problem prevents clear, correct documentation; explain that reason
and repair affected links together. A new session or another methodology is
not a reason to reorganize.

## Give each fact a home

Organize around cohesive domain topics and reader questions. The organization
should survive changes in conversation order or source-file layout.

Before editing, identify the reader questions and the section that will own
each answer. Gather scattered statements about one rule into that section,
including its conditions, exceptions, consequences, and evidence. Other
sections link to it and explain only their own subject. Split a topic only
when it has a distinct reader question or independent maintenance need.

## Make the main text usable

State who or what is involved, the relevant condition, what happens, and what
the user or caller can observe. Include the business reason and exceptions
when known. Use a compact example when it clarifies a boundary better than
another abstract rule.

Use tables for comparable information. An action contract should let a caller
compare prerequisites, successful response meaning, and failure or retry
constraints together. Give modes separate rows or subsections when their
guarantees differ. Put the distinguishing guarantee in that comparison; a
pointer to an implementation trace does not answer what success means.
Keep internal transition permissions, callable actions, and completed outcomes
distinct. A state catalog explains states and links to action contracts for
allowed operations, so those contracts have one maintenance location.

Separate confirmed contracts from implementation observations and proposals
where they differ. Put a qualification beside the claim it limits: a provider,
version, mode, or operational observation must not become an unconditional
business promise. Move implementation mechanics and pending choices to the
design or relevant technical reference, while retaining any constraint needed
to use the business rule correctly.

Give the business explanation and technical evidence different reading paths.
Put detailed code traces, full internal matrices, and source inconsistencies
in a clearly separated appendix or linked technical reference when they have
continuing value; otherwise link to the authoritative code. Retain their
business implications beside the relevant rule. Preserve knowledge by moving
and integrating it, not by retaining the investigation's original layout.
Use concise source labels tied to claims and reference-style links for repeated
URLs. Record source scope or revision once where relevant.

## Integrate each round

Read the existing topic before adding knowledge. Merge an answer into the
section that owns it, remove repeated or superseded wording, and update
affected examples and cross-references. Keep unchanged agreements intact.
When a decision changes, update the current rules and assumptions that depend
on it; mark historical ADRs as superseded when appropriate. Keep unresolved
questions explicitly open in the design instead of scattering them among
settled rules. When sources disagree, follow
[Track conflicts to closure](./SKILL.md#track-conflicts-to-closure) so remaining
decisions and corrections have actionable follow-ups.

Before finishing, answer the reader questions using only the resulting main
text. If an answer requires assembling fragments from a summary, state table,
and implementation narrative, consolidate those fragments into its owning
section. Verify that other occurrences are useful pointers rather than
competing rule definitions. Then compare against the previous text for lost
facts, qualifications, provenance, and unresolved choices, and check links.
Completion requires a usable reference as well as faithful preservation.

## Basis

[Diátaxis reference](https://diataxis.fr/reference/) informs consistent lookup
structures; [explanation](https://diataxis.fr/explanation/) informs the treatment
of context and reasons. The topic order above is this skill's default project
convention, not a template prescribed by Diátaxis. Domain modeling supplies
the shared vocabulary; ADRs record decision history using their existing
format. These roles do not introduce competing business-document templates.
