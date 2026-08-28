# Platform Tools and Historical Features

Sources: `4018852126`, `4007795580`, `4007802149`, `4007802522`, `4007798120`, `4007799512`, `4007829070`, `4007888053`, `4007891390`, `4008153775`, `4008484739`, `4009690112`, `4009690607`, `4006921121`.

## CAPI automation skill

The internal `tencent-cloudapi-manager` skill (`https://knot.woa.com/skills/detail/3673`) supports exporting one/many/all Actions, viewing full configuration, validating OpenAPI, and importing OpenAPI configuration to create or modify Actions.

Before using write operations:

- CAPI personal-key UIN/subUIN, allowlisted user, and credential owner must be the same identity.
- Obtain the required CAPI API permission; the source notes that approval may take time to propagate.
- Store AK/SK only in the skill credential mechanism. Never read them into chat, commit them, or echo them in commands/logs.
- Export and review the current configuration before import; validate OpenAPI, inspect diff, target environment, and rollback plan.

## Supporting CAPI views

The platform has announced overview dashboards, feedback, code generation, dark mode, request-path visualization, environment configuration differences, call topology, parameter recommendations, availability thresholds, production-domain interception, and production-change approvals. Use these as supporting tools:

- Overview and topology provide aggregate context, not request-level proof.
- Request path and API Doctor help explain routing.
- Configuration diff is a release gate, not merely a convenience.
- Code generation and parameter recommendations do not override the current API specification.
- Production-domain interception and approval flows are safety controls; do not bypass them.

## Historical handling

Pages under “历史上线公告” describe feature introduction, not necessarily current UI or policy. Preserve the capability name, then consult current CAPI or the specific current guide before giving click-by-click instructions.

The old standalone domain-application page says domain application became automated; do not instruct businesses to file the obsolete separate application unless current CAPI indicates otherwise. The “大账号” internal-call flow is also historical; prefer current service-account authorization.

“调用云图后台接口” and console rate-limit FAQ are narrow legacy references. Open their source pages before using them because extracted text is sparse and current ownership/entry points may have changed.
