---
name: evidence-driven-review
description: >-
  Use for code review, design review, validation, or diagnosis when the expected
  output is findings, risks, or a confidence-calibrated conclusion. Review the
  proposed claim and changed scope; do not mutate code or external state unless
  the request explicitly includes a fix.
---

# Evidence-Driven Review

Produce high-precision findings. Do not manufacture criticism to make the review
look useful.

## 1. Set the review baseline

Identify:

- the exact change, decision, or failure claim being reviewed;
- intended behavior and behavior that must remain unchanged;
- the relevant environment, version, branch, and time boundary;
- the evidence layer required to validate the claim.

Read the diff or proposal first, then only the callers, callees, tests,
configuration, schema, migrations, and runtime evidence needed to trace its causal
path.

## 2. Finding contract

Report a finding only when the available evidence supports all of these:

- **Location**: the changed line, section, decision, or boundary responsible.
- **Trigger**: a concrete reachable input, state, ordering, failure, or environment.
- **Impact**: an observable correctness, security, data, compatibility, resource,
  or operational consequence.
- **Causal path**: why the current change necessarily or reproducibly causes it.
- **Evidence**: code path, contract, test, reproduction, trace, log, or benchmark.
- **Correction direction**: the smallest viable way to remove the defect.
- **Confidence**: high or medium; low-confidence concerns are questions or residual
  risks, not findings.

A finding must be introduced, exposed, worsened, or made relevant by the proposed
change. Do not report unrelated pre-existing problems.

## 3. Classify precisely

Keep these distinct:

- **Defect**: evidence establishes a reachable material failure.
- **Risk**: a plausible material failure remains unresolved because required
  evidence is unavailable.
- **Question**: intent or contract is ambiguous and changes the judgment.
- **Optional improvement**: style, maintainability, or preference without a
  demonstrated material defect.

Only defects belong in the main findings list. No material findings is a valid
review result.

Use the repository's severity scale when one exists. Otherwise assign the smallest
severity justified by actual impact and reachability; do not inflate severity from
hypothetical scale or future usage.

## 4. Route evidence to the claim

| Claim | Primary evidence | Do not substitute |
|---|---|---|
| Public behavior or product semantics | Approved contract and observable customer path | Current table or code shape |
| End-to-end behavior | Real entry point in the intended environment | Unit tests or mocked demos |
| Service collaboration | Integration or contract test at that boundary | Top-level E2E alone |
| Internal invariant | Focused unit/component test and code inspection | A broad slow suite |
| Performance | Reproducible benchmark with commit, config, load, success rate, latency, and comparison | Anecdote or one successful request |
| Failure cause | Reproduction, trace, logs, current config, and causal code path | Agent consensus or generic explanation |

Do not promote a lower-layer result into a stronger claim.

## 5. Output

Order findings by severity. For each finding, give:

1. severity and confidence;
2. exact location;
3. trigger and impact;
4. concise causal explanation and evidence;
5. minimal correction direction.

Then state unresolved questions or residual risks separately. If no defect meets
the finding contract, say so and briefly name the reviewed scope and evidence.
