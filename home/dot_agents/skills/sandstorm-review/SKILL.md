---
name: sandstorm-review
description: Review Tencent Cloud AgentRuntime sandstorm changes against the develop baseline with terminal-state design convergence analysis. Use for sandstorm MR or branch reviews, deep code review, design review, compatibility review, or requests to assess the complete current implementation. Keep the result as a draft unless the user explicitly asks to post comments.
---

# Sandstorm review

Produce a review that answers whether the current branch has converged on the intended terminal design and can be merged safely. Treat `develop` at the merge-base as the pre-change baseline. Review the current branch as a complete implementation, then attribute each finding to the baseline, the current change, an incomplete fix, or an unverified environment.

This skill is for `agentrun/sandstorm` and closely coupled E2E changes. It does not implement fixes. When the user asks to fix review comments, use the repository's fix-review or implementation workflow instead.

## Operating rules

- Read [`references/workflow.md`](references/workflow.md) before reviewing.
- Read repository `AGENTS.md`, `README.md`, relevant `.review/` rules, domain documents, and project review skills before drawing conclusions.
- Preserve unrelated working-tree changes. Use a detached worktree or temporary checkout for experiments and tests when needed.
- Treat the following as merge-blocking defects even when a new feature or gray flag is disabled by default:
  - terminal-state convergence defects (duplicate paths, conflicting state models, unnecessary compatibility layers, incomplete migrations, split responsibilities, avoidable call-chain/layer bloat from stacked patches, or brittle over-complex tests coupled to internal scaffolding)
  - default-config regressions on always-on shared paths, asymmetric protection across flag/degradation quadrants, or key-normalization blind spots against legacy rows
  - concurrency liveness defects, unsafe retry/CAS exhaustion fallback returns, or uncompensated post-commit cache invalidations that can fail-open after recovery
  - unbounded steady-state growth, unindexed or table-scanning runtime/runbook SQL, or split multi-branch queries missing a shared read-only snapshot (`TX-09`)
  - bidirectional authority-vs-projection drift
- Separate engineering standards from product and domain contract review. A style concern without a behavior or maintainability impact is not a blocking finding.
- Do not stop early after finding 1–2 high-confidence defects; complete every applicable review lens and verification step.
- Use the user's language for the review. Keep code identifiers, API names, and quoted evidence unchanged.
- Keep external mutations disabled by default. Create Gongfeng comments only after the user explicitly asks to post or submit the review.

## Execution model and lenses

Use one entry point for all modes (main repository, E2E when coupled, and design convergence always included). Detailed domain checklists are split into four failure-mode lenses under `references/`:

- [`references/lens-fallback-and-concurrency.md`](references/lens-fallback-and-concurrency.md) — concurrency liveness, fence writer inventory, CAS/retry exhaustion return contracts, post-outage cache resurrection, and flag × health protection symmetry.
- [`references/lens-sql-and-capacity.md`](references/lens-sql-and-capacity.md) — hot-tenant baseline envelope, full runtime + runbook SQL `EXPLAIN` and lock analysis, generated-column traps, `TX-09` snapshot atomicity, and steady-state reclamation.
- [`references/lens-rollout-and-compat.md`](references/lens-rollout-and-compat.md) — default-config blast radius, producer/cleaner symmetry, legacy key normalization, rolling mixed-version compatibility, and rollout/schema doc cross-checks.
- [`references/lens-state-and-contract.md`](references/lens-state-and-contract.md) — terminal-state convergence, bidirectional authority-vs-projection lag matrix, business data-flow chain, and API/UI/E2E contracts.

**Scale-triggered sharding**:
- For small, focused changes (< 20 non-test files and < 3 high-risk domains), load only the applicable lens files in the main review session.
- For large changes (≥ 20 non-test files, or spanning ≥ 3 domains across DB/SQL, Redis/concurrency, rollout/hot-paths, and runbooks/UI), complete baseline modeling first, then fan out 3–4 clean-context read-only subagents in parallel—one per applicable lens—and synthesize + falsify their findings in the main session.

## Completion criteria

A review is complete when it includes the baseline and current HEAD, the intended terminal state, an impact map, findings across all applicable lenses with severity and attribution, evidence from meaningful verification (and exact skip reasons for blocked checks), and a merge recommendation.

Use [`references/report-template.md`](references/report-template.md) for the final draft or Gongfeng overview.
