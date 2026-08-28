# Issue tracker: Gongfeng

Issues and specs for this repo live as Gongfeng issues in the `git.woa.com` project. Use the configured Gongfeng MCP for tracker operations.

## Conventions

- Infer the project from the repository's `git.woa.com` remote.
- Use the MCP operations corresponding to create, read, list, comment, label, assign, close, and merge-request actions. Inspect the exposed tool schema instead of assuming a particular API shape.
- Treat the project-scoped issue IID as the human reference and retain the returned issue URL when linking it.
- Keep credentials in the MCP connection; never place them in repository files.

## Merge requests as a triage surface

**MRs as a request surface: no.** _(Set to `yes` if this repo treats external merge requests as feature requests; `/triage` reads this flag.)_

When set to `yes`, use the Gongfeng MCP's merge-request operations and keep only requests from authors who are not project maintainers.

## When a skill says "publish to the issue tracker"

Create a Gongfeng issue in the project inferred from the remote.

## When a skill says "fetch the relevant ticket"

Read the Gongfeng issue and its comments using its project-scoped IID.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Map**: a single issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body.
- **Child ticket**: prefer a native child relationship; otherwise put `Part of #<map>` in the ticket body and link it from the map. Apply one `wayfinder:<type>` label.
- **Blocking**: prefer the tracker's native blocking relationship; otherwise use a `Blocked by: #<iid>, #<iid>` line in the ticket body.
- **Frontier**: list the map's open children, excluding tickets with open blockers or an assignee; first in map order wins.
- **Claim**: assign the ticket to the driving developer before starting work.
- **Resolve**: record the answer in a comment, close the ticket, then append a gist and link to the map's Decisions-so-far.
