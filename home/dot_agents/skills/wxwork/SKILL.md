---
name: wxwork
description: Query local Enterprise WeChat / WeCom / wxwork messages through the installed `wxwork` CLI and turn them into AI-ready summaries, reports, follow-ups, risk lists, decision logs, or targeted chat analysis. Use when the user asks about 企业微信, wxwork, WeCom, local chat records, recent conversations, daily/weekly/monthly communication summaries, keyword searches, chat history, new messages, customers/projects discussed in chats, or action items from Enterprise WeChat.
---

# WXWork

Use the installed `wxwork` command as a local JSON data source for Enterprise WeChat messages. The CLI retrieves and filters messages; the agent performs interpretation, summarization, risk detection, and action extraction.

## Quick Checks

Start with the lightest command that proves the environment is usable:

```bash
command -v wxwork
wxwork doctor
```

If `doctor` reports missing config, keys, databases, or stale cache errors, explain the specific problem and stop before trying to summarize. Do not run `init`, import keys, or modify key files unless the user explicitly asks.

Prefer normal freshness:

```bash
wxwork summary-input --today
```

Use `--freshness prefer-cache` when the user wants speed or cached data is acceptable. Use `--freshness strict-latest` only when the user explicitly needs the newest possible messages and is willing to wait.

## Task Routing

- Daily summary: `wxwork summary-input --today`
- Weekly summary: `wxwork summary-input --preset weekly`
- Monthly summary: `wxwork summary-input --preset monthly`
- Targeted chat summary: `wxwork summary-input --chat "<chat>" --since "<datetime>" --until "<datetime>"`
- Topic/customer/project summary: `wxwork summary-input --keyword "<keyword>" --since "<datetime>"`
- Recent active chats: `wxwork sessions -n 20`
- Find an imprecise chat name: `wxwork find-chat "<keyword>" -n 10`
- Inspect one chat: `wxwork history --chat "<chat>" --days 7 -n 100 --order asc`
- Search messages: `wxwork search "<keyword>" --since "<datetime>" --until "<datetime>" -n 50`
- Incremental catch-up: `wxwork new-messages -n 200`

Use `--chat` and `--keyword` multiple times when the user gives multiple constraints. Use `--sender`, `--self-only`, `--others-only`, `--tag`, and `--sender-tag` only when those filters directly match the request.

## Workflow

1. Translate relative time in the user request into concrete local dates before querying. The local timezone is normally Asia/Shanghai unless the user says otherwise.
2. Run the smallest query that can answer the request. Prefer `summary-input` for summarization tasks because it is already packaged for agents.
3. If a chat name is ambiguous or the first query returns no useful data, run `wxwork find-chat` or `wxwork sessions` before retrying with the resolved chat name.
4. Parse the JSON output. Do not summarize stderr warnings as messages; report warnings separately when they affect confidence.
5. Produce the requested answer in Chinese by default when the user asks in Chinese. Keep message quotes short and only quote when needed for evidence.

## Recommended Output Shapes

For daily or weekly summaries, structure the response as:

- Top conversations
- Decisions and status changes
- Risks, blockers, and escalations
- Follow-ups or TODOs, grouped by owner when possible
- Open questions

For targeted searches or incident reviews, structure the response as:

- Timeline
- People/chats involved
- Key facts and evidence
- Current state
- Follow-ups

For unread or incremental catch-up, separate:

- New since last check
- Needs user attention
- Can wait

## Privacy And Safety

- Treat all wxwork output as private local data. Do not send it to external services or web tools.
- Avoid printing large raw JSON dumps in the final answer. Summarize and cite only the minimum message snippets needed.
- Do not run state-changing commands such as `wxwork new-messages --reset-state`, `wxwork refresh-cache`, `wxwork init`, or tag mutations unless the user explicitly requests them.
- Do not edit `~/.wxwork-cli/`, key files, or copied database files unless explicitly asked.
- When no messages are found, say that the query returned no matching messages and include the exact date range or filters used.

## Useful Command Patterns

```bash
# Today across all chats, capped for speed.
wxwork summary-input --today -n 500

# Last 7 days for one project/customer keyword.
wxwork summary-input --keyword "客户A" --since "2026-05-18 00:00:00" -n 500

# Resolve chat name, then inspect chronological history.
wxwork find-chat "产品" -n 10
wxwork history --chat "产品讨论群" --days 3 -n 200 --order asc

# Search with surrounding context.
wxwork search "上线" --since "2026-05-01 00:00:00" --context-before 2 --context-after 2 -n 50
```
