# Git worktree delegation

Use this workflow whenever a delegated agent will modify files:

1. Keep the parent worktree clean and call `delegate_worktree` once per
   independent implementation task. Include the full task, constraints, and
   verification expectations in the prompt.
2. Treat the returned `worktree_path`, branch, and child result as the worker's
   handoff. The worker must commit its changes; it must not merge, rebase, push,
   or start another subagent.
3. Call `worktree_status` before accepting the handoff. Review the diff and
   tests from the parent context.
4. Call `merge_worktree` explicitly for an accepted branch. If it reports a
   conflict, resolve it in the parent worktree and verify again.
5. Call `cleanup_worktree` after a successful merge. Use `force: true` only for
   an intentional discard.

The ordinary `subagent` tool inherits the parent's cwd and is not a substitute
for `delegate_worktree` when the child writes code.
