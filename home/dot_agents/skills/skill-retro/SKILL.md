---
name: skill-retro
description: Retro over recent Codex and Cursor sessions that proposes updates to the skills we maintain, new skills, and upstream additions or syncs for router skills, as a report for discussion. Use when asked to review, improve, or evolve the skill set from conversation history, including Chinese requests such as 复盘 skill、根据历史会话迭代 skill.
---

# Skill retro

The product is a report and a discussion. Skills, `sources.json`, and the dotfiles repository stay as they are: a proposal becomes a change only after the user picks it, and that change follows `dotfiles-skills`, outside this skill.

## Scope

Skills live in `~/.agents/skills/`.

- **Maintained**, open to update proposals: a skill folder without `sources.json`; a router's `SKILL.md` (its description and routing tables are hand-written); a router's hand-written sub-skills, listed under `"local"` in its `sources.json`.
- **Vendored**, never edited: every other router sub-skill under `references/`. For a router, propose only adding an upstream skill or source, or syncing to a newer upstream. `uv run scripts/update.py --check` in the router folder exits 1 when upstream has moved past the lock; `--check` is the only mode this skill runs.
- **Out of scope**: project skills under `<repo>/.agents/skills/` and harness built-ins such as `~/.cursor/skills-cursor/`.

## Steps

1. **Window.** Default to the last 7 days; use the user's range when given. Done when `since` and `until` are fixed.
2. **Inventory.** List the maintained skills and local sub-skills with the trigger branches of each description, and run `--check` for every router. Done when every maintained skill is listed and every router has a check result.
3. **Extract.** Run both harness scripts into one temporary directory:

   ```sh
   OUT=$(mktemp -d)
   uv run ~/.agents/skills/skill-retro/scripts/codex_sessions.py --out "$OUT" --since 7d
   uv run ~/.agents/skills/skill-retro/scripts/cursor_sessions.py --out "$OUT" --since 7d
   ```

   `--since` and `--until` take `<n>d`, `<n>h`, an ISO date, or an ISO datetime. Each script writes `<harness>/index.md` and one digest per session; see [Digests](#digests). Done when both indexes exist. A script failure is reported, and the harness it covers counts as unscanned.
4. **Triage.** Triage every root session in both indexes: read its user turns (`rg -A8 '^\*\*User\*\*' <digest>`), its skill references, and its interrupts, and mark it a candidate when any [signal](#signals) shows. Sessions that ran `skill-retro` itself are skipped. A subagent digest is read when its parent is a candidate or it references a maintained skill. With more candidates than one context holds, dispatch subagents over batches of digests, each given the signal list and asked for findings with quoted evidence. Done when every root session is marked candidate or clear.
5. **Analyse.** Deep-read each candidate around its signals. When a clipped passage (`…[+N chars]`) matters, read that span in the source transcript named at the digest's top. Read the full `SKILL.md` of every skill a finding touches before shaping a proposal. Done when every finding names its target skill, or a new skill, and carries evidence.
6. **Report.** Write the report to `~/.local/agents/skill-retro/outputs/<yyyymmddhhmm>.md`, creating the folder, in the [format](#report) below. Done when every finding sits under a proposal or the watch list, and every maintained skill appears somewhere in the report.
7. **Discuss.** Give the user the report path and the top proposals, and ask which to pursue. This skill ends there.

## Signals

- **Correction**: the user redirects behaviour a skill governs, or should.
- **Repetition**: the user re-explains the same convention or context in two or more sessions, so it is knowledge no skill carries.
- **Missed trigger**: the task matched a skill's branch, but the skill was never read.
- **Misfire**: a skill or sub-skill was read where it did not apply, or the wrong sub-skill was picked.
- **Wrong guidance**: following the skill produced a result the user rejected, or a fact in it is stale: a path, command, version, or endpoint that failed.
- **Friction**: interrupts, failed calls, or repeated attempts around a skill's workflow.
- **Gap**: a recurring task or domain with no skill, answered by a new skill or a new local sub-skill under a router.
- **Upstream**: a recurring need an upstream skill covers, answered by adding it to a router; or a router behind upstream, answered by a sync.

Weigh evidence by recurrence across sessions, and by whether the user stated it rather than the agent inferring it. A signal seen once goes to the watch list.

## Digests

Each digest opens with its source transcript, project or cwd, kind (root, or subagent with its parent), active span, and the user-level skills it referenced. A name marked `(not installed)` predates the current skill set: map it to the skill or router sub-skill that now carries it, or to its removal. Entries follow in order:

| Entry | Meaning |
|---|---|
| `**User**` | A user turn, quoted |
| `**Parent prompt**` | The task a parent agent gave a subagent |
| `- agent: …` | Agent text, clipped |
| `- skill invoked:` / `- skill attached:` | Explicit skill use: a Codex `<skill>` message, a Cursor attached skill |
| `` - `$ …` `` and `- <Tool>: …` | Tool calls, clipped to their target |
| `- ⚠ …` | Interrupted or failed turn |
| `- ✗ …` | Failed call with its output tail; Codex only, since Cursor transcripts record no tool results |

Cursor transcripts have no per-line timestamps, so a Cursor session's span comes from its first `<timestamp>` tag and the file's mtime.

## Report

Write in the user's language (Chinese by default), with quotes verbatim and credentials redacted.

```markdown
# Skill retro <yyyy-mm-dd hh:mm>

Window, sessions scanned per harness (root and subagent), unscanned harnesses, maintained skills in scope.

## Proposals

### <n>. <update | new | upstream>: <skill, sub-skill, or proposed name>

- Problem: what goes wrong today
- Evidence: harness, session id, date, and a short quote, per supporting session
- Proposal: what to add or change, in which file and section
- Trade-offs and confidence
- Open questions for the user

## Watch list

Single-occurrence signals, each with its evidence.

## No change

Maintained skills used without issue, and maintained skills unused in the window.
```
