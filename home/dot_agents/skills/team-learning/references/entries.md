# Knowledge entries and indexes

Use only the fields needed to make the knowledge actionable and assessable.

## A durable entry

Title: Preserve read-failure semantics

Read when: Adding a default result or fallback after a data read.

Understanding: Keep an unsuccessful read distinguishable from a successful
read with zero results. Use an explicit recovery only when the operation's
contract establishes that the recovered result is valid.

Scope: A read whose callers use an empty result as evidence that no records
exist. An explicitly best-effort display may have a different contract.

Evidence: Link the relevant contract or primary source. If verified by a check,
describe the input, observation, and limit of that check without copying the
entire command transcript. Label a proposed method as a hypothesis until its
support is established.

## A useful index pointer

- Read failure semantics — before replacing a failed lookup with an empty
  collection or a default object, read [the relevant entry](#a-durable-entry).

An index may link to another INDEX.md when its branch has several distinct
topics. The parent describes when to enter that branch; the child routes to the
appropriate leaves. Keep each substantive rule in one authoritative entry.

## Promotion and correction

Personal application notes may record a role-specific blind spot and link to
the shared rule. Promote the reusable body once; update links rather than
cloning it. For a correction, replace the obsolete claim with current scoped
knowledge and the supporting evidence. Preserve historical discussion only
when it is necessary to understand an enduring decision.
