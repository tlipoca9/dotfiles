---
name: wxwork-cli
description: 企业微信 / WeCom 本地聊天记录查询，通过本机 `wxwork` CLI。Use when a task needs Enterprise WeChat messages, such as 日报、周报、个人或项目进展, a chat's history, keyword search, or new messages. Not for personal WeChat (use wx-cli) or WeCom documents, calendars, and meetings.
---

# WeCom messages (`wxwork`)

`wxwork` (source: `cnb.woa.com/garyyu/wxwork-cli`) reads the local Enterprise
WeChat databases and prints JSON. The CLI retrieves and filters; you summarize,
extract decisions, risks, and action items. Run `wxwork <command> --help` for
flags.

Messages are private local data. Keep them on this machine: no web tools or
external services receive raw messages.

## Steps

1. **Health.** Run `wxwork doctor`. If it reports a configuration, key,
   database, or cache problem, report it and stop. `init`, key import, and key
   files stay as they are unless the user asks. Done when `doctor` returns
   `"ok": true`; note its `cache_stale` flags for step 3.
2. **Resolve the window and chats.** Convert relative dates to absolute
   `YYYY-MM-DD HH:MM:SS` in Asia/Shanghai. Resolve chat names with
   `wxwork find-chat "<keyword>"` or `wxwork sessions`; a person's direct chat
   resolves by display name. Done when every chat is a `conversation_id` or an
   exact name, and the window has both ends.
3. **Query** with the smallest command that answers the question:

   | Need | Command |
   |---|---|
   | Daily/weekly/monthly digest | `summary-input --today` or `--preset weekly\|monthly` |
   | Topic across chats | `summary-input --keyword "<kw>" --since … --until …` |
   | One chat, a time range | `history --chat "<id>" --since … --until … --all --order asc` |
   | Since the last check | `new-messages` |
   | Exact phrase with context | `search` (see below) |

   The default freshness (`latest`, auto refresh) suits most queries. Use
   `--freshness prefer-cache` only when `doctor` shows `cache_stale: false` or
   the window ends before the last refresh; use `strict-latest` only when the
   user needs the newest messages and accepts the wait. Write large results
   with `--output <tmp-file>` and read them with `jq`. Done when the results
   cover the whole window, or you can name what is missing.
4. **Report.** For digests: key conversations, decisions and status changes,
   risks and blockers, action items by owner, open questions. For a targeted
   lookup: timeline, people and chats, facts, current state, next actions.
   Quote only the shortest snippets that prove a point. With no matches, state
   the exact window and filters queried.

## Gotchas

- The first `search` builds a full-text index over every cached message
  (hundreds of thousands of rows) and can run for many minutes; agent command
  timeouts have killed it (exit 143). Prefer `summary-input --keyword` or
  `find-chat` + `history`. When `search` is needed, run it once in the
  background with a long timeout, not several in parallel.
- A stale cache shows as results that stop at an old date while
  `doctor` reports `cache_stale: true`. Rerun without `prefer-cache` so the
  cache refreshes.
- Commands that change state need an explicit user request:
  `new-messages --reset-state`, `refresh-cache`, `init`, and `tags` changes.
  The same holds for editing `~/.wxwork-cli/`.
