---
name: git-worktree-delegation
description: Delegate file-changing work safely with native Git worktrees. Use when a coordinator needs an isolated writer branch, manual review and merge, and deliberate cleanup without custom worktree plugins.
---

# Git worktree delegation

Use this instruction-only workflow from the coordinating parent repository. All
worktree lifecycle operations use native Git commands.

The former custom plugin's session ownership and namespace enforcement are gone.
Native Git does not know which agent or session owns a worktree. Before every
handoff, review, merge, or removal, manually verify both the absolute worktree
path and its checked-out branch. Never trust a remembered path or branch name
without comparing it with Git's current state.

## 1. Prepare a clean coordinating parent

Run these commands in the parent worktree:

```sh
git rev-parse --show-toplevel
git branch --show-current
git status --porcelain=v1
git worktree list --porcelain
```

Do not delegate while `git status --porcelain=v1` prints anything. Record the
parent's absolute repository path and current branch. Choose a unique, readable
branch name and a unique absolute path that is outside the parent worktree, then
create both atomically from the intended parent `HEAD`:

```sh
git worktree add -b agent/<unique-task-id> /absolute/path/to/worktrees/<unique-task-id> HEAD
```

If either name already exists, choose a different unique identifier; do not
reuse or take over an existing worktree.

## 2. Give the writer a complete bounded prompt

Provide the writer with:

- the complete task, relevant constraints, and acceptance criteria;
- the exact absolute worktree path and expected branch;
- the files or repository areas it may change;
- every required verification command; and
- the requirement to commit all intended changes before returning.

State the boundary explicitly: all reads that lead to edits, writes, generated
files, and Git commands must stay inside the assigned absolute worktree. Require
the writer to begin by checking:

```sh
git -C /absolute/path/to/worktrees/<unique-task-id> rev-parse --show-toplevel
git -C /absolute/path/to/worktrees/<unique-task-id> branch --show-current
git -C /absolute/path/to/worktrees/<unique-task-id> status --short --branch
```

The reported top-level path and branch must exactly match the assignment. The
writer must commit its work, report the commit and checks, and must not merge,
rebase, push, or alter the coordinating parent.

## 3. Inspect from the parent

After the writer returns, stay in the coordinating parent and manually verify
the registration, path, branch, and cleanliness:

```sh
git worktree list --porcelain
git -C /absolute/path/to/worktrees/<unique-task-id> rev-parse --show-toplevel
git -C /absolute/path/to/worktrees/<unique-task-id> branch --show-current
git -C /absolute/path/to/worktrees/<unique-task-id> status --short --branch
```

Reject the handoff if the absolute path or branch differs from the recorded
assignment, or if the writer worktree is dirty. Review the branch's commits and
complete diff against the current clean parent:

```sh
git log --oneline --decorate --graph HEAD..agent/<unique-task-id>
git diff --stat HEAD...agent/<unique-task-id>
git diff HEAD...agent/<unique-task-id>
```

Run the required checks yourself when appropriate. Do not merge merely because
the writer reported success.

## 4. Merge only in a clean parent

Recheck the parent immediately before merging:

```sh
git status --porcelain=v1
git branch --show-current
git merge --no-ff agent/<unique-task-id>
```

Do not start the merge unless the status output is empty and the current branch
is the recorded parent branch. Perform the merge only in the parent worktree.
If Git reports conflicts, stop and leave the conflict state visible. Inspect it
with `git status`, then resolve, stage, and commit the resolution only in the
parent; never resolve merge conflicts in the delegated worktree.

## 5. Remove only after merge, or explicitly discard

After a successful merge, confirm that Git considers the delegated branch
merged before cleanup:

```sh
git branch --merged HEAD
git worktree remove /absolute/path/to/worktrees/<unique-task-id>
git branch -d agent/<unique-task-id>
git worktree list --porcelain
```

Use normal removal so dirty or unsafe state is rejected. Use forced removal and
branch deletion only when deliberately discarding the delegated work after
explicitly deciding it is no longer needed:

```sh
git worktree remove --force /absolute/path/to/worktrees/<unique-task-id>
git branch -D agent/<unique-task-id>
```

Forced cleanup is destructive. Before using it, repeat the manual absolute-path
and branch verification and inspect the status, log, and diff one final time.
