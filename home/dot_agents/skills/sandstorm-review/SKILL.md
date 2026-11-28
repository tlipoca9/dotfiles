---
name: sandstorm-review
description: Review Tencent Cloud AgentRuntime sandstorm changes against the develop baseline with commit-by-commit trajectory auditing and terminal-state design convergence analysis. Use for sandstorm MR or branch reviews, deep code review, design review, compatibility review, or requests to assess the complete current implementation. Keep the result as a draft unless the user explicitly asks to post comments.
---

# Sandstorm review

Judge whether the current branch has converged on a minimal, readable, and safe terminal design ready to merge. Treat `develop` at the merge-base as the pre-change baseline. Inspect **both** the commit trajectory (`merge-base..HEAD`, treating each commit as one iteration round) and the complete current implementation, then attribute each finding accurately.

This skill is read-only for `agentrun/sandstorm` and coupled E2E changes. For iterative review-and-fix execution, use `sandstorm-review-fix-loop`.

## Priority order

Apply judgment in this order so thoroughness never turns into over-engineering:

1. **Hard invariants (blocking `P0`/`P1`)**: correctness, data integrity, security/billing/isolation gates, concurrency liveness, SQL index/lock safety, `TX-09` snapshot atomicity, default-config shared-path regressions, and bidirectional authority-vs-projection drift.
2. **Terminal convergence & readability (blocking when severe, else `P2`)**: single owning seams, small state spaces, deletion of dead/duplicate paths or disproportionate machinery, honest contracts, and compact contract-focused tests.
3. **Accepted boundaries & low-value polish (non-blocking)**: honor explicitly documented `Accepted Boundaries` and keep low-value `P2` polish non-blocking.

## Operating rules

- Read [`references/workflow.md`](references/workflow.md) before reviewing.
- Read repository `AGENTS.md`, `README.md`, relevant `.review/` rules, domain documents, and project review skills before drawing conclusions.
- Preserve unrelated working-tree changes; use a detached worktree or temporary checkout when experiments need edits.
- Audit the commit trajectory (`merge-base..HEAD`) by default so stacked-patch churn and complexity inflation stay visible even in a clean context.
- Complete every applicable lens and verification step; finding 1–2 defects early is not a stopping point.
- Use the user's language for the review, keeping code identifiers, API names, and quoted evidence unchanged.
- Keep external mutations disabled by default; post Gongfeng comments only when explicitly requested.

## Execution model and lenses

All reviews include commit-trajectory auditing, terminal-state convergence, and coupled E2E when touched. Domain checklists live in four lenses under `references/`:

- [`references/lens-fallback-and-concurrency.md`](references/lens-fallback-and-concurrency.md) — liveness, fence writers, CAS/retry exhaustion contracts, post-outage recovery, flag × health symmetry, and primitive proportionality.
- [`references/lens-sql-and-capacity.md`](references/lens-sql-and-capacity.md) — hot-tenant scale envelope, runtime + runbook SQL `EXPLAIN`/locks, generated-column traps, `TX-09` snapshots, and steady-state reclamation.
- [`references/lens-rollout-and-compat.md`](references/lens-rollout-and-compat.md) — default-config blast radius, producer/cleaner symmetry, legacy key normalization, mixed-version rollout, and runbook cross-checks.
- [`references/lens-state-and-contract.md`](references/lens-state-and-contract.md) — terminal-state convergence, cold-read readability, subtraction audit, test signal-to-noise, bidirectional lag matrix, business flow, and API/UI/E2E contracts.

**Scale-triggered sharding**:
- **Focused** (`< 20` non-test files and `< 3` high-risk domains): load only the applicable lenses in the main session.
- **Large** (`>= 20` non-test files, or spanning `>= 3` domains): build the Step 3 shared model first, fan out 3–4 clean-context read-only subagents in parallel (one per applicable lens), and synthesize + falsify findings in the main session. Every lens audits proportionality and test simplicity inside its own domain.

## Completion criteria

Write the full draft report outside the target repository using [`references/report-template.md`](references/report-template.md), and return only a concise chat summary with the clickable file link, recommendation, `P0`/`P1`/`P2` counts, one-line bullets per blocking finding, subtraction candidates, and unverified checks.
