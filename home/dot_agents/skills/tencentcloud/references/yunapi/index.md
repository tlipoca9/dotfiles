# Tencent Cloud YunAPI All in One

Treat this skill as the YunAPI runbook and router. The source is the iWiki “使用手册【公开】” tree rooted at document `4009167959`; its 89 descendants were inventoried in `source-index.md`.

## Evidence and freshness

1. Establish the product, Action, environment, caller type, and desired outcome.
2. Load only the relevant references below.
3. For normative API design, read [spec-workflow.md](spec-workflow.md) and its detailed specification. The 2026 specification (iWiki `4024486988`) takes precedence over older rules.
4. For opaque gateway failures, read [gateway-request-id-escalation.md](gateway-request-id-escalation.md) before speculative code changes.
5. Distinguish mandatory rules, recommendations, current procedures, and historical features. Never present a historical announcement as current policy.
6. When exact UI labels, approvals, URLs, screenshots, credentials, or policy status matter, open the linked iWiki source in `source-index.md`; CAPI changes over time.
7. Never expose SecretKey, tokens, service-account credentials, cookies, or full signed requests in output.

## Scenario router

| User intent | Read |
| --- | --- |
| New product/API, end-to-end onboarding | `onboarding.md`, then `product-api-management.md` |
| Product/version/Action/parameter/data structure, import/export, visibility, CAM resource | `product-api-management.md`; read `spec-workflow.md` for normative review |
| Self-test, test gate, pre-release, gray release, global release, rollback | `testing-release.md` |
| API docs, examples, SDK/CLI, Chinese/international documentation | `documentation-internationalization.md` |
| Signature, CAM, internal service calls, domains, Polaris/backend routing | `auth-network-backend.md` |
| Rate limiting, SSE, gzip, availability, logs, alerts, incident diagnosis | `operations-troubleshooting.md` |
| CAPI automation skill, import/export tooling, supporting or historical platform features | `platform-tools-history.md` |
| Find the exact source or audit coverage | `source-index.md` |

## Universal workflow

1. **Classify** the task with the router. Completion: one primary scenario and environment are explicit.
2. **Inspect** current product/API configuration or supplied artifacts before proposing changes. Completion: facts are separated from assumptions.
3. **Validate** against applicable mandatory rules and compatibility constraints. Completion: every changed public contract and affected environment is accounted for.
4. **Plan the path** through development, self-test/test, pre-release, gray validation, approval, release, and documentation as applicable. Completion: owner, validation, rollback, and observability are named.
5. **Execute or instruct** with least privilege; redact credentials. Completion: each action has an observable success check.
6. **Verify** through Explorer/config diff, request logs, metrics, and published docs. Completion: gateway, backend, and documentation outcomes are independently checked.
7. **Report** facts, evidence, actions, remaining risks, and source document IDs.

## Hard gates

- Public contract changes require compatibility analysis; do not silently rename, remove, tighten, or change types of existing fields.
- New APIs must complete required self-test/testing, pre-release verification, CAM/security checks, and documentation preview before production release unless an explicitly approved exemption applies.
- “API document visibility” is not an access-control boundary. Use callable scope, CAM, allowlists, and service-account authorization for access control.
- Development/test backends must not point to production.
- A successful backend log does not prove the external gateway accepted the response; preserve RequestId and inspect both boundaries.
- Gray configuration is not globally effective until validated and globally released.
