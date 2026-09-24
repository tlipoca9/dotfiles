---
name: explore-before-code
description: >-
  Investigate material implementation uncertainty before writing production code. Use when
  correctness or design depends on facts that cannot be established from the current repository,
  including unfamiliar APIs, platform behavior, community implementation patterns, or empirical
  feasibility. When `research` or `prototype` is being considered for implementation uncertainty,
  use this skill instead when the goal is to unblock production code rather than produce a
  standalone report or throwaway artifact.
---

# Explore Before Code

Do not guess implementation details that can be established with evidence.

Use this skill only when production implementation depends on a material
assumption that the current repository cannot establish.

Do not invoke it for routine changes whose behavior, constraints, and
conventions are already clear from the repository.

## 1. Inspect the repository first

Read the relevant code, tests, configuration, documentation, and dependency
versions before searching externally.

Determine whether the repository already defines the required behavior or
contains an established implementation pattern.

Do not use external conventions to override repository-specific contracts.

## 2. Define the uncertainty

Reduce the uncertainty to one or more concrete questions whose answers could
change the implementation.

Examples include:

- What behavior does this API guarantee?
- How do mature implementations handle this failure mode?
- Does this mechanism work in the target runtime or operating environment?
- Is the proposed abstraction necessary, or is there an established simpler
  approach?

Do not broaden the investigation into a general technology survey.

## 3. Gather appropriate evidence

Choose evidence according to the type of uncertainty.

Prefer sources in this order:

1. standards and formal specifications
2. official documentation for the relevant version
3. upstream source code and tests
4. mature open-source implementations
5. reputable technical references

When established community implementations are likely to exist, inspect them
before inventing a non-trivial mechanism.

Inspect actual source code when implementation details matter. Do not rely on
search-result snippets, summaries, or remembered behavior when primary sources
are available.

Use prior art to understand constraints, failure modes, and design patterns.
Do not treat another project's implementation as automatically correct for the
current repository.

Do not copy external code unless its license, attribution requirements, and
compatibility with the repository are understood.

## 4. Resolve empirical uncertainty experimentally

When the question is whether something actually works, prefer a small
executable experiment over further speculation.

Use the smallest practical mechanism, such as:

- a temporary script
- a minimal standalone program
- an existing CLI
- `curl`
- `openssl`
- `git`
- `docker`
- `kubectl`
- system inspection tools
- a disposable local environment

An experiment should answer one concrete question.

Keep exploratory code disposable. Do not add production abstractions, tests,
general error handling, or unrelated functionality to it.

Prefer temporary locations outside the repository. If repository context is
required, remove all exploratory files and outputs when the question is
answered.

Do not run destructive experiments or mutate production, shared, or external
systems without explicit permission.

Uncertainty that can be resolved experimentally should be resolved
experimentally, not by reasoning harder.

## 5. Decide from evidence

Separate:

- observed facts
- behavior established by source or specification
- experimental results
- remaining inference

Stop investigating once the material uncertainty is resolved.

Choose the simplest design that is consistent with the evidence and the
repository's existing architecture.

Do not introduce abstractions merely because they appeared in an external
implementation.

If material uncertainty remains unresolved, do not silently present an
assumption as fact. State the uncertainty and constrain the implementation
accordingly.

## 6. Implement and clean up

Implement production code normally after obtaining sufficient evidence.

Add durable tests for behavior, contracts, invariants, or regressions where
appropriate.

Before finishing:

- remove temporary scripts, prototypes, fixtures, outputs, and investigation
  artifacts
- do not add a research report unless explicitly requested
- preserve only conclusions future maintainers genuinely need
- use a code comment, durable documentation, or an ADR only when the rationale
  has lasting value

The repository should contain the result of the investigation, not the
investigation process.
