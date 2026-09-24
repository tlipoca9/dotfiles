# Derivation Workflow

Use this reference for complex design work where the user wants the reasoning path to be reusable.

## Contents

- Convert the request into a design problem
- Separate outcome, mechanism, and delivery channel
- Research in layers
- Build a scenario matrix
- Inspect current production workarounds
- Derive a capability model
- Define rejection rules
- Find the right abstraction boundary
- Prefer plans over immediate side effects
- Use precise status semantics
- Keep UX simple while hiding internal complexity
- Make the implementation plan follow the abstraction
- Validate with real tests
- Use independent review
- Final design doc template

## 1. Convert The Request Into A Design Problem

Start by rewriting the request into:

- Desired user outcome.
- Operating environment.
- Known constraints.
- Non-goals.
- What counts as success.

Example pattern:

```text
Goal: make X work for Y users in Z environments.
Non-goals: A, B, C.
Hard constraints: production does/does not allow ...
Success: default path works with minimal user awareness; failures are explicit.
```

This prevents the conversation from optimizing a mechanism before the problem is defined.

## 2. Separate Outcome, Mechanism, And Delivery Channel

Many designs get confused because these are mixed:

- Outcome: what the user needs.
- Mechanism: how the system achieves it.
- Delivery channel: how the mechanism is deployed.

Keep them separate. A deployment channel can be swapped without changing the domain abstraction. A mechanism can be valid in one execution context and invalid in another.

## 3. Research In Layers

Research should answer different questions:

- Official docs: what is supported and stable?
- Real open-source projects: what works in practice?
- Existing production code: what is already proven or painful?
- Tests and bug reports: where are the edge cases?

For each source, write:

- What it does.
- What environment it assumes.
- Whether behavior is default, opt-in, fallback, or legacy.
- What it proves.
- What it does not prove.

Avoid source laundering: do not use evidence from one context to justify a stronger claim in another context.

Keep these research notes as working material. In a final design document, cite them with compact markers and move detailed source notes to the end. Do not turn this research checklist into the document's section order.

## 4. Build A Scenario Matrix

Create a matrix before proposing architecture.

Common axes:

- User type.
- Runtime or platform.
- Deployment mode.
- Lifecycle phase.
- Ownership boundary.
- Permission level.
- Failure mode.
- Rollback requirement.

The matrix reveals where a one-size-fits-all solution is fake. It also helps decide which complexity should be internal and which should be explicit to the user.

## 5. Inspect The Current Production Workaround

If a temporary production implementation exists, read it directly.

Classify findings:

- Proven shape: what form factor has already worked?
- Useful hack: what worked only because the environment is controlled?
- Fragile shortcut: what must not become formal design?
- Missing state: what the workaround cannot observe or report?
- Missing rollback: what cannot be safely undone?

Do not shame the workaround. Treat it as a trace of real constraints.

## 6. Derive A Capability Model

Before designing domain behavior, define what the system can actually do.

Common capabilities:

- Can read target state.
- Can write target state.
- Can execute inside the target environment.
- Can restart or reload processes.
- Can run before user workload starts.
- Can observe success.
- Can roll back.
- Owns the launcher or user entrypoint.

Designs should branch on capabilities, not on optimistic assumptions.

## 7. Define Rejection Rules

List approaches that are attractive but unsafe.

For each rejected approach, state:

- Why it seems useful.
- Which constraint breaks it.
- Whether it can remain as legacy compatibility, explicit fallback, or test-only behavior.

Good rejection rules reduce future regressions because they protect the design from rediscovering old traps.

## 8. Find The Right Abstraction Boundary

A robust abstraction usually appears after removing responsibilities from the wrong layer.

Use this checklist:

- Discovery should not decide domain policy.
- Domain targets should not know deployment transport details.
- Planning should be separate from mutation.
- Runtime hooks should be explicit and typed.
- Reports should explain results, not change behavior.
- Manifests should support rollback and audit, not become a random log.

When a class or component needs to know too much, split by responsibility.

## 9. Prefer Plans Over Immediate Side Effects

For production tools, design a plan/result model early.

A plan should include:

- Intended actions.
- Required capabilities.
- Expected status if applied.
- Files or resources touched.
- Runtime actions required.
- Verification method.
- Rollback metadata.

This makes dry-run, inspect, partial failure, and testing much easier.

## 10. Use Precise Status Semantics

Avoid vague success.

Good statuses often include:

- planned
- installed
- verified
- pending-refresh
- pending-restart
- pending-runtime-action
- skipped
- unsupported
- failed

Also record effect scope when relevant:

- current process
- new process
- next start
- unknown

If users could misunderstand a status, split it.

## 11. Keep UX Simple By Hiding Internal Complexity

A design can have many internal layers and still be easy to use.

Use:

- One simple default command.
- A few high-level profiles or presets.
- Human-readable summaries.
- Machine-readable JSON for automation.
- Clear next actions for pending states.

Do not expose raw capability flags to normal users unless they are debugging.

## 12. Make The Implementation Plan Follow The Abstraction

Implementation order should make invalid states hard:

1. Input parsing and normalization.
2. Core result/status model.
3. Manifest or rollback model.
4. Topology/context provider.
5. Planner interfaces.
6. Safe applier.
7. Hook/integration transport.
8. Domain-specific targets.
9. Verify/uninstall/report closure.
10. E2E tests.

If target-specific writes happen before result and rollback models exist, the design will drift toward ad hoc behavior.

## 13. Validate With Real Tests

Tests should mirror the scenario matrix.

Use:

- Unit tests for parsing, planning, status transitions, allowlists, and rollback entries.
- Integration tests for adapters and hooks.
- E2E tests for production-like topology.
- Regression tests for every rejected shortcut.

When possible, build reproducible environments with containers or local fixtures.

## 14. Use Independent Review

For complex designs, ask independent reviewers to analyze different aspects:

- Production topology and lifecycle.
- Core abstraction and state model.
- Real-world evidence and user experience.
- Security, rollback, and failure modes.
- Testability.

Ask reviewers for risks and alternative abstractions, not just approval.

Merge results by identifying repeated concerns and concrete conflicts. If multiple reviewers independently complain about the same abstraction, redesign it.

## 15. Final Design Doc Template

Use this structure:

```text
1. Goal
2. Non-goals
3. Current production context
4. Scenario and capability matrix
5. Rejected alternatives
6. Final abstraction model
7. Behavior by scenario
8. Status, report, and rollback model
9. Security and operability
10. Implementation phases
11. Test plan
12. Risks and migration notes
13. 证据注释与参考资料
```

The doc should read like a trail of decisions, not a pile of conclusions or source excerpts. Use inline markers such as `[E1]` only where traceability matters, then put the supporting paths, symbols, tests, logs, or upstream links in the final evidence notes.

## Example From The CA Trust Conversation

The original conversation started with Linux custom CA trust injection. The final CA-specific design was not the reusable part. The reusable part was the path:

1. Start from user outcome: make user programs trust a gateway CA.
2. Exclude unrelated spaces: pinning, kernel-level TLS, distribution channel.
3. Research real projects and official docs.
4. Compare mechanisms by scenario.
5. Inspect the production sidecar workaround.
6. Discover the real constraint: upper/work without merged view.
7. Reject fragile shortcuts: patch certifi, append generated bundles, hard-coded browser restarts.
8. Split topology from target logic.
9. Define capability-driven execution contexts.
10. Move from a broad "trust profile" to context-driven target plans.
11. Add typed hooks, precise statuses, manifest, and report.
12. Evaluate extensibility, cognitive load, and usability.

Apply the same derivation path to other domains.
