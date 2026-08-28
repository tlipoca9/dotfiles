---
name: contract-aware-change
description: >-
  Use when an engineering change can alter customer-observable behavior, a public
  API or resource model, identity or lifecycle, permissions, persistent data,
  compatibility, or user-visible failure semantics. Do not use for routine
  internal refactors or repairs that preserve externally observable behavior.
---

# Contract-Aware Change

Make the implementation serve an explicit observable contract instead of deriving
product meaning from the current code shape.

## 1. Establish the change contract

Before implementation, identify:

- one customer-observable result;
- the actor and product object involved;
- supported operations and object identity;
- lifecycle and state transitions;
- permissions and ownership;
- failure, retry, recovery, and deletion semantics;
- environment and compatibility boundary;
- evidence required to claim completion.

Keep this proportional. A small behavior-preserving repair does not require a new
product contract.

## 2. Separate two kinds of truth

### Normative truth: what should be

Use, in order:

1. the latest explicit decision in the current task;
2. an approved and still-active customer-observable contract;
3. stated scope, non-goals, protected behavior, and acceptance criteria.

### Descriptive truth: what is

Use, in order:

1. reproducible behavior in the intended environment;
2. real requests, traces, logs, and test results;
3. current code, configuration, schema, and deployment state;
4. current documentation and historical implementation.

Do not let one category overwrite the other. A mismatch between normative and
descriptive truth is a result to resolve, not a precedence dispute to hide.

## 3. Test whether a concept deserves a public surface

Do not expose an internal table, controller, runtime object, or implementation
mechanism as a product or API concept unless it has independent customer value,
such as its own:

- lifecycle or identity;
- user operation;
- permission or ownership rule;
- audit or recovery requirement;
- observable behavior or failure semantics.

Existing implementation is evidence of the current system, not proof of the right
public model.

## 4. Make compatibility explicit

Treat compatibility as three concrete lists:

1. externally observable behavior that must remain protected;
2. persistent data or clients that require migration or transition;
3. internal paths, fallbacks, or artifacts that may be removed.

Do not preserve accidental implementation shape under the label of compatibility.
Do not revive old fallbacks or extension points without a current requirement.

## 5. Implement and verify

- Choose the smallest design that satisfies the contract.
- Avoid speculative fields, resources, abstractions, and future extension points.
- Verify internal invariants with focused tests.
- Verify service boundaries with integration or contract tests.
- Verify the customer path through the real entry point in the intended environment
  when the claim is end-to-end.
- State exactly whether the change is implemented, locally verified, remotely
  verified, deployed, or merely proposed.

## Stop condition

Stop and request a decision only when an unresolved choice materially changes
public semantics, authorization, protected state, or irreversible impact and
cannot be recovered from current artifacts. Otherwise use the smallest reversible,
in-scope assumption and continue.
