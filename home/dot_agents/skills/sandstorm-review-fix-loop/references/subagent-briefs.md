# Subagent dispatch briefs

Use these minimal briefs with Paseo (`create_agent`) or native subagents. Follow the `paseo` skill for profile/provider selection (`list_profiles` first) and wait on `notifyOnFinish: true`. For local MySQL/container tooling, follow `local-machine-environments`.

## Roles

- **Coordinator (this session)**: high-reasoning architect owning trajectory tracking, module-level redesign/triage, circuit breakers, Cold-Read diff audits, commits, and safe history compression against base.
- **Reviewer (fresh clean context, read-only)**: executes `sandstorm-review` with zero prior bias.
- **Fixer (fresh clean context, write-enabled)**: implements the coordinator's triaged plan under `subtraction-design.md`; never commits or pushes.

## Clean-context Reviewer brief

```text
Perform a clean-context, read-only review of branch `<branch>` (HEAD `<head_sha>`, baseline `<base_ref>` at merge-base `<merge_base_sha>`) in `<repo_path>`.

1. Read and follow `~/.agents/skills/sandstorm-review/SKILL.md` and its references in full (including commit-trajectory auditing and 4-lens sharding when triggered).
2. Write the full draft report outside the repository to `<external_report_path>`.
3. Strict read-only: keep repository files, git history, and Gongfeng untouched.
4. Return only a concise summary: clickable report link, recommendation (`MERGE_READY` or `CHANGES_REQUESTED`), `P0`/`P1`/`P2` counts, one-line bullets per blocking finding, top subtraction candidates, and unverified checks.
```

## Clean-context Fixer brief

Pass only one self-contained module's approved plan—never dump an untriaged cross-domain review report into a single fixer.

```text
Implement the coordinator-approved convergence plan for Round <N> (<module_or_domain>) on branch `<branch>` (HEAD `<head_sha>`) in `<repo_path>`.

Module contract & file scope (keep working set minimal):
- Exposed contract to uphold (interface, invariants, error semantics): <contract summary or interface pointer>
- Owned files/packages you may edit: <explicit file/package list>
- Outside this scope: rely on exposed contracts only; do not edit or load unrelated module internals unless verifying a direct caller contract.

Design contract:
1. Read and strictly follow `~/.agents/skills/sandstorm-review-fix-loop/references/subtraction-design.md`.
2. Primitive budget: <0 new coordination/persistence primitives | explicit approved list>.
3. Stop-and-escalate: if closing an item cleanly requires breaking the primitive budget or colliding with an earlier constraint, stop on that item and return 2–3 concrete options (subtraction / accepted boundary / justified addition) instead of improvising a workaround.

Approved plan (execute ONLY these items):
- [redesign] <module, chosen minimal shape, what disappears>
- [subtract] <mechanism/optimization/layer to delete or collapse>
- [boundary] <doc/comment location and exact Accepted Boundary>
- [invariant-fix] <owning layer, minimal fix, sibling symmetry check>

Explicitly deferred (leave untouched):
- <deferred P2 items>

Verification and handoff:
- Run targeted `-race` tests, real MySQL checks via local container (per `local-machine-environments`) if SQL/migrations/runbook SQL changed, cold-cache module lint (`GOLANGCI_LINT_CACHE` in a temp dir), web checks if `web/` changed, and `git diff --check`. Clean up all temporary containers and caches.
- Leave `git commit` and `git push` to the coordinator.
- Close with the 5-line Pre-handoff self-audit from `subtraction-design.md` plus exact verification commands and outcomes.
```
