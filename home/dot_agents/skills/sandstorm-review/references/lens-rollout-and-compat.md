# Lens: Rollout, Default Config, and Compatibility

Use this lens to audit default-configuration blast radius, mixed-version compatibility, legacy row normalization, delayed-detonation boundaries, and rollout documentation consistency.

## 1. Compatibility matrix

Audit the change across at least these dimensions:

| Dimension | Cases |
|---|---|
| Data | no data, new data, existing data, partially migrated data |
| Process | old process, new process, rolling mixed version |
| Configuration | default mode, named mode, feature disabled, feature enabled |
| Backend | single backend, dual backend, provider unavailable |
| Operation | create, read, update, pause/resume, delete, retry, replay |
| Time boundary | post-deploy warm cache/lease, first TTL expiry or eviction after sustained traffic, window rollover, threshold crossing |

Check whether old and new processes can share the same database and Redis keys, and whether a rolling deployment can leave an old writer, reader, or worker running long enough to violate the terminal-state model.

## 2. Default-config and rollout failure modes

Check each of these explicitly:

- **Always-on shared foundation blast radius**: When a change is behind a gray or feature flag, audit every shared foundation path that still executes with the flag disabled under production defaults. Check for query amplification (for example, duplicate DB lookups across sequential helpers on the same request path), missing request coalescing, or extra writes on `flag=false` paths. Always-on paths carry full-tenant blast radius regardless of rollout scope.
- **Default-config producer/cleaner symmetry**: Audit the exact shipped default values of every new or changed flag. Whenever a writer, ledger, fence, or guard is enabled by default, confirm its companion cleanup, handoff, drain, or escape path is also active by default rather than gated behind an opt-in switch.
- **Delayed-detonation boundaries**: Identify paths kept dormant immediately after deployment by warm keys, caches, leases, or existing rows written by the previous release. Trace what executes on the first cold transition (TTL expiry, cache eviction, failover, window rollover, or cap crossing) after sustained steady-state traffic has accumulated under the new code.
- **Identity and key normalization against legacy rows**: Whenever a change introduces or tightens canonicalization/normalization for a lookup key, repository name, or unique business identity, grep every SQL query across the codebase (point lookups, uniqueness checks, upserts, bootstrap/backfill, and association repair) and trace pre-existing non-canonical rows stored by prior releases. A single-value `key = canonical` query that misses legacy rows can bypass isolation/lifecycle gates or create duplicate active entities.

## 3. Rollout, schema, and runbook doc cross-check

Whenever a branch adds or edits 2 or more operational documents (schema-upgrade guides, release checklists, observability/rollout docs, rollback playbooks):

- **Extract one unified timeline**: Compare the exact ordering of steps across all documents (online DDL → backfill/re-labeling while flag OFF → enable gray/feature flag → verify metrics/alerts → rollback sequence). Flag any contradiction between documents (such as one doc saying "enable flag before backfill" while another requires "backfill while flag is OFF").
- **Verify cross-references and anchors**: Check that every relative file link and `#heading-anchor` across rollout docs resolves to an existing file and heading.
- **Align doc comments and scripts with final code**: Flag stale TTL/retry comments, dead script/Lua arguments, or mismatched flag/metric names left over from earlier iterations.
