# DeepSeek Harness operating rules

The coordinating agent owns the parent worktree. Keep it clean before calling
`delegate_worktree`; creation rejects dirty parent state. Each delegated worker
must edit and commit only in its assigned worktree and must not merge, rebase,
push, or recursively delegate writes.

Delegated branch and path ownership uses an irreversible short namespace derived
from the coordinating parent session id. `worktree_status`, `merge_worktree`,
and `cleanup_worktree` rederive and verify that namespace on every call. This
works after a DSH restart for the same session and rejects a different session;
process-local child records are never ownership authority.

Review with `worktree_status`. Merge only a clean delegated worktree into a clean
parent, explicitly through `merge_worktree`; leave conflicts visible in the
parent for resolution. After merge use `cleanup_worktree`. Cleanup is allowed
when the parent has unrelated dirty state, but without `force` it rejects dirty
or unmerged child work. Use `force: true` only for deliberate discard.

The complete model-facing Interface remains `delegate_worktree`,
`worktree_status`, `merge_worktree`, and `cleanup_worktree`. Git/path/status/
ownership behavior belongs in the adjacent deep Git module; `worktree.mjs`
contains only the DSH/Cordis adapter, child lifecycle, and result adaptation.
