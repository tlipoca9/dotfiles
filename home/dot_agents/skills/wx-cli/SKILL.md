---
name: wx-cli
description: 个人微信 / WeChat 本地数据查询，通过 `wx` CLI (jackwener/wx-cli)。Use when a task needs personal WeChat chat history, contacts, group members, favorites, Moments (朋友圈), official-account articles, or chat images. Not for Enterprise WeChat / WeCom (use wxwork-cli).
---

# Personal WeChat (`wx`)

`wx` reads the local WeChat 4.x databases through a background daemon. Run
`wx --help` and `wx <command> --help` for commands and flags.

Everything it returns is private local data. Keep it on this machine: no web
tools or external services receive messages, contacts, or images. When the
user says only “微信” and the context does not settle personal versus
Enterprise WeChat, ask which one before querying either.

## Steps

1. **Ready.** Run `wx --version` and `wx sessions --json -n 1`. If `wx` is
   missing or not initialized, follow [references/setup.md](references/setup.md);
   its steps need `sudo` and re-sign WeChat, so they run only with the user's
   go-ahead. Done when `wx sessions` returns data.
2. **Resolve names.** CHAT arguments match nickname, remark, or WeChat ID
   fuzzily; confirm uncertain names with `wx contacts --query "<name>"`.
   Convert relative dates to absolute `YYYY-MM-DD` in Asia/Shanghai. Done when
   each chat resolves to one contact or group.
3. **Query** with `--json` for anything you parse, and the narrowest command:
   `history`, `search` (`--in`, `--since`, `--until`), `unread --filter
   private,group`, `new-messages`, `members`, `favorites`, `stats`,
   `sns-feed`/`sns-search`/`sns-notifications`, `biz-articles`. Pass `-n` for
   more rows: defaults only cap output size. Done when the results cover the
   requested window.
4. **Report** only what answers the question, quoting the shortest snippets
   that prove it. With no matches, state the chats, window, and filters
   queried.

## Gotchas

- `chat_type` in `sessions`, `unread`, `history`, and `new-messages` separates
  `private`, `group`, `official_account`, and `folded` entries; filter on it
  instead of guessing from usernames.
- In groups, prefer `display` (group nickname first) when naming members.
- Moments contain only posts this device has loaded; a missing post is not
  evidence that it does not exist.
- Images are two steps: `wx attachments "<chat>" --kind image` for an
  `attachment_id`, then `wx extract <attachment_id> -o <path>`.
- After WeChat restarts, keys can go stale and queries fail; the fix is
  `sudo wx init --force` with WeChat running, which needs the user.
- A hung daemon recovers with `wx daemon stop`; the next command restarts it.
  `~/.wx-cli/all_keys.json` holds database keys: never print or copy it.
