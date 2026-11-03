---
name: mattpocock-skills
description: Router over Matt Pocock's engineering skills (mattpocock/skills). Use for test-first development (TDD, red-green-refactor), diagnosing hard bugs or performance regressions, reviewing a branch or PR, writing a PR body, throwaway prototypes, delegated research against primary sources, domain modeling (GLOSSARY.md, ADRs), deep-module and interface design, bash wizards for human-only steps, grilling a plan, and writing skills or AGENTS.md. Also use when the user names one of its flows (ask-matt, grill-me, grill-with-docs, to-spec, to-tickets, implement, implement-spec, wayfinder, triage, improve-codebase-architecture, retro, handoff, teach, to-questionnaire, wait-what, setup-matt-pocock-skills) or asks to update these skills.
license: MIT
metadata:
  upstream: https://github.com/mattpocock/skills
---

# Matt Pocock skills

Each **sub-skill** is an upstream skill vendored whole into `references/<name>/`. Its entry point is `references/<name>/INSTRUCTIONS.md` (upstream's `SKILL.md`, renamed so harnesses load only this router). Its upstream license sits beside it as `LICENSE`.

## Running a sub-skill

1. Pick the sub-skill from the tables below. When the user asks which skill or flow fits their situation, run `ask-matt`.
2. Read its `INSTRUCTIONS.md` in full and follow it. Links and paths inside resolve from that file's folder.
3. Resolve upstream's skill-to-skill wording through this router:
   - "call the Skill tool with `<name>`" or "run `/<name>`", where `<name>` is a sub-skill below: read `references/<name>/INSTRUCTIONS.md` and follow it. Other slash commands (`/clear`, `/compact`) belong to the harness.
   - "that skill's `SKILL.md`": its `references/<name>/INSTRUCTIONS.md`.
4. Done when the sub-skill's own completion criterion is met.

## Model-invoked

Reach for these on your own whenever the task matches.

| Sub-skill | Reach for it when |
|---|---|
| [`tdd`](references/tdd/INSTRUCTIONS.md) | Building a feature or fixing a bug test-first, one red-green-refactor slice at a time |
| [`diagnosing-bugs`](references/diagnosing-bugs/INSTRUCTIONS.md) | A hard bug, flake, or performance regression: build a loop that goes red, then minimise, hypothesise, fix, regression-test |
| [`code-review`](references/code-review/INSTRUCTIONS.md) | Reviewing changes since a fixed point on two axes, Standards and Spec, as parallel sub-agents |
| [`pr`](references/pr/INSTRUCTIONS.md) | Writing a PR body: smallest clarifying visual, before/after evidence, merge-danger call |
| [`prototype`](references/prototype/INSTRUCTIONS.md) | A design question needs a throwaway artifact: a state/logic HTML file or toggleable UI variants |
| [`research`](references/research/INSTRUCTIONS.md) | Delegating reading legwork to a background agent that leaves a cited Markdown file |
| [`domain-modeling`](references/domain-modeling/INSTRUCTIONS.md) | Sharpening domain terms, editing `GLOSSARY.md`, recording an ADR |
| [`codebase-design`](references/codebase-design/INSTRUCTIONS.md) | Designing a module's interface and seams with the deep-module vocabulary |
| [`wizard`](references/wizard/INSTRUCTIONS.md) | Steps only a human can perform: provisioning, credentials, CI secrets, third-party dashboards, one-off cutovers |
| [`grilling`](references/grilling/INSTRUCTIONS.md) | Stress-testing a plan or decision by relentless rounds of questions |
| [`writing-for-agents`](references/writing-for-agents/INSTRUCTIONS.md) | Writing a skill, `AGENTS.md`/`CLAUDE.md`, or any doc an agent reads |

## User-invoked

Upstream keeps these out of autonomous reach. Run one when the user names it or accepts your suggestion of it.

| Sub-skill | What it does |
|---|---|
| [`ask-matt`](references/ask-matt/INSTRUCTIONS.md) | Picks the skill or flow that fits; maps the main idea-to-ship flow and its on-ramps |
| [`setup-matt-pocock-skills`](references/setup-matt-pocock-skills/INSTRUCTIONS.md) | Once per repo: configures issue tracker, triage labels, and domain doc layout the other flows assume |
| [`grill-with-docs`](references/grill-with-docs/INSTRUCTIONS.md) | Grilling in a working directory that updates `GLOSSARY.md` and ADRs as decisions land |
| [`grill-me`](references/grill-me/INSTRUCTIONS.md) | Stateless grilling with no working directory |
| [`to-spec`](references/to-spec/INSTRUCTIONS.md) | Turns the conversation into a spec on the issue tracker |
| [`to-tickets`](references/to-tickets/INSTRUCTIONS.md) | Breaks a plan or spec into tracer-bullet tickets with blocking edges |
| [`implement`](references/implement/INSTRUCTIONS.md) | Builds a spec or ticket via `tdd`, closing with `code-review` |
| [`implement-spec`](references/implement-spec/INSTRUCTIONS.md) | Builds a whole spec on one integration branch with parallel implementer subagents |
| [`wayfinder`](references/wayfinder/INSTRUCTIONS.md) | Charts a multi-session effort as a map of decision tickets |
| [`triage`](references/triage/INSTRUCTIONS.md) | Moves incoming issues through triage roles into agent-ready issues |
| [`improve-codebase-architecture`](references/improve-codebase-architecture/INSTRUCTIONS.md) | Surveys the codebase for deepening opportunities as an HTML report, then grills the chosen one |
| [`retro`](references/retro/INSTRUCTIONS.md) | After a session, suggests improvements to the agent's environment, most severe first |
| [`handoff`](references/handoff/INSTRUCTIONS.md) | Writes a handoff document so another agent can continue |
| [`teach`](references/teach/INSTRUCTIONS.md) | Teaches a concept over multiple sessions in a stateful workspace |
| [`to-questionnaire`](references/to-questionnaire/INSTRUCTIONS.md) | Turns a decision you can't answer alone into a questionnaire for the person who can |
| [`wait-what`](references/wait-what/INSTRUCTIONS.md) | Re-pitches a message that didn't land, with the missing context |

## Updating

`sources.json` names the upstream repo; its `manifest` (upstream's `.claude-plugin/plugin.json`) decides which sub-skills are vendored. `upstream.lock.json` pins the commit. `references/`, `scripts/<sub-skill>/` and the lock are generated by `scripts/update.py`; keep hand edits to this file, `sources.json`, and the script. Run from this skill's folder:

1. `uv run scripts/update.py --check`: exit 0 means up to date; exit 1 means upstream moved.
2. `uv run scripts/update.py` syncs to the source's `ref` (set a branch, tag, or commit in `sources.json` to pin one). It prints the old and new commit plus each added or removed sub-skill with its invocation kind and description.
3. Exit 2 means the routing tables above disagree with the vendored sub-skills. Add a row for each added sub-skill to the table matching its invocation kind, delete rows for removed ones, then repeat `uv run scripts/update.py --lint` until it exits 0.
