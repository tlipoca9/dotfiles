# Domain Docs

This is a single-context repo. The engineering skills use its domain documentation when exploring the codebase.

## Before exploring, read these when present

- Root `CONTEXT.md` for the project's domain vocabulary.
- Relevant ADRs in root `docs/adr/` for decisions affecting the area of work.

If these files do not exist, proceed. Create them when domain terms or decisions need to be recorded, not as part of initial setup.

## File structure

    /
    ├── CONTEXT.md
    └── docs/
        └── adr/
            └── NNNN-<decision>.md

## Use the glossary's vocabulary

When naming a domain concept in an issue, proposal, hypothesis, or test, use the term defined in `CONTEXT.md`. If a needed concept is absent, check the codebase's existing language and record a genuine gap through `/domain-modeling`.

## Flag ADR conflicts

If a proposed change contradicts an existing ADR, identify the ADR and explain the conflict before proceeding.
