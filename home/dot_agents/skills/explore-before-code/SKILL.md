---
name: explore-before-code
description: Investigate implementation uncertainty before writing production code. Use when the correct design or behavior cannot be established from the current repository alone.
---

# Explore Before Code

Do not guess implementation details that can be established with evidence.

Use this skill when implementing a change depends on assumptions that cannot be proven from the current repository, including:

- unfamiliar APIs, protocols, libraries, or platform behavior
- uncertainty about whether an approach actually works
- functionality likely to have established community implementations
- behavior that depends on the OS, runtime, network, CLI, SDK, or external service
- architectural choices where existing implementations can provide useful evidence

Do not invoke this workflow for routine changes whose behavior and conventions are already clear from the repository.

## 1. Establish what is unknown

Inspect the relevant repository code first.

Identify the specific question that must be answered before implementation.

Do not broaden the investigation beyond what is necessary for the task.

## 2. Look for prior art

Before inventing a non-trivial implementation, check whether the problem already has established implementations.

Prefer evidence in this order:

1. standards and official documentation
2. upstream source code
3. mature open-source implementations
4. reputable technical references

Inspect actual source when implementation details matter. Do not rely on search snippets or summaries when the source is available.

The goal is not to copy code. The goal is to understand established behavior, constraints, failure modes, and common design patterns.

## 3. Resolve empirical uncertainty experimentally

If the question is "does this actually work?", prefer an executable experiment over further speculation.

Use the smallest practical mechanism, such as:

- a temporary script
- a minimal program
- an existing CLI
- `curl`
- `openssl`
- `git`
- `docker`
- `kubectl`
- system inspection tools
- a disposable local environment

Experiments should answer one concrete question.

Do not add production abstractions, tests, error handling, or generality to exploratory code.

Prefer temporary locations outside the repository. If repository context is required, remove exploratory artifacts when the question is answered.

Uncertainty that can be resolved experimentally should be resolved experimentally, not by reasoning harder.

## 4. Implement from evidence

Once the relevant uncertainty is resolved:

- choose the simplest design consistent with the evidence
- adapt it to the repository's existing architecture and conventions
- implement production code normally
- add durable tests for behavior or regressions where appropriate

Do not preserve research or prototype machinery merely because it was useful during implementation.

## 5. Leave only durable results

Before finishing:

- remove temporary scripts, prototypes, fixtures, outputs, and investigation artifacts
- do not create research reports unless explicitly requested
- preserve externally discovered knowledge only when future maintainers genuinely need it
- use code comments, documentation, tests, or ADRs only when the information has lasting value

The repository should contain the result of the investigation, not the investigation process.
