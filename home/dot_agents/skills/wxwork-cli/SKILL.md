---
name: wxwork-cli
description: Query Enterprise WeChat / WeCom messages with wxwork for chat history, keyword search, 日报、周报、项目进展, and incremental message checks. Also use for wxwork index synchronization and service recovery. Excludes personal WeChat, documents, calendars, and meetings.
---

# WeCom messages

Assume `wxwork` is installed and available in PATH. Use
`wxwork <command> --help` when command syntax or supported options are unclear.
The CLI retrieves messages; the agent summarizes findings and cites evidence.

## Query workflow

1. Identify the requested people, conversations, topics, and time range.
   Convert relative dates to explicit start and end times in the timezone
   relevant to the request. Clarify the timezone only when ambiguity affects
   the result.
2. Resolve conversation names with `find-chat` or `sessions`, then reuse the
   returned conversation IDs. Query directly; healthy indexed reads need no
   preliminary `doctor`, status check, or synchronization.
3. Inspect the full response before extracting message fields. Check `ok`,
   errors, freshness metadata, and result coverage. For an unavailable service
   or unready index, follow [operations](references/operations.md).
4. Answer within the retrieved evidence: summarize decisions, progress,
   blockers, and owners, or give a timeline when requested. Cite the chat,
   sender, and message time with short excerpts. With no matches, state the
   time range and filters actually searched.

| Need | Command |
| --- | --- |
| Find a conversation | `wxwork find-chat "<name>"` |
| List recent conversations | `wxwork sessions -n 30` |
| Read a complete time window | `wxwork history --chat <id> --since "<start>" --until "<end>" --all --order asc` |
| Search across conversations | `wxwork search "<keywords>" --since "<start>" --until "<end>" -n 20` |
| Search a conversation with context | `wxwork search "<keywords>" --in <id> --context-before 2 --context-after 2` |
| Match exact text | `wxwork search "<text>" --literal` |
| Prepare a digest | `wxwork summary-input --since "<start>" --until "<end>" --chat <id>` |
| Check new captures | `wxwork new-messages -n 100` |

Repeat `--chat` or `--in` to select multiple conversations. Reuse retrieved
results within the task. For large responses, use `--output <file>` and inspect
selected fields while preserving metadata. JSONL stores metadata in the final
`_meta` line.

## Search and coverage

- Indexed search requires all query terms and defaults to relevance order,
  with newer messages first when relevance is equal. `--order asc|desc`
  selects time order. `--literal` selects contiguous, case-insensitive text
  matching; shell quotes alone do not select literal matching.
- Search is text retrieval. Try alternate names or abbreviations when needed.
  Context messages follow conversation order and can fall outside the hit's
  time range; distinguish context from matching messages.
- `summary-input` excludes noise and defaults to compact text. Repeated
  `--keyword` filters mean AND with literal matching. For alternative topics,
  query separately and merge, or filter a shared history result with OR.
- Search and digest limits can truncate results. For complete history at
  offset 0, check `data.full_snapshot` and that `data.returned_count` equals
  `data.snapshot_message_count`. Retrieve the remainder or split the window
  when necessary. These counts describe indexed data under the active filters,
  not all messages that may exist on the server.
- Deduplicate merged messages by
  `(conversation_id, source_table, message_id, server_id, sequence)`.

## Freshness

Indexed responses have `meta.freshness_mode: "indexed"`. Reads use history
retained in Elasticsearch (ES) without capturing or decrypting the source.
The daemon performs an initial full import and then synchronizes hourly.

- `meta.index.last_successful_sync` is the last completed sync, not the newest
  message time. `syncing: true` allows partially published batches from the
  current cycle. Report staleness when it affects the answer.
- For data through now, run `wxwork sync --wait` once, check success, then
  query. Plain `sync` only queues work. A failed sync leaves results subject
  to the previous freshness limit.
- Indexed reads reject `--refresh` and `--freshness`. `refresh-cache` updates
  the cache backend, not ES. If the installed build uses a different backend,
  follow its help and response metadata instead of assuming indexed behavior.

## Incremental checks

For indexed history, `new-messages` tracks first entry into the index and
advances a persisted checkpoint after successful output. First use returns
an empty baseline. Subsequent calls include newly imported old history;
updates to existing records do not count as new messages. A limit leaves
unreturned messages pending.

Use this command for an intended incremental check. Use fixed-window history
for independent investigations so they do not consume pending messages.
`--reset-state` intentionally discards the pending interval by establishing a
new baseline. `--since` is unsupported for indexed captures; use
`wxwork history --since` for a send-time window. After a source rebuild,
`generation_changed: true` indicates a new baseline.
