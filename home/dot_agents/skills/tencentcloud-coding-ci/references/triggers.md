# Trigger configuration

Sources: [CIfile triggers](https://iwiki.woa.com/p/4012299963),
[UI trigger behavior](https://iwiki.woa.com/p/4008747747).

## Effective rules

- Top-level `trigger` supplies code-push and tag filters. If present, its rules
  take precedence over UI CI/TAG filters; when absent, UI rules apply.
- Top-level `mr` supplies MR filters. If present, its rules take precedence over
  UI MR filters; when absent, UI rules apply.
- YAML filters do not prove webhook registration, repository authorization, or
  event enablement. Inspect those independently for a missing build.
- `include` and `exclude` accept glob patterns or slash-delimited regular
  expressions. Exclude takes precedence. Unspecified branch, tag, or path filters
  are broad, not disabled. Empty `trigger:` or `mr:` blocks match broadly.
- `mr.branches` filters the **target branch**, not the source branch.

This fragment illustrates push filtering while explicitly excluding tag matches:

```yaml
trigger:
  branches:
    include:
      - main
      - release/*
    exclude:
      - release/obsolete-*
  tags:
    exclude:
      - '*'
```

Validate an event matrix against actual platform behavior when changing filters:
matching push, excluded push, matching/nonmatching tag, and relevant MR events.
A `trigger.branches` rule alone does not establish a tag-only or push-only pipeline.
Use stage/task conditions when work must be gated by `QCI_TRIGGER_TYPE` as well
as controlling which events create builds.

For `paths`, cover representative changed-file sets, including mixed included and
excluded files. The manual states exclude precedence without fully defining every
mixed-change aggregation case; use platform evidence rather than a home-grown
matcher presented as authoritative.

## Merge requests

```yaml
mr:
  action:
    - open
    - push-update
  branches:
    include:
      - main
```

Documented `action` values here include `open`, `push-update`, and `merge`.
The system-variable reference lists additional event values; a runtime value is
not proof that every such value is accepted as a filter.

- `is_local_mr` simulates merging `QCI_MR_SOURCE_BRANCH` into
  `QCI_MR_TARGET_BRANCH` in the worker workspace. Commands test the simulated
  result; the remote repository is not merged.
- `is_block_mr` associates a merge gate with the triggering commit. A new source
  commit needs its own matching check; the old gate does not establish coverage.
- `auto_cancel_same_merge_request` retains the newest queued build for the same MR.

**Source conflict:** the [CIfile overview](https://iwiki.woa.com/p/4012299165)
nests `is_local_mr` / `is_block_mr` under `mr` with numeric values, while the trigger
page shows top-level booleans and repeats an auto-cancel key. Preserve a working
export or inspect the current UI's export for these options. Do not choose a
universal nesting or emit both forms. Without either source of current evidence,
identify the field as unresolved before claiming the YAML is ready to import.

## Manual, scheduled, and skipped events

```yaml
manual:
  enable: true
  is_last_run_env: false
  branches:
    - main
    - release/*
```

`manual.enable` defaults to true; `is_last_run_env` defaults to false. Both affect
the frontend, not manual API calls. Branch options accept glob/regex patterns.

The UI documentation describes scheduled rules, including “do not trigger when
code is unchanged,” and TAPD rules. These CIfile sources do not establish a
schedule/TAPD YAML schema. Consult current platform configuration or documentation
instead of inventing `cron`, `on.schedule`, or similar keys.

For code-push and MR events, `[ci skip]` or `[skip ci]` anywhere in the head commit
message suppresses the build. The head message is used for multi-commit events.

Distinguish no build record from a queued/initializing build or skipped tasks;
see [troubleshooting](troubleshooting.md).
