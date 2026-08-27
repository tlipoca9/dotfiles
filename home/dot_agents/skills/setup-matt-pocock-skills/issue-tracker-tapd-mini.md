---
tracker: tapd_mini
workspace_id: "<workspace id>"
---

# Issue tracker: TAPD mini

Wayfinder maps and tickets for this repository live as Light Collaboration mini-items in the declared TAPD workspace. Use the configured `tapd_mcp_http` MCP for every operation.

## Connection and workspace

- Discover the relevant TAPD MCP tool and inspect its schema before each operation.
- Use `mini_items_get`, `mini_items_count`, `mini_items_create`, and `mini_items_update`; never substitute standard TAPD stories or tasks.
- Verify every write by reading the returned mini-item from the declared workspace.
- Keep credentials in the MCP credential store. Never read, print, persist, or embed a TAPD token.
- Use canonical machine refs of the form `https://tapd.woa.com/tapd_fe/t/index/<workspace_id>?mini_item_id=<item_id>`. The query parameter is the gate's item identity; the URL opens the workspace and is not asserted to be a TAPD UI deep link.

## Wayfinding operations

- **Map**: create one root mini-item (`parent_id` unset or `0`) whose description contains Destination, Notes, Decisions so far, Pitfall log, Not yet specified, and Out of scope sections.
- **Ticket**: create a mini-item with `parent_id` equal to the Map item ID. Put the `## Question` in its description and apply one `wayfinder:<type>` label.
- **Read/verify**: in a tool round before launch, call `mcp` with `mini_items_get` separately for the Map and every Ticket, passing exact `workspace_id` and `id`. The gate accepts successful results for five minutes, requires the Map's `parent_id` to be `0`, and requires every Ticket's `parent_id` to equal the bound Map ID.
- **Blocking**: record `Blocked by: <mini-item IDs>` in the Ticket description. A Ticket is unblocked only when every referenced item reads as `done`.
- **Frontier**: list `status=open` mini-items with `parent_id=<map ID>`, then discard claimed items and items with open blockers. The first remaining item is the frontier.
- **Claim**: set `owner` as the first write, then re-read the Ticket and stop if ownership cannot be verified.
- **Resolve**: re-read the Ticket, append its answer under `## Resolution`, set `status=done`, then re-read the Map and append a one-line linked gist under `## Decisions so far` without dropping concurrent content.
- **Pitfall log**: TAPD mini comments are unavailable through MCP. The retained map supervisor is the only writer to the Map description's `## Pitfall log`; it re-reads immediately before every append and preserves all existing content.

## Other engineering skills

TAPD mini is configured as the Wayfinder tracker only. Skills that require comments, native dependencies, audit history, PR/MR intake, or richer issue workflows must report that those capabilities are unavailable rather than silently emulating another tracker.
