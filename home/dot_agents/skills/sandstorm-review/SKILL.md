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
- Treat terminal-state design issues as merge-blocking defects when they leave duplicate paths, conflicting state models, unnecessary compatibility layers, incomplete migrations, or responsibilities split across old and new implementations.
- Separate engineering standards from product and domain contract review. A style concern without a behavior or maintainability impact is not a blocking finding.
- Use the user's language for the review. Keep code identifiers, API names, and quoted evidence unchanged.
- Keep external mutations disabled by default. Create Gongfeng comments only after the user explicitly asks to post or submit the review.

## Review modes

Use one entry point for all modes.

- Main repository review checks the sandstorm service and its callers.
- E2E review is enabled when the change includes the E2E repository or test harness. Check whether the suite actually executes the intended matrix and assertions.
- A design-convergence review is always included. It compares the complete current branch with `develop`, even when the user asks about a narrow diff.

## Completion criteria

A review is complete when it includes the baseline and current HEAD, the intended terminal state, an impact map, the business data-flow chain, compatibility and capacity analysis, evidence from meaningful verification, findings with severity and attribution, and a merge recommendation. If the environment prevents a check, state the command and the exact reason it was skipped.

Use [`references/report-template.md`](references/report-template.md) for the final draft or Gongfeng overview.
