---
name: technical-writing
description: Write reports, research reports, tickets, design docs, API field descriptions, product copy, code review findings, code comments, PR bodies, and long replies that a reader without the conversation can read and act on.
---

# Technical writing

The reader of a report, ticket, doc, field description, or comment is one colleague who arrives cold. They have none of the conversation, the investigation, the earlier drafts, or the worries you had while working. They open the text to do one thing next: decide, pick up the work, fill in a field, change the code. Write for that reader and that action, in the plain, neutral register of a good engineer explaining their work to a peer.

[examples.md](examples.md) holds the user's own corrections as before and after pairs. Read it before drafting a report, ticket, API description, product copy, or review findings.

## Steps

1. **Reader.** Name the reader and their next action in one sentence. Done when both are concrete; ask the user when they are not.
2. **Ledger.** List what the text must carry: results, numbers with their units and conditions, decisions, open questions, next actions. Later edits may reshape everything except the ledger.
3. **Draft.** Use the shape for the artifact in the table below, conclusion first.
4. **Edit.** Run `uv run <skill-dir>/scripts/technical-writing/lint.py <file>`, or pipe the text on stdin, then reread each paragraph against the principles below. Done when every lint hit is rewritten or is a qualifier the ledger needs, and the text still carries the whole ledger with nothing added.
5. **Cold read.** For a report, design doc, or article longer than a screen, give the text alone to a subagent with no conversation context. Ask it to list what it could not understand and to review the text with the humanizer for its language (`<skill-dir>/references/blader-humanizer/INSTRUCTIONS.md` or `<skill-dir>/references/jiji262-humanizer-chinese/INSTRUCTIONS.md`). Apply the findings that keep the ledger intact. Done when the subagent's questions are answered in the text.

| Artifact | Reader's next action | Shape |
|---|---|---|
| Measurement report | Decide what to do next | Conclusion and its numbers first, grouped by category and subcategory in tables. A long analysis goes in a second document holding the detail and raw data, linked from the summary. |
| Research report | Make a decision or pick a direction | [Research report](#research-report) below. |
| Ticket or requirement | Pick up the work | Background stated plainly as facts, then goal, scope, and acceptance criteria, under Markdown headings with lists. |
| API field or parameter description | Fill in the field | The field's purpose in one short phrase, about ten Chinese characters. Constraints live in the constraint attributes; implementation stays out. For Tencent Cloud YunAPI, also follow `~/.agents/skills/tencentcloud-yunapi/SKILL.md`. |
| Product copy | Use the product | [Product copy](#product-copy) below. |
| Code review findings | Decide which findings to fix | [Code review findings](#code-review-findings) below. |
| Design doc or README | Understand the current design | The current truth. History only where it explains the design. |
| Code comment | Change the code safely | The constraint, invariant, or reason the code cannot show, usually one line. |
| Reply or status update | Know what happened | The outcome in the first sentence, then what the reader needs to act on. |

## Shapes

### Research report

Covers how open-source projects or the industry solve a problem, comparisons of price or capability, and whether to borrow from an upstream project. Research bottom up and write top down: the conclusion comes out of the investigation and goes first in the text.

1. **Title**: the conclusion as a sentence.
2. **Summary**, one screen: the question, the answer or recommendation, and the two or three findings that carry it.
3. **Question and scope**: why the question matters now, what is in scope and what is out.
4. **Method and sources**: repositories with version or commit, documents with their date, and how each claim was checked. Prefer primary sources: official documentation, source code at its latest version, the platform's standard documents.
5. **Findings**, grouped under the outline of the investigation, each a fact linked to its evidence. Compare options in one table on the same criteria, with assumptions stated beside the numbers.
6. **Recommendations**, one item each so the reader can accept or reject them one by one: what to do, why, and the cost. Rate each 采纳, 试点, 观望, or 不采用.
7. **Alternatives**: the options not recommended and why.
8. **Open questions** for the reader to decide.
9. **Appendix**, or a linked second document: raw data and the list of sources.

A research reply that fits one screen keeps the summary, findings, and recommendations, with sources in one line. Study one representative case in depth before generalizing. Keep every section on the question asked; a finding that does not bear on it goes.

### Product copy

Covers page and wizard text, help text, error messages, one-line introductions of a product or component, demo narration, and promotional articles with their titles. The reader is a customer using the product.

- State the rule or effect the user sees. Implementation stays out: how the service validates, where files are installed, which API path is called.
- Cut text that does not help the current step: "next step" cards, notes that a step can be skipped and filled in later, restatements of what the user just did.
- Describe maturity and results as they are. A demo is a demo and a preview is a preview; claims stay within what the product or the footage shows.
- Introduce a third-party project by its official name and its own description, translated for a Chinese page, rather than by a summary of its features.
- Keep a level voice: no lecturing, no commands such as 请勿, no blaming the user.
- Use one term per thing, and give a button the name of the page it opens.

| Kind | Shape |
|---|---|
| Page or wizard step | A title naming the action or object, then one sentence on what the user can do there |
| Help text | The purpose in a short phrase, then the constraints the user must meet: range, default, unit |
| Error message | What happened, then what the user can do; an error code only as a diagnostic |
| One-line introduction | What it is, who it is for, and the problem it solves, in the project's own words where they exist |
| Demo narration or article | The customer's problem, the solution, then what the demo or data shows; the title names the subject first and states its real maturity |

Chinese copy addresses the reader as 你. Put a space between Chinese and Latin letters or numbers, write statistics in Arabic numerals, leave the full stop off labels, titles, input hints, and table cells, and keep exclamation marks for greetings and congratulations.

### Code review findings

Markdown, findings sorted by severity, each in this form:

```markdown
## [P1] <title naming the defect>

- 代码路径：<path relative to the repository root>:<line>
- 来源：本次引入 | 存量
- 现象：<trigger condition and impact>
- 推荐修复方向：<one or two sentences>
```

| Severity | Meaning | When to fix |
|---|---|---|
| P0 | Data loss, a security hole, or an outage on a main path | Before merge |
| P1 | Wrong behavior or a compatibility break in a supported scenario | Before release |
| P2 | An edge case, a maintainability issue, or a missing test | When convenient |

来源 is 本次引入 when the change under review introduces the defect and 存量 when the base branch already has it.

## Principles

Each principle carries the name it has in the classic writing literature, so the name recalls the whole habit.

**Curse of knowledge** (Pinker). The reader knows only what the text tells them. Define a term on first use and call things by their real names, never by shorthand coined during the session. A sentence that answers a question only you were asking, such as rebutting an approach nobody proposed, belongs to the session; delete it.

**Bottom line up front** (Minto's pyramid). The first sentence carries the conclusion or the request. Supporting detail follows in order of importance.

**Classic style** (Thomas and Turner, via Pinker). Writer and reader look at the same thing, and the writer points at it. Say what a result is: define a measurement by what it covers and state a scope as a plain fact. A result described through what it fails to prove, what was left untouched, or what the reader should avoid concluding is the author defending themselves; turn it into the positive statement.

**Calibrated qualifiers.** Real uncertainty goes inside the claim it qualifies, once, with a precise word: 约, 上限, 疑似, n=5. An open question becomes the next concrete check. A risk the user should weigh gets one sentence or a question to the user. Add a qualifier only for uncertainty that exists in the evidence.

**Omit needless words** (Strunk; 鲁迅「将可有可无的字、句、段删去」; Zinsser on clutter). After drafting, cut every word, sentence, and section the reader's next action does not need. Keep any qualifier that changes whether a claim is true.

**Plain words** (Orwell; 余光中 on 万能动词). Use the specific verb (优化了缓存命中率, not 对缓存进行了优化) and the short common word. Skip ornaments: inflated significance, slogans, a closing line that restates the paragraph.

**One name per concept** (Fowler's elegant variation). Repeat the same term every time it means the same thing; a synonym tells the reader a different thing is meant.

**Format follows content.** Tables for enumerable facts, prose for reasoning, lists for steps or parallel items. Bold marks at most the one thing a skimming reader must not miss.

## Register

Technical text keeps a neutral voice. Leave out first-person anecdotes, feelings, and rhetorical questions, and keep sentence rhythm natural rather than deliberately varied. Dashes, passive voice, and adverbs are fine where they are the plain choice. A lint hit or humanizer pattern is a signal to reread the sentence; the reader's next action decides the fix.
