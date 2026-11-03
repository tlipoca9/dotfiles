# Troubleshooting Coding-CI

## Establish the failure boundary

Collect available pipeline/build URL or ID, failing stage/task, first meaningful
error with nearby logs, code revision, effective CIfile, trigger type, worker label,
image, and recent changes. Separate observed facts from hypotheses. Obtain missing
evidence through available tools before asking the user to reproduce it.

Classify the failure before editing YAML:

1. No build record: event delivery, authorization, enablement, or filters.
2. Queued/initializing: capacity, worker availability, or platform startup.
3. Checkout/image preparation: credentials, network, or image compatibility.
4. Commands failed: the actual script/tool/user/data boundary.
5. Commands succeeded but results differ: status files, outputs, variable timing,
   cache, or effective configuration.

Form an evidence-backed hypothesis, choose a check that could disprove it, and
make the corresponding fix. Check the verification run's revision and parameters.

## Symptom routing

| Symptom | Discriminating checks and next action | Source |
| --- | --- | --- |
| No push/tag/MR build | Check enablement, webhook credential/permission, loaded YAML revision, UI/YAML precedence, filters, MR target branch, and head commit skip markers. | [Triggers](triggers.md) |
| Scheduled build missing | Check branch/time rule and “code unchanged” suppression before diagnosing platform failure. | [Trigger UI](https://iwiki.woa.com/p/4008747747) |
| Waiting for worker | Compare pipeline `maximum_builds` with actual project worker quota and active usage; verify labels and online state. Command timeout does not add capacity. | [Quotas](https://iwiki.woa.com/p/4010621462) |
| Initialization stuck; stages missing; MR/timer silently missing | Capture age, stage presence, and error code. A documented Redis/Celery failure family can leave initialization incomplete; treat it as a candidate, not a universal diagnosis. | [Initialization incident](https://iwiki.woa.com/p/4020685718) |
| Repository branches/commit cannot be loaded | Check repository authorization and its owner's access. UI: 编辑流水线 → 基础信息 → 切换认证. | [Authentication](https://iwiki.woa.com/p/4012518099) |
| 工蜂 checkout fails on IDC | Verify network. IDC-to-DevCloud access is restricted; use an approved DevCloud environment or documented cross-network design. | [IDC access](https://iwiki.woa.com/p/4012784283) |
| Custom image cannot be pulled | Inspect global/task overrides, image spelling/whitespace, tag/architecture, registry reachability, and encrypted startup credentials. | [Image pull](https://iwiki.woa.com/p/4012709545) |
| Worker online but task cannot run/report | Inspect Python compatibility, `qci_worker -V`, PATH, task-correlated logs, and reporting-network errors. | [Worker diagnosis](https://iwiki.woa.com/p/4013245862) |
| Condition error with `Pos` / `charactor` | Locate the character in the effective expression; check quoting, QCI operators, and variable availability. Compute runtime conditions in a previous stage. | [Condition FAQ](https://iwiki.woa.com/p/4012597869) |
| Unexpected skip or empty runtime variable | Inspect actual trigger values and startup overrides, parallel producers, and process-only exports. | [Execution and data](execution.md) |
| Timeout `-1002` | Check time since last output and `output_timeout` in minutes; determine if the command is progressing before raising it. | [Timeout codes](https://iwiki.woa.com/p/4012299195) |
| Timeout `-1001` | Check total runtime and top-level `timeout`; prompt waiting is excluded. | [Timeout settings](https://iwiki.woa.com/p/4012299281) |
| Dirty workspace during checkout | Inspect actual diff, retention setting, `.gitattributes`, Git LFS installation/tracking. Cleaning can distinguish stale state; recurring conversions need an attributes/tooling fix. | [Workspace FAQ](https://iwiki.woa.com/p/4008474900) |
| Missing artifacts or downstream files | Check producer success, paths relative to `QCI_WORKSPACE`, patterns, and declared `temps`. | [File paths](https://iwiki.woa.com/p/4012299212) |
| `Permission denied` | Inspect effective UID, ownership, executable bits, Docker mode, and daemon/task identity. `/etc/qci.conf` can affect every pipeline on a machine. | [Execution identity](https://iwiki.woa.com/p/4012571278) |
| `no space left on device` | Check space/inodes in the worker, identify disposable owned files and the machine owner before cleanup. | [Disk FAQ](https://iwiki.woa.com/p/4012765972) |

Repository-level authentication and a checkout plugin's credentials may differ;
identify the failing operation before changing either.

The initialization incident documents `QCI_DPT_30057` / `qci-dpt-30057` for an
automatic startup abort. Re-read it for deployed behavior; do not promise its
incident-specific watchdog timings. For a supported platform-failure hypothesis,
provide build/task IDs, times, error code, and worker information for escalation
instead of prescribing an unrelated YAML change or a backend database edit.

## Worker evidence

Distinguish an offline custom daemon from an online worker with failing tasks.
The [worker guide](https://iwiki.woa.com/p/4013245862) identifies:

- Daemon logs: `/usr/local/zhiyan_qci/log/zhiyan_qci_daemon_日期.log`.
- Worker logs: `ci_log_日期.log` under the actual `qci_workerspace`; search by task
  ID and timestamp.
- Common boundaries: queue identity versus actual egress IP or IP/hostname,
  `qci_worker` missing from daemon PATH, incompatible/broken Python environment,
  or failed requests to `internal.qci.zhiyan.woa.com`.

Inspect before restarting/reinstalling shared daemons. Match remediation to the
observed failure and authorized scope; a YAML change does not authorize shared
worker reconfiguration. Diagnose credentials without dumping environment values
or placing passwords in image URLs, logs, or shell arguments.

## Debugging and verification runs

Sources: [login debugging](https://iwiki.woa.com/p/4007743664),
[rerun behavior](https://iwiki.woa.com/p/4007743639).

Debug consoles require login-debug permission. After completion, the workspace may
be reused and build variables may be absent. Prefer an active task environment
when investigating those details. A bounded temporary pause can help if needed;
account for worker time and keep it out of the final CIfile.

| Operation | Documented behavior |
| --- | --- |
| Restart whole build | Creates a record with the original code revision, variables, and trigger type. |
| Rerun selected/failed tasks | After completion, reruns selected tasks **and all tasks in subsequent stages**. Unexecuted/disabled tasks cannot be directly selected. |
| Continue after failure | Ignores the failed task and proceeds; does not verify a repair. |

After a code/YAML change, use a run that actually loads the updated revision.
Before rerunning, account for downstream publish/deploy/notification effects and
existing authorization. Stop retries that reproduce the same unexplained failure;
use the evidence to refine the diagnosis.

Finish with the supported cause or remaining hypothesis, concrete fix, checks run
against it, and anything still requiring platform evidence.
