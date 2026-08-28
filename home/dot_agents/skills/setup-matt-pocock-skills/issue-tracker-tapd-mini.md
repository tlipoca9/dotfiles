---
tracker: tapd_mini
workspace_id: "<workspace id>"
---

# Issue tracker: TAPD mini

Wayfinder maps and tickets for this repository live as TAPD Light Collaboration mini-items in the declared workspace. Use the configured TAPD MCP for tracker operations.

## Conventions

- Keep all related items in the declared workspace.
- Use the MCP operations corresponding to create, read, list, and update mini-items. Inspect the exposed tool schema instead of assuming a particular API shape.
- Treat the mini-item ID as its identity and retain the returned URL when linking it.
- Keep credentials in the MCP connection; never place them in repository files.

## When a skill says "publish to the issue tracker"

Create a root mini-item in the declared workspace.

## When a skill says "fetch the relevant ticket"

Read the mini-item identified by the supplied item ID or URL.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a root mini-item with **child** mini-items as tickets.

- **Map**: a root mini-item holding the Notes / Decisions-so-far / Fog body.
- **Child ticket**: set the map as its parent and record one `wayfinder:<type>` value using the tracker's available metadata or the ticket body.
- **Blocking**: prefer a native blocking relationship; otherwise use a `Blocked by: <item IDs>` line in the ticket body.
- **Frontier**: list the map's open children, excluding tickets with open blockers or an owner; first in map order wins.
- **Claim**: set the ticket owner before starting work.
- **Resolve**: record the answer using the tracker's supported comment field, or an `## Answer` body section when comments are unavailable; mark the ticket done, then append a gist and link to the map's Decisions-so-far.
