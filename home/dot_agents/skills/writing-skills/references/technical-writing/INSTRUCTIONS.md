---
name: technical-writing
description: Write reports, tickets, design docs, API field descriptions, code comments, PR bodies, and long replies that a colleague without the conversation can read and act on.
---

# Technical writing

The reader of a report, ticket, doc, field description, or comment is one colleague who arrives cold. They have none of the conversation, the investigation, the earlier drafts, or the worries you had while working. They open the text to do one thing next: decide, pick up the work, fill in a field, change the code. Write for that reader and that action, in the plain, neutral register of a good engineer explaining their work to a peer.

[examples.md](examples.md) holds the user's own corrections as before and after pairs. Read it before drafting a report, ticket, or API description.

## Steps

1. **Reader.** Name the reader and their next action in one sentence. Done when both are concrete; ask the user when they are not.
2. **Ledger.** List what the text must carry: results, numbers with their units and conditions, decisions, open questions, next actions. Later edits may reshape everything except the ledger.
3. **Draft.** Use the shape for the artifact in the table below, conclusion first.
4. **Edit.** Run `uv run <skill-dir>/scripts/technical-writing/lint.py <file>`, or pipe the text on stdin, then reread each paragraph against the principles below. Done when every lint hit is rewritten or is a qualifier the ledger needs, and the text still carries the whole ledger with nothing added.
5. **Cold read.** For a report, design doc, or article longer than a screen, give the text alone to a subagent with no conversation context. Ask it to list what it could not understand and to review the text with the humanizer for its language (`<skill-dir>/references/blader-humanizer/INSTRUCTIONS.md` or `<skill-dir>/references/jiji262-humanizer-chinese/INSTRUCTIONS.md`). Apply the findings that keep the ledger intact. Done when the subagent's questions are answered in the text.

| Artifact | Reader's next action | Shape |
|---|---|---|
| Report | Decide what to do next | Conclusion and its numbers first, grouped by category and subcategory in tables. A long analysis goes in a second document holding the detail and raw data, linked from the summary. |
| Ticket or requirement | Pick up the work | Background stated plainly as facts, then goal, scope, and acceptance criteria, under Markdown headings with lists. |
| API field or parameter description | Fill in the field | The field's purpose in one short phrase, about ten Chinese characters. Constraints live in the constraint attributes; implementation stays out. |
| Design doc or README | Understand the current design | The current truth. History only where it explains the design. |
| Code comment | Change the code safely | The constraint, invariant, or reason the code cannot show, usually one line. |
| Reply or status update | Know what happened | The outcome in the first sentence, then what the reader needs to act on. |

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
