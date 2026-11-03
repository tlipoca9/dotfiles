# CIfile structure and control flow

Sources: [CIfile reference](https://iwiki.woa.com/p/4012299165),
[stages and tasks](https://iwiki.woa.com/p/4012299195).

## Core shape

Use `version: '2.0'` for a new file. Consider command-context behavior before
changing an existing version. This example illustrates structure; replace the
image and commands with verified project values before running it.

```yaml
version: '2.0'
worker:
  label: JOB_MATRIX_DEVCLOUD
  docker:
    image: registry.example.com/team/qci-build:validated
stages:
  - stage: verify
    tasks:
      - task: unit
        cmds:
          - make test
      - task: lint
        cmds:
          - make lint
  - stage: build
    cmds:
      - make build
    temps:
      - dist/*
    artifacts:
      - dist/*
  - stage: inspect
    cmds:
      - ls -l dist/
```

- Stages run sequentially; tasks in a stage run in parallel. Each task's `cmds`
  run sequentially. A failed command stops the task; a failed stage stops ordinary
  downstream stages. Other parallel tasks are not automatically stopped.
- A single-task stage can place task settings such as `cmds`, `artifacts`, and
  `temps` directly on the stage instead of using `tasks`.
- Version 2.0 commands within a task inherit shell context such as `cd` and
  variables. Version 1.0 isolates each command. Neither version shares shell state
  across tasks or stages.
- Top-level `setup` is a command list applied before tasks in each stage. Treat it
  as repeated initialization, not a one-time pipeline job.
- `worker` can be global, stage-level, or task-level. A stage worker selects its
  tasks' execution environment, not a single shared machine.
- A command can be a string or plugin object. Obtain plugin-specific parameters
  from a current export or the plugin's documentation.

The documented command plugin form is:

```yaml
cmds:
  - plugin: cmds
    params:
      cmds:
        - |
          printf '%s\n' "Build: ${QCI_BUILD_NUMBER}"
```

Use ASCII colons, spaces for indentation, and unique mapping keys. Source examples
occasionally contain tabs, full-width punctuation, duplicate keys, or shell typos;
copy their meaning rather than those defects.

## Checkout

Source: [checkout configuration](https://iwiki.woa.com/p/4012299230).

Top-level `code_checkout_type` accepts:

| Value | Behavior |
| --- | --- |
| `CHECKOUT_ALL` | Default: fetch the full repository for operations such as switching branches. |
| `CHECKOUT_ONLY_BRANCH` | Fetch only the selected branch. |
| `NO_CHECKOUT` | Skip checkout and empty the existing repository workspace. |

Repository registration may still be needed for webhooks without checkout. Select
a mode based on actual use of branches, tags, history, and scripts.

## Conditions

Sources: [conditional execution](https://iwiki.woa.com/p/4012299237),
[invalid-condition FAQ](https://iwiki.woa.com/p/4012597869).

`if` belongs on a stage, task, or individual `prompt` item. False marks the node
skipped. It uses QCI expressions, not shell or GitHub expressions.

| Syntax | Meaning |
| --- | --- |
| `$NAME` | Environment variable. |
| `=` or `==`, `!=` | Equality or inequality. |
| `IN (a, b)`, `NOT IN (a, b)` | Membership; lowercase forms also work. |
| `AND`, `OR`, `(...)` | Boolean composition; AND binds more tightly than OR. |
| `IS None`, `IS NOT None`, `IS true` | Missing-value or boolean tests. |
| `~=` | Substring match, or regex when the right value is a double-quoted `/pattern/`. |

Quote values containing punctuation or spaces. The FAQ shows a bare numeric left
operand can fail parsing; quote numeric literals. YAML single quotes can surround
a full expression that contains QCI double-quoted values.

```yaml
if: '$QCI_TRIGGER_TYPE = TRIGGER_TAG AND $QCI_REPO_TAG ~= "/^v[0-9]+[.][0-9]+[.][0-9]+$/"'
```

Runtime-generated conditions need a preceding stage; see
[variable timing](execution.md#runtime-variables). `QCI_TRIGGER_TYPE` contains
`TRIGGER_*` values, not a branch name such as `master`.

## Timeouts and failure handling

Sources: [timeouts](https://iwiki.woa.com/p/4012299281),
[ignore](https://iwiki.woa.com/p/4012299242),
[finally](https://iwiki.woa.com/p/4012299958).

| Setting | Scope and meaning |
| --- | --- |
| `output_timeout: 20` | Stage/task; minutes without command output. Documented default: 15 minutes. |
| `timeout: 2h` | Top level; total run timeout. Numbers mean minutes; `h`, `m`, `s` work. Documented default: 24 hours; excludes prompt waiting. |
| `ignore: true` | Stage/task failure does not stop the pipeline or affect its final result. Default: false. |

The overview misspells `output_timeout` as `output_time` in prose; use
`output_timeout`, confirmed by the dedicated reference and examples.

Top-level `finally` supports optional `success`, `failure`, and `all` branches,
each with commands. Multiple `tasks` beneath a branch are unsupported.
The overview's `failue` spelling is a typo.

```yaml
finally:
  failure:
    cmds:
      - printf '%s\n' 'Build failed'
  all:
    cmds:
      - printf '%s\n' 'Build finished'
```

File access in finally must respect distributed execution; the documentation does
not promise the previous task's machine or process context.

## Human confirmation

Source: [prompt](https://iwiki.woa.com/p/4012299285).

`prompt` is a special entry in `stages`, containing a list of confirmation items.
Any one recipient can handle an item; all required items must be handled to proceed.
Terminating a prompt skips ordinary later stages, while finally remains.

```yaml
stages:
  - prompt:
      - msg: Approve release
        detail: 'Review build ${QCI_BUILD_NUMBER}'
        to: '${RELEASE_APPROVERS}'
        timeout: 24h
        env:
          RELEASE_NOTE:
            value: ''
            desc: Release note
            require: true
```

Configure actual recipients in `RELEASE_APPROVERS`; `to` also accepts a list or
semicolon-separated names. `msg`, `detail`, and `to` support variables. Form values
become later environment variables. Prompt timeout defaults to 24 hours; its
documented maximum is seven days. `QCI_PROMPT_OPERATOR` / `QCI_PROMPT_MSG` expose
the operator and processing information afterward.

## Status and other controls

Sources: [result presentation](https://iwiki.woa.com/p/4007743549),
[notifications and other options](https://iwiki.woa.com/p/4012299969).

`status` points to a JSON result file. Its required `status` value is `success`,
`failure`, or `error`; optional fields include `description`, `url`, `title`,
`report_dir`, and `report_html`. Read the result source before changing interactions
between this file and command failure.

- `maximum_builds` limits simultaneous builds for this pipeline; worker quota is
  a separate project limit.
- `is_no_revert: 0` cleans the workspace; `1` retains it. Cleaning is the default.
- `is_auto_cancel: 1` cancels queued builds; `0` is the default.
- `notifications` is a list. `channel` uses semicolon-separated `WEWORK`, `EMAIL`,
  `ENWECHAT`, or `ENWECHAT_GROUP`; `on_success` / `on_failure` accept `change`,
  `always`, or `never`. Consult the linked reference for recipient groups,
  templates, group IDs, and `notify_over_time` before configuring notifications.
