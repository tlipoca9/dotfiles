# DeepSeek Harness operating rules

The coordinating agent owns the current parent worktree. For independent work
that changes files, call `delegate_worktree`; do not use the ordinary `subagent`
tool for write work. Each delegated worker receives a separate Git worktree and
branch, and must commit its intended changes there.

Review the returned branch with `worktree_status`. Only the coordinating agent
may call `merge_worktree`, and only after the parent worktree is clean. Keep
conflicts in the parent visible for resolution. Call `cleanup_worktree` only
after a successful merge, or with `force: true` when deliberately discarding a
worker's branch.

The parent agent may still make direct edits when coordinating or resolving a
merge. The isolation rule applies to delegated write operations.
