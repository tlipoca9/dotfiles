# Review

Review the proposed change or claim against its intended behavior and current
evidence. For a review-only request, inspect and report; do not change code or
external state unless the user also authorizes a fix.

## Establish the boundary

Identify the requested outcome, behavior that must remain unchanged, relevant
environment and versions, and the observation layer needed to support the claim.
Use the user's latest decisions and applicable repository instructions to settle
intent before treating an apparent mismatch as a defect.

Obtain requirements from the user's request, accepted decisions, existing specs,
contracts, or relevant issue references when available. A dedicated specification,
issue, or issue-tracker setup is not a prerequisite. State any material assumption;
ask only when unresolved intent would change the judgment and available evidence
cannot settle it.

Choose a comparison that matches the requested scope:

| Scope | Baseline and evidence |
|---|---|
| Exact commit endpoints | Resolve both refs and use `git diff <before> <after>`; do not silently replace the earlier endpoint with a merge-base. |
| Branch changes since divergence | Resolve both refs and use `git diff <base>...<head>`; identify the merge-base and relevant commits. |
| Working-tree changes | Inspect `git diff --cached`, `git diff`, and relevant untracked file contents; use the combined tracked change against `HEAD` to understand the resulting behavior. |
| Selected changes within a dirty tree | Separate pre-existing changes from task changes; inspect an overlapping hunk together and state what is included in the conclusion. |
| Proposal, design, or failure claim | Identify the exact sections, decision, or reported behavior and the current system evidence against which it is judged. |

Confirm refs resolve before reviewing. An empty diff is a valid observation, not
a reason to invent findings. Do not claim untracked files were reviewed merely
because their names appeared in status output. Keep the comparison and reviewed
file versions stable; incorporate later edits before concluding.

Read the diff or proposal first, then inspect only the callers, callees, tests,
configuration, schemas, migrations, and runtime evidence needed to trace the
affected causal paths. Existing code is evidence of current behavior, not proof
that this behavior is the intended contract.

## Apply two complementary views

**Requirements and behavior:** Check whether the requested result is complete,
whether implementation matches the contract, whether added behavior exceeds the
authorized scope, and whether protected behavior and relevant failure paths hold.
Trace reachable inputs, state transitions, ordering, and boundary interactions.

**Engineering quality and repository standards:** Check applicable documented
rules, clear responsibilities, coupling, complexity, dependencies, and maintenance
cost in the changed area. A code smell is a prompt to inspect consequences, not a
defect or a prescription to introduce an abstraction. Do not demand extraction,
new types, polymorphism, or extra layers merely to fit a pattern.

Use both views to avoid overlooking either the wrong behavior or an unsound
implementation. Parallelize independent review slices when useful; fixed agent
counts and separate final reports are unnecessary. Check delegated conclusions
against the evidence, deduplicate them, and produce one coherent result.

## Require a finding contract

Report a defect only when the available evidence establishes all of the following:

- **Location:** The responsible changed line, section, decision, or boundary.
- **Trigger:** A concrete reachable input, state, ordering, failure, or environment.
- **Impact:** An observable correctness, security, data, compatibility, resource,
  or operational consequence.
- **Causal path:** Why this change causes, exposes, or worsens the consequence.
- **Evidence:** A contract, traced code path, test, reproduction, log, or benchmark
  sufficient to support that causal claim.
- **Correction direction:** The smallest viable change that removes the defect.
- **Confidence:** High or medium, with the remaining uncertainty stated precisely.

The issue must be introduced, exposed, worsened, or made relevant by this change.
Do not promote unrelated pre-existing problems into findings. Do not manufacture
criticism to make the review appear useful; no material findings is a valid result.

## Match evidence to the claim

| Claim | Primary evidence | Insufficient substitute |
|---|---|---|
| Public behavior or product semantics | Accepted contract and observable customer path | Current table or code shape alone |
| End-to-end behavior | Real entry point in the intended environment | Unit tests or mocked demonstrations |
| Service collaboration | Integration or contract checks at the affected boundary | A top-level E2E result alone |
| Internal invariant | Focused unit/component check and code inspection | An unrelated broad suite |
| Performance | Reproducible comparison with commit, configuration, load, success rate, and latency | Anecdote or one successful request |
| Failure cause | Reproduction, traces or logs, current configuration, and causal code path | Reviewer consensus or a generic explanation |

Use existing results when they cover the actual reviewed version and claim.
When new verification is needed and authorized, choose the smallest check capable
of disproving the claim at its relevant layer. Report what actually ran and what
was only inspected. Unavailable evidence limits the conclusion; it does not prove
either correctness or a defect. Never promote a lower-layer result into a stronger
claim.

## Classify and report

- **Defect:** Evidence establishes a reachable material failure and satisfies the
  finding contract. Only these belong in the main findings list.
- **Risk:** A plausible material failure remains unresolved because necessary
  evidence is unavailable. Explain the missing evidence and its significance.
- **Question:** Intent or contract is ambiguous in a way that changes the judgment.
- **Optional improvement:** A preference or maintenance suggestion without a
  demonstrated material defect. Include only when useful to the requested review.

A documented-standard deviation should cite the exact rule. If it lacks material
failure evidence, identify it separately as a standards deviation rather than
inventing a defect impact. Avoid repeating checks already established by tooling
unless that result itself is relevant to an unresolved issue.

Order defects by the repository's severity scale, or by the smallest severity
justified by actual impact and reachability. Do not inflate severity using
hypothetical future scale. For each, provide severity, confidence, exact location,
trigger, impact, concise causal evidence, and minimal correction direction.

State questions, residual risks, and useful standards deviations separately.
If no defect meets the contract, say so and name the reviewed scope, evidence,
and material limits. A review with no findings is not proof of behavior beyond
the layer or version actually examined.
