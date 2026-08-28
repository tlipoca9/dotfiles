# Issue tracker: Gongfeng

Issues and specs for this repo live as Gongfeng issues in the `git.woa.com` project. Use the configured Gongfeng MCP at `https://git.woa.com/api/mcp/mcp` for all operations.

## Connection and project

- Confirm `origin` is hosted on `git.woa.com` and derive the project path from its remote URL.
- Discover the available Gongfeng MCP tools and inspect the selected tool's parameter schema before each kind of operation. Use the project path, issue IID, and other identifiers exactly as that schema requires; never invent tool names or parameters.
- Required issue capabilities are search/list, read, create, update, comment, label, assign, and close. Use the returned IID and URL to verify every write.
- Never read, print, persist, or embed a Gongfeng token. If the MCP connection or a required capability is unavailable, report the missing boundary and stop there. Use neither browser automation nor an ad-hoc REST client as a substitute.

## Conventions

- **Create an issue**: call the discovered issue-create tool with the project path, title, body, and required labels.
- **Read an issue**: call the discovered issue-read tool and include comments, labels, state, assignees, and relationships when the tool supports those fields.
- **List issues**: call the discovered issue-search/list tool with project, state, and label filters.
- **Comment on an issue**: call the discovered issue-comment tool.
- **Apply / remove labels**: call the discovered issue-update or label tool after reading the latest issue state.
- **Assign**: call the discovered issue-update or assignment tool using the authenticated Gongfeng identity.
- **Close**: post the resolution comment first, then call the discovered issue-close or update tool and verify the returned closed state.
- **Merge requests**: use discovered Gongfeng MR tools when another skill explicitly requires MR operations.

## Merge requests as a triage surface

**MRs as a request surface: no.** _(Set to `yes` if this repo treats external merge requests as feature requests; `/triage` reads this flag.)_

When set to `yes`, list open MRs through the Gongfeng MCP and keep only requests from authors who are not project maintainers. Read, comment on, label, or close them through the discovered MR tools.

## When a skill says "publish to the issue tracker"

Create a Gongfeng issue in the project derived from `origin`.

## When a skill says "fetch the relevant ticket"

Read the Gongfeng issue by its project-scoped IID and include its comments.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Map**: a single issue labelled `wayfinder:map`, with a Chinese title and the `目的地` / `说明` / `已确认决策` / `可复用障碍` / `尚未明确` / `范围之外` sections defined by Wayfinder.
- **Child ticket**: use a Chinese title and `## 待解决问题` body. Prefer Gongfeng's native parent-child relationship when the MCP exposes it. Otherwise put `Part of #<map>` at the top of the child body and keep an ordered task-list link in the map. Apply one `wayfinder:<type>` label (`research`/`prototype`/`grilling`/`task`).
- **Blocking**: prefer Gongfeng's native blocking relationship when the MCP exposes it. Otherwise put `Blocked by: #<iid>, #<iid>` at the top of the child body. A ticket is unblocked when every referenced blocker is closed.
- **Frontier query**: list the map's open children in map order, then drop every ticket with an open blocker or an assignee. The first remaining ticket is the frontier.
- **Claim**: assign the ticket to the authenticated Gongfeng identity as the session's first write, then verify the assignee. Assignment is the concurrency claim; stop if the MCP cannot perform or verify it.
- **Resolve**: read the latest ticket and map, post the answer in Chinese as a resolution comment, close the ticket, then append a one-line Chinese gist and issue link under the map's `## 已确认决策`. Verify both issues after the writes so concurrent map edits are preserved.
