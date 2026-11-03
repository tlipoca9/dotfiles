# Testing, Gray Release, Global Release, and Rollback

Primary sources: `4021979885`, `4012476936`, `4012686748`, `4012674633`, `4013516802`, `4016025361`, `4020696408`, `4011925903`, `4013406750`.

## Environment path

Use the normal progression: development/self-test → test → pre-release → gray production configuration → global production. Do not use development/test credentials for production calls, and never route development/test configuration to a production backend.

## Before submission

- Review the exact interface/data-structure/backend diff.
- Test valid requests, validation failures, authorization failures, idempotent retries, throttling, backend timeouts, and documented errors as applicable.
- Propagate and log RequestId.
- Associate required TAPD/test evidence; the test gate can block release when testing has not passed.
- High-risk Actions may require director-level approval.

## Gray mechanism

Configuration may propagate by region, stripe, product classification, or another platform-defined gray granularity. Therefore “saved” and “released” do not mean globally active.

1. Determine whether the product uses gray release and its current granularity.
2. Inspect release progress and the exact included changes.
3. Use Explorer or a controlled command/request that reaches the gray slice.
4. Verify observable behavior plus request logs; avoid validating only the UI state.
5. If correct, submit/complete global release approval.
6. Verify global state and representative regions after completion.

For urgent global release, use the platform’s explicit global-release process; do not bypass approval by repeatedly editing configuration.

## Rollback

CAPI supports rollback for interface changes, data-structure changes, and backend-address changes. Before initiating:

- choose a known-good target version;
- inspect rollback diff, including collateral fields;
- identify whether rollback itself requires approval and gray/global propagation;
- preserve current RequestIds, logs, configuration snapshot, and incident timeline;
- assess compatibility of rolling back only gateway configuration while backend code remains newer.

After rollback, validate via Explorer/request logs and representative regions. A completed approval is not sufficient evidence that all slices have converged.

## Release report

Record product/version/Action, change summary, risk level, test evidence, gray target and result, approval links, global result, documentation impact, rollback target, dashboards/alerts, and source IDs.
