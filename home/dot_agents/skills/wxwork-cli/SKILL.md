---
name: wxwork-cli
description: 企业微信 / WeCom 本地聊天记录查询与索引服务维护，通过 finofliu/wxwork-cli。Use for Enterprise WeChat history, keyword search, 日报、周报、个人或项目进展, new messages, or this CLI's daemon and local Elasticsearch setup, sync, and recovery. Not for personal WeChat (use wx-cli) or WeCom documents, calendars, and meetings.
---

# WeCom messages (`wxwork`)

On macOS, the finofliu fork reads all six message commands from local
Elasticsearch (ES). A daemon imports the current account on first startup,
then syncs hourly. Ordinary queries read the existing index immediately;
they do not refresh the source databases. The agent interprets the results.
Keep raw messages and database keys on this machine.

## Select the executable once per task

Use this Mac's fork build:

```sh
WXWORK_REPO="$HOME/code/cnb.woa.com/finofliu/wxwork-cli"
WXWORK_BIN="$WXWORK_REPO/target/release/wxwork"
"$WXWORK_BIN" daemon --help
```

Verify capabilities, not just the version string. `/usr/local/bin/wxwork`
may be the legacy CLI without `daemon`, `sync`, or `rebuild`. If the fork
binary is missing or lacks these commands, build it with
`cargo build --release --manifest-path "$WXWORK_REPO/Cargo.toml"`.
Use the selected executable throughout the task; repeat the variables in
each separate shell call or use its absolute path. Check its command help
for additional flags. For a running daemon's binary upgrade, read
[operations](references/operations.md#service-control-and-binary-upgrades).

## Query workflow

1. Fix the requested time window as absolute `YYYY-MM-DD HH:MM:SS` values
   in Asia/Shanghai. Resolve names with `find-chat "<name>"` or `sessions`;
   reuse conversation IDs and fetched results within the task.
2. Query directly. Healthy reads need neither `doctor` nor `daemon status`
   first. If setup is missing, the index is unready, or a query fails, read
   [operations](references/operations.md) and follow the matching branch.
3. Inspect the full response before extracting messages: `ok`,
   `error.code` / `error.message` on failure, and `meta.index` on success.
   Report any freshness or coverage gap that affects the answer.
4. Summarize by topic: progress, current state, remaining work, and owners.
   Use a timeline when needed and short evidence with chat, sender, and time.
   With no matches, state the actual window and filters searched.

Each command below follows `"$WXWORK_BIN"`. Replace placeholders with resolved
values. Repeat `--chat` or `--in` to combine known conversations.

| Need | Command |
| --- | --- |
| Locate a conversation | `find-chat "<name>"` |
| Browse conversations | `sessions -n 30` |
| Complete indexed history in a window | `history --chat <id> --since "<start>" --until "<end>" --all --order asc` |
| Topic across chats | `search "podman 内存" --since "<start>" --until "<end>" -n 20` |
| Topic in a known chat with context | `search "<terms>" --in <id> --context-before 2 --context-after 2` |
| Exact error text | `search "connection reset by peer" --literal` |
| Compact digest input | `summary-input --since "<start>" --until "<end>" --chat <id>` |
| Intended incremental check | `new-messages -n 100` |

For large results, use `--output <temporary-file>` and inspect it with `jq`.
Preserve metadata when projecting fields. JSONL puts metadata in the last
`_meta` line; default JSON is easier to inspect as a complete response.

## Freshness and coverage

- `meta.index.last_successful_sync` is the last completed sync, not the
  newest message time. `syncing: true` means batches from the current sync
  may already be visible. A source failure can leave `last_error` set while
  `ready: true` remains usable. Query that retained history and state its age.
- If the user needs data through now, run `"$WXWORK_BIN" sync --wait` once
  with ES available, check success, then query. Reuse that sync for the task.
  Plain `sync` only queues work; it does not establish freshness. If sync
  fails, any subsequent results still have the previous freshness limit.
- macOS reads reject `--refresh` and `--freshness`, even though global help
  lists them for Windows. `refresh-cache` does not update ES. `doctor`
  diagnoses source databases, keys, and legacy caches; it is not an ES gate.
- For complete `history` at offset 0, check `data.full_snapshot: true` and
  `data.returned_count == data.snapshot_message_count`. Otherwise retrieve
  the remainder or split the window. Counts cover the indexed history and
  active filters; they do not prove that the desktop client has synced all
  server history.
- Search is a limited set of hits. A digest returning exactly its `-n`
  limit may be truncated. Split by chat or time and verify important claims
  with `history`. Deduplicate merged messages by
  `(conversation_id, source_table, message_id, server_id, sequence)`.

## Search and incremental semantics

- Global and scoped search use the same ES index. Default search tokenizes
  text, requires all query terms, and sorts by relevance, then newer time.
  Use `--order asc|desc` for time order. Shell quotes keep one argument;
  `--literal` selects contiguous, case-insensitive text matching. This is
  text search; try alternate project names or abbreviations when needed.
- Search context follows the full conversation's time order and can extend
  beyond the hit's time window. Distinguish surrounding context from matches.
- `summary-input` filters noise and defaults to compact text. Repeated
  `--keyword` filters mean AND and use literal text matching. For alternatives,
  query separately and merge, or filter a shared history result with OR.
- `new-messages` advances a persisted checkpoint after successful output.
  First use returns an empty list with `baseline: true`. Later calls return
  messages first captured since that baseline, including old history newly
  imported; edits to existing records are not new messages. A limit leaves
  unreturned messages pending. Use fixed-window `history` for independent
  investigations so they do not consume this stream.
- `new-messages --reset-state` discards the pending interval by establishing
  an empty baseline; use it only when that reset is intended. `--since` is
  unsupported here. After a source rebuild, `generation_changed: true`
  signals a new empty baseline. Use `history` to retrieve earlier messages.

For first-time setup, ES outages, source/key failures, or rebuilds, use
[operations](references/operations.md). This workflow targets macOS; Windows
retains the legacy cache behavior and requires its own command help.
