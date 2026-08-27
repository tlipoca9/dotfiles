---
name: gongfeng-development-loop
description: Run an Issue-backed development loop for substantive implementation, fixes, refactors, or behavior changes in repositories hosted on git.woa.com. Create or reuse a Gongfeng Issue, keep its current contract synchronized whenever the user adds, removes, or overturns a material decision, then commit, push, and create or update the corresponding Gongfeng PR/MR after validation. Do not use for read-only explanation, diagnosis without implementation, code review, or trivial local-only edits.
---

# Gongfeng Development Loop

Treat the Gongfeng Issue as the live, remote contract for the change. Keep its normative sections consistent with the latest user decisions; use the PR/MR to deliver the implementation of that contract.

## Use the Gongfeng connection

1. Confirm `origin` is hosted on `git.woa.com` and derive the project path from the remote URL.
2. Use the configured Gongfeng MCP at `https://git.woa.com/api/mcp/mcp` for Issue and PR/MR operations.
3. Discover the available Gongfeng tools and read the selected tool's parameter schema before calling it. Do not invent tool names or parameters. Required capabilities are Issue search/read/create/update and PR/MR search/read/create/update.
4. Never read, print, persist, or embed a Gongfeng token. If the MCP connection or required capability is unavailable, report the missing connection and stop at the remote-write boundary. Do not silently substitute browser automation or an ad-hoc REST client.

A user's request to implement, change, fix, or refactor code in a `git.woa.com` repository authorizes the normal loop: create/update the Issue, create a branch, commit, push, and create/update the PR/MR. Do not ask for redundant confirmation. It does not authorize force-push, merge, destructive history edits, or manual Issue closure.

## Establish the loop

1. Read repository instructions and inspect the current branch, worktree, default branch, remotes, and existing remote associations.
2. Search for an open Issue and PR/MR already associated with the current branch, an explicitly supplied Issue, or the same change. Reuse them; never create duplicates merely because the current session is new.
3. As soon as the repository and development intent are unambiguous, create an Issue if none exists. Open questions may remain, but label them explicitly.
4. Create a non-default branch using repository conventions. If none exist, use `codex/<type>-<short-slug>` where type is `feat`, `fix`, `refactor`, `docs`, or `chore`.
5. Record the Issue IID, URL, source branch, and target branch for the rest of the task.

The Issue body must remain a standalone snapshot with these sections:

```markdown
## Context
Why the change is needed and the relevant existing behavior.

## Goal
The outcome this change must produce.

## Current contract
- Current normative requirements, defaults, observable behavior, and failure semantics.

## Non-goals
- Explicit exclusions and compatibility boundaries.

## Acceptance criteria
- [ ] Verifiable outcomes.

## Verification
- Planned checks initially; replace or annotate them with actual results later.

## Decision log
- YYYY-MM-DD: concise record of material decisions and reversals.
```

Do not copy the whole conversation. Preserve only facts and decisions needed to implement, verify, review, and maintain the change.

## Maintain the synchronization invariant

Before continuing implementation after a material decision, synchronize the Issue. A decision is material when it changes any of the following:

- scope, commands, APIs, data model, or supported protocols;
- observable output, defaults, status handling, retries, timeouts, or errors;
- compatibility, security, authority, performance, or lifecycle constraints;
- acceptance criteria, required tests, rollout, or release behavior;
- an earlier decision through language such as “推翻”, “改成”, “不再”, “移除”, “必须”, “不限”, or “参考 … 的行为”.

For every material change:

1. Read the latest remote Issue first so external edits are not overwritten.
2. Update the normative snapshot to the new truth. Remove or rewrite superseded requirements; do not leave contradictory alternatives in `Current contract`.
3. Append one concise `Decision log` entry. For a reversal, state `old -> new` and the reason when known.
4. Reconcile affected non-goals, acceptance criteria, and verification steps.
5. Update the remote Issue and verify the returned Issue IID or URL before resuming implementation.
6. Briefly tell the user what was synchronized while continuing the task.

A comment alone does not satisfy synchronization because readers must be able to understand the current contract from the Issue body. Do not update the Issue for incidental implementation details that do not affect the contract.

If synchronization fails, preserve all local work and stop further implementation or delivery mutations until the connection is restored or the user explicitly waives Issue synchronization.

## Implement and verify

Implement against the current Issue contract and the repository's own development rules. Keep unrelated user changes intact.

Before delivery:

1. Run validation proportionate to the change, including repository-mandated generation, formatting, lint, unit, integration, or race checks.
2. Re-read the Issue and compare every acceptance criterion with the implementation and test evidence.
3. Update `Verification` with exact commands and outcomes. Record genuine environment-dependent gaps without presenting them as product failures.
4. Resolve any contract drift before committing. Never make the Issue describe behavior the code does not implement.

## Deliver through PR/MR

1. Inspect staged and unstaged changes and exclude unrelated files.
2. Commit using repository conventions; otherwise use a Conventional Commit title.
3. Push the source branch without force.
4. Search for an open PR/MR with the same source and target branches.
   - If one exists, update its title or description when the contract or evidence changed.
   - Otherwise create one through Gongfeng MCP.
5. Make the PR/MR description standalone and include:
   - a concise summary of the implemented outcome;
   - the linked Issue and a supported closing reference such as `Closes #<iid>` when the project supports it;
   - exact validation performed and its results;
   - known gaps, external failures, or follow-up work;
   - compatibility or security notes that reviewers must evaluate.
6. Verify the returned PR/MR IID, URL, source branch, target branch, and open state.
7. Return the Issue link, PR/MR link, branch, commit, validation summary, and unresolved gaps to the user.

Do not merge the PR/MR or manually close the Issue. Let the platform close the Issue on merge when the closing reference is supported.

## Completion criteria

Finish only when all of these are true:

- exactly one Gongfeng Issue represents the latest non-contradictory contract;
- every material decision and reversal from the task is reflected in that Issue;
- implementation and validation evidence match the acceptance criteria;
- the branch and commit are pushed;
- exactly one open PR/MR delivers the branch and references the Issue;
- the user receives verified remote links and any honest validation gaps.
