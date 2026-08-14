# Git worktree delegation

Use this workflow whenever a delegated agent will modify files:

1. Make the coordinating parent worktree clean. `delegate_worktree` rejects
   creation otherwise. Send the complete task, constraints, and checks.
2. Treat the returned absolute path and branch as owned by this parent session.
   Their irreversible short namespace is revalidated on every later operation;
   the same session can recover after restart, while another session is refused.
3. Require the worker to commit without merging, rebasing, pushing, or starting
   another writer. Inspect the handoff with `worktree_status`.
4. Merge an accepted clean branch with `merge_worktree` while the parent is
   clean. If Git reports a conflict, leave it visible and resolve in the parent.
5. Run `cleanup_worktree` after merge. Parent dirtiness does not block cleanup,
   but dirty or unmerged child state is refused unless `force: true` deliberately
   discards it.

The four-tool Interface is complete: `delegate_worktree`, `worktree_status`,
`merge_worktree`, and `cleanup_worktree`. Ordinary `subagent` shares the parent
cwd and is not a replacement for isolated write delegation.
