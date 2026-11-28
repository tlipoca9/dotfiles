---
name: sandstorm-review-fix-loop
description: Orchestrate iterative review-and-fix loops on agentrun/sandstorm branches using subtraction-first architecture so reliability emerges naturally from readable, minimal designs. Use for sandstorm review-fix loops, /goal LOOP convergence runs, or multi-round hardening after sandstorm-review findings.
---

# Sandstorm review-fix loop

Optimize for **real architectural simplicity**, not patch survival. When state space shrinks and a module reads effortlessly, reliability follows naturally.

Branches entering this loop often already carry multiple commits against `develop`. Treat the branch as a clean-slate deliverable: simplify whole modules instead of layering patches, and compress intermediate commit noise against the base so each review round focuses on signal.

## Operating stance

- Read [`references/subtraction-design.md`](references/subtraction-design.md) before designing fixes and [`references/subagent-briefs.md`](references/subagent-briefs.md) before dispatching clean-context subagents.
- **Coordinate as an architect**: keep the coordinator on a high-reasoning model, cluster related findings into module-level simplifications, and pass only triaged plans to fixers.
- **Gate exit on `P0`/`P1` and severe bloat only**: fix a `P2` only when it deletes code, simplifies a seam, or closes a concrete operational/SQL risk cheaply; defer marginal `P2` polish.
- **Respect circuit breakers**: when any breaker trips, stop adding code and present 2–3 concrete options to the user—even inside a `/goal` run.
- **Scoped local git history**: this workflow authorizes scoped local round commits and safe local commit compression against `<merge-base>` (details in Step 5). Remote `git push` still requires an explicit user request.

## Loop workflow

### 1. Snapshot trajectory, align `spec.md`, & decide Pass 0

Inspect `merge-base..HEAD` (`git log --reverse --stat <merge-base>..HEAD`), locate the feature's `spec.md` (auto-check `.scratch/*/spec.md` or any MR-linked spec), and maintain a **coordinator-owned cross-round ledger** (never reset breaker counts even if git commits are later compressed):

- Commit count, prod vs. test net churn, and hot production/test files.
- Inventory of newly added coordination primitives and heavy test scaffolds vs. `spec.md`'s **Primitive Budget** and **Accepted Boundaries**.

**Pass 0 (spec alignment & immediate subtraction pass)**:
- If `spec.md` already defines `Primitive Budget` and `Accepted Boundaries`, use it as the default primitive budget and boundary authority; run a clean-slate subtraction pass first whenever the branch already exceeds budget or carries tangled churn.
- **Legacy or spec-less branches**: if no `spec.md` exists—or an older `spec.md` lacks budgets/boundaries or has drifted from the code—present a one-page bloat ledger plus proposed removals and `Accepted Boundaries` for user sign-off before editing code, record the approved truth back into `spec.md` (or the module's runbook), and then run Pass 0 subtraction.

Completion criterion: baseline SHA, HEAD SHA, aligned `spec.md`/boundary authority, hot-file sizes, and primitive/test-scaffold counts are recorded.

### 2. Run a clean-context `sandstorm-review`

Dispatch a fresh, read-only reviewer using [`references/subagent-briefs.md`](references/subagent-briefs.md). Wait via completion notification (`notifyOnFinish: true` in Paseo).

Completion criterion: a fresh draft report exists outside the repository with `P0`/`P1`/`P2` counts, commit trajectory, and subtraction candidates.

### 3. Cluster, triage, and check circuit breakers

Read the full report and inspect the cited code yourself:

1. **Lock module contracts & cluster before triaging**: first confirm each affected module's exposed contract (interface, invariants, error semantics). When `>= 2` findings tangle inside the same module, merge them into one **Clean-Slate Module Redesign** (compare 2 simpler shapes per [`references/subtraction-design.md`](references/subtraction-design.md), preferring deletion of low-value optimizations and splitting orthogonal state into self-contained modules).
2. **Assign one disposition** to each module cluster or standalone finding:
   - `subtract`: delete a low-value optimization, collapse layers/state machines, or split/redesign into self-contained modules with narrow contracts.
   - `boundary`: record an explicit `Accepted Boundary` in `spec.md` (when present) and runbook/docs, and align overstated comments instead of adding runtime state.
   - `invariant-fix`: minimal, readable fix inside the single owning module with symmetric sibling coverage.
   - `defer`: non-blocking `P2` left untouched with brief rationale.
3. **Evaluate the four Circuit Breakers** below. If any trips, jump straight to **Escalation**.

Completion criterion: module contracts are settled, every finding has a disposition (or module redesign cluster), and zero unresolved circuit breakers remain.

### 4. Dispatch scoped, clean-context subtraction fixers

Divide and conquer fix execution so every fixer holds its entire target cleanly in working memory—never dump a large cross-domain finding list into one overloaded fixer:

- Partition approved work by **self-contained module / disjoint file scope** (run disjoint trees such as backend modules and `web/` in parallel; sequence modules that share a changed contract only after locking the contract).
- Dispatch each fresh write-enabled fixer using [`references/subagent-briefs.md`](references/subagent-briefs.md) with:
  - Its explicit **module contract & file scope** plus only its approved redesign/disposition items.
  - An explicit **primitive budget** (default: `0` new coordination or persistence primitives).
  - Explicit authority to **stop and return trade-off options** if solving an item cleanly requires breaking the primitive budget or colliding with an earlier constraint.
  - Required behavior verification for its scope (plus integrated verification in the coordinator when multiple fixers ran) and **no git commit**.

Completion criterion: fixer returns with passing verification and its 5-line self-audit, or stops early with an explicit trade-off escalation.

### 5. Cold-read audit, commit, and compress history

Before committing, inspect `git diff --stat` and the actual diff of every core file changed:

- **Cold-read & complexity gate**: verify the changed module passes the Cold-Read Test and primitive budget in [`references/subtraction-design.md`](references/subtraction-design.md). Reject unapproved primitives, stealth state machines, or bloated white-box tests (Test Complexity Alarm) and redirect to simplification.
- **Verification & honesty gate**: confirm checks ran after the final edit, temporary containers/files are gone, and `spec.md` (when present), runbooks, and comments reflect every approved `subtract` or `boundary` decision honestly so the next clean-context review reads the live truth.
- **Scoped commit**: stage only task files and create a clean round commit.
- **Two-stage commit compression against base**:
  - *During regular convergence rounds (`R1 → R2 → R3`)*: keep one commit per fix round so the next clean-context `sandstorm-review` can still observe churn slope and patch-breeding chains directly in `git log`.
  - *After Pass 0 / a Clean-Slate Module Redesign, or once the branch converges in Step 6*: compress superseded commits in `<merge-base>..HEAD` into **1–3 clean logical terminal commits** (for example backend / web / docs) to strip historical noise. Safety preconditions:
    1. Confirm `git status --short` is clean (zero unrelated or unstaged edits).
    2. Record the pre-compression `HEAD` SHA in your summary so history stays recoverable via reflog.
    3. Use `git reset --soft <merge-base>` followed by scoped `git add <paths>` + `git commit` (never `git reset --hard`, never `git add .`, never push; pushing a compressed branch already on a remote MR requires `--force-with-lease` and refreshes MR version diffs).

Completion criterion: verified round committed (and compressed against base only at Pass 0 / redesign boundaries or final convergence).

### 6. Evaluate loop exit

- **Converged**: latest clean-context `sandstorm-review` reports `0 P0`, `0 P1`, and no blocking complexity bloat (remaining `P2` items explicitly deferred). Optionally run final commit compression per Step 5, then stop and deliver the convergence summary (include `<!-- GOAL_COMPLETE -->` under `/goal`).
- **Otherwise**: return to Step 1 (subject to the Round Cap breaker).

## Circuit breakers

Pause the loop and present 2–3 concrete options (recommended subtraction/boundary option first) whenever **any** triggers:

1. **Primitive Escalation**: closing a narrow edge window requires adding a new coordination or persistence primitive outside budget.
2. **Patch-Breeding / Ratchet**: a new `P1` stemmed from an earlier fix round, or a fix is squeezed between two conflicting historical patch constraints. Prefer reverting/redesigning the earlier source; escalate if an accepted contract changes.
3. **Hot-File Churn**: the same core production or test file grows monotonically across `>= 3` rounds (tracked in the coordinator ledger even across compressed history) or keeps accumulating white-box test scaffolding. Run a dedicated Clean-Slate Subtraction Pass or escalate.
4. **Round Cap**: `3` review-fix rounds finish without reaching `0 P0 / 0 P1` (unless the user set a higher cap).

**Stopping cleanly under `/goal`**: when a breaker trips, call an interactive question tool (such as `ask_question`) to block for the user's choice when available. In unattended `/goal` runs without interactive blocking, write the decision summary and options to an external file outside the repo, report `PAUSED (<breaker>)`, and include `<!-- GOAL_COMPLETE -->` so the `/goal` harness does not force-continue past the breaker.

## Escalation and completion output

Report concisely:
- **Outcome**: `CONVERGED` or `PAUSED (<breaker>)`.
- **Architecture & net delta**: commit trajectory (noting any pre-compression SHA if compressed), hot-file line trajectory, and what was **removed/simplified** vs. added.
- **Decisions**: `subtract` wins, recorded `Accepted Boundaries`, and deferred `P2` items.
- **Verification boundary**: checks run after the final commit and anything left unverified.
- **If paused**: 2–3 concrete options with the simplest viable design first.
