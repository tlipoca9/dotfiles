# Execution environments, variables, and files

## Workers and images

Sources: [environment selection](https://iwiki.woa.com/p/4008210707),
[custom images](https://iwiki.woa.com/p/4007744314).

Choose by network, OS, architecture, and tool requirements. Documented labels:

| Label | Environment | Constraint |
| --- | --- | --- |
| `JOB_MATRIX_DEVCLOUD` | DevCloud Linux x86_64 | Container image required; development network. |
| `JOB_MATRIX_ARM_DEVCLOUD` | DevCloud Linux arm64 | Image and tools must support ARM. |
| `PUBLIC_K8S` | IDC Linux x86_64 | Cannot directly access 工蜂 in DevCloud. |
| `QCI_WINDOWS_PUBLIC` | DevCloud Windows x86_64 | Runs on a VM without Docker mode. |
| `JOB_MATRIX_MACOS` | DevCloud macOS x86_64 | Select OS/Xcode; no container image required. |

Confirm labels and availability in the target project. The CIfile overview names
`PUBLIC_K8S` as the default, which is a poor implicit choice for 工蜂 access.
A custom worker label can name a machine or a tag.

The documented container configuration is an object:

```yaml
worker:
  label: JOB_MATRIX_DEVCLOUD
  docker:
    image: '${BUILD_IMAGE}'
    registry: '${BUILD_REGISTRY}'
    username: '${BUILD_REGISTRY_USER}'
    password: '${BUILD_REGISTRY_PASSWORD}'
```

Bind these variables to actual platform values; encrypt the password. For an image
requiring no registry login, omit credentials. Check image-address whitespace,
registry reachability from the worker network, architecture, and task overrides.

A generic language image is not automatically a QCI image. The image guide requires
basic Linux tools, glibc/libraries needed by the platform's JDK 17, Python/pip plus
development headers, and `qci_worker`. The checked guide specifies Python
3.6.8–3.11.8 and recommends Git >= 2.34.0 / Git LFS >= 3.2.0 when used. Re-read the
guide before building/upgrading an image: these are platform compatibility limits,
not an instruction to select obsolete runtimes. Consult its
[official Dockerfiles](https://iwiki.woa.com/p/4007602382) for installation details.

## Environment definitions

Sources: [CIfile environment syntax](https://iwiki.woa.com/p/4012299220),
[variable categories and propagation](https://iwiki.woa.com/p/4007728656).

```yaml
env:
  BUILD_MODE:
    value: release
    desc: Build mode
    type: select
    option: 'debug;release;'
  ENABLE_REPORT: 'true'
  TOOL_VERSION: '1.0'
```

- Scalars and `{value, desc, readonly}` objects are supported. Selection types are
  `select` and `multi-select`; `option` and multi-values are semicolon-separated.
- Quote text resembling booleans or numbers to preserve its intended value.
- `secret` means QCI-encrypted ciphertext, not plaintext or a secret identifier.
  Prefer the encrypted variable UI or an existing validated reference.
- Platform-configured custom variables override same-name YAML defaults. Inspect
  effective build parameters when editing YAML appears to have no effect.
- Custom names must not use the reserved `QCI` prefix. Runtime names should also
  differ from predefined custom variables.
- `worker.label` and stage/task names can use configuration/startup variables;
  runtime-generated variables are too late. Prompt fields support runtime values.

## Runtime variables

Append `NAME=value` records to the file named by `QCI_ENV_FILE`. Writing that file
does not retroactively populate the producing script's environment; retain a shell
variable when immediate local use is needed.

```yaml
stages:
  - stage: decide
    cmds:
      - |
        printf '%s\n' 'RUN_REPORT=true' >> "$QCI_ENV_FILE"
  - stage: report
    if: '$RUN_REPORT = "true"'
    cmds:
      - printf '%s\n' 'Generate report here'
```

Documented propagation is to later commands in the same task and to later stages,
not sibling tasks in the current parallel stage. A task condition is evaluated
before its script runs, so compute it in a preceding stage. Avoid parallel writers
for the same name; the platform documents last-write wins.

Use `>>`, preserve `QCI_ENV_FILE`, and keep values small. Prefer files in `temps`
for multiline or large data; the manual's multiline escaping has additional
stage-boundary limitations. Plain `export` is not cross-stage communication.

## Useful system variables

Source: [system variables](https://iwiki.woa.com/p/4007727164).

| Variable | Meaning |
| --- | --- |
| `QCI_WORKSPACE` | Task workspace; container path in Docker mode. |
| `QCI_PHYSICAL_WORKSPACE` | Host workspace path. |
| `QCI_REPO_BRANCH`, `QCI_REPO_COMMIT` | Repository branch and revision. |
| `QCI_REPO_TAG` | Tag for a tag-triggered build. |
| `QCI_MR_SOURCE_BRANCH`, `QCI_MR_TARGET_BRANCH` | MR source and target branches. |
| `QCI_TRIGGER_TYPE` | `TRIGGER_MANUAL`, `TRIGGER_TIMER`, `TRIGGER_TAG`, `TRIGGER_CI`, or `TRIGGER_MR`. |
| `QCI_TRIGGER` | Triggering user; timer builds use `qci_timer`. |
| `QCI_BUILD_NUMBER` | Per-pipeline run number. |
| `QCI_BUILD_ID`, `QCI_TASK_ID` | Build/task identifiers for correlation. |
| `QCI_TASK_RESTART` | `1` for a task rerun, otherwise `0`. |

Read system variables without overwriting them. Prefer `QCI_TRIGGER_TYPE` for
event gating: different pages describe an absent tag as empty or `None`. On tag
builds, `QCI_REPO_BRANCH` can be the configured branch rather than the tag name.

## Files, outputs, and caching

Sources: [file paths](https://iwiki.woa.com/p/4012299212),
[cache](https://iwiki.woa.com/p/4012301963),
[global cache](https://iwiki.woa.com/p/4017307010).

| Mechanism | Purpose |
| --- | --- |
| `temps` on the producer | Transfer files to later stages in this run; removed after the run. |
| Top-level `cache` | Reuse dependency/build directories in later runs. |
| `artifacts` on the producer | Persist outputs for download in the build UI. |
| `status` | Read the task's JSON result/report description. |

Tasks can use different machines even with the same label. Earlier installations,
working directories, and files are not implicitly available later. Put initialization
in the selected image or repeated setup; declare transfers explicitly. Artifacts
and cache do not replace same-run dependencies expressed through `temps`.

Path matching is relative to `QCI_WORKSPACE`, not the last shell `cd`. The path
guide describes glob matching first, regex fallback if no glob matches. Linux paths
support `${NAME}`, Windows paths `%NAME%`. Quote patterns and verify matches against
actual generated files before relying on an upload.

**Source conflict:** the path guide says `cache` accepts directories only, while
the cache guide also shows files. Use directories for portable configurations;
preserve/add a file entry only with current platform evidence. Resolve paths from
the actual build user, HOME, and tool settings. The global-cache table has examples
without leading slashes; do not copy them as universal paths or assume root.

Cache is disposable acceleration, not the sole copy of required inputs. Public
workers are recreated between builds. Custom worker persistence does not establish
safe sharing between tasks or concurrent builds.
