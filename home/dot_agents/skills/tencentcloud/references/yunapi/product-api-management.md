# Product and API Management

Sources include `4009526992`, `4010007987`, `4013013769`, `4013886822`, `4016456514`, `4013070540`, `4012202251`, `4024061584`, `4021979885`, `4017954163`, `4007796770`, `4007887598`, `4008140699`, `4013090236`, `4013328538`, `4009690711`, `4009690350`, `4009690709`, `4009690393`.

## Product controls

- The recommended version affects default documentation/SDK/user entry points; change it deliberately.
- Keep product administrators and permissions minimal and current. Configure FT manually only when automatic ownership is wrong.
- “免自测” is an explicit product capability, not a shortcut an individual API may assume.
- Product/version naming and public API structure are normative: read `spec-workflow.md` and `spec.md`.

## API configuration model

Account for all of these surfaces when creating or changing an Action:

- Identity: Action, Chinese name, version, CRUD/risk classification, security owner.
- Contract: request fields, output fields, reusable structures, enums, constraints, requiredness, errors, examples.
- Routing: environment-specific backend, region behavior, timeout, protocol, gray backend.
- Security: signature, CAM authorization, CAM resource six-segment form and conditions, caller/service-account model, callable scope.
- Exposure: API-document display scope and field-level visibility are separate from callable scope.
- Operations: account/role/IP/console rate limits, availability threshold, alerts, logs, gzip/SSE when justified.

## Compatibility

Treat removal, renaming, type/shape changes, optional-to-required changes, enum narrowing, semantic changes, and stricter validation as potentially incompatible. Use the formal incompatible-change ticket/approval process (`4009690350`) when required.

Prefer deprecating parameters over deleting them. For an existing optional field that documentation must show as required, use the dedicated approval/change process (`4016430323`) and verify runtime compatibility separately.

## Visibility versus authorization

- **API document display scope** controls where generated docs/SDK-related material is shown.
- **Callable scope** controls which calling domain/population can invoke the API.
- Neither replaces CAM resource authorization, conditions, service-account grants, or explicit allowlists.
- Hiding an API from public docs does not make it uncallable.

## Rate limits

Determine caller semantics before selecting a limiter: direct user, sub-account, real root account, assumed role/actor, user group, IP, or console. The newer guide `4024061584` supersedes older UI guidance where they conflict.

When diagnosing throttling, capture Action, UIN/sub-UIN or role identity, limit type, expected quota, actual error, RequestId, environment, and time window. Verify which identity the gateway counted rather than assuming the visible caller.

## Import/export and diffs

- Import/export can move Action/data-structure configuration and may support OpenAPI 3.0, but imported shape still requires YunAPI review.
- Before applying, inspect the configuration diff and `db diff`; ensure every changed input/output/member field is intended.
- After applying, inspect operation records and configuration differences, then validate through Explorer.
- Generated code or parameter recommendations are aids, not contract authority.

## Specialized transport

- Enable gzip only for responses large enough to benefit; ensure the client advertises/supports it.
- SSE needs an explicitly configured streaming Action, compatible client/SDK behavior, environment host routing, timeout expectations, and tests for disconnect/error framing. Do not claim one Action supports both ordinary JSON and SSE unless current platform configuration proves it.

## Review output

For every finding state: affected surface, current evidence, violated rule or compatibility risk, required change, validation step, and source document ID.
