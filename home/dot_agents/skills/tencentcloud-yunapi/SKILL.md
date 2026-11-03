---
name: tencentcloud-yunapi
description: 腾讯云 YunAPI / 云 API / CAPI。用户询问云产品 API 接入、产品/版本/Action 管理、YunAPI 3.0 规范评审（产品名、版本、Action、参数、响应、错误码、示例）、测试与发布、文档与国际化、签名与后端路由、限流运维，或 TencentCloud SDK / 网关返回带 RequestId 的不透明错误时使用。
---

# Tencent Cloud YunAPI All in One

Treat this skill as the YunAPI runbook and router. The source is the iWiki “使用手册【公开】” tree rooted at document `4009167959`; its 89 descendants were inventoried in `references/source-index.md`.

## Evidence and freshness

1. Establish the product, Action, environment, caller type, and desired outcome.
2. Load only the relevant references below.
3. For normative API design, read [spec-workflow.md](references/spec-workflow.md) and its detailed specification. The 2026 specification (iWiki `4024486988`) takes precedence over older rules.
4. For opaque gateway failures, read [gateway-request-id-escalation.md](references/gateway-request-id-escalation.md) before speculative code changes.
5. Distinguish mandatory rules, recommendations, current procedures, and historical features. Never present a historical announcement as current policy.
6. When exact UI labels, approvals, URLs, screenshots, credentials, or policy status matter, open the linked iWiki source in `references/source-index.md`; CAPI changes over time.
7. Never expose SecretKey, tokens, service-account credentials, cookies, or full signed requests in output.

## Scenario router

| User intent | Read |
| --- | --- |
| New product/API, end-to-end onboarding | `references/onboarding.md`, then `references/product-api-management.md` |
| Product/version/Action/parameter/data structure, import/export, visibility, CAM resource | `references/product-api-management.md`; read `references/spec-workflow.md` for normative review |
| Self-test, test gate, pre-release, gray release, global release, rollback | `references/testing-release.md` |
| API docs, examples, SDK/CLI, Chinese/international documentation | `references/documentation-internationalization.md` |
| Signature, CAM, internal service calls, domains, Polaris/backend routing | `references/auth-network-backend.md` |
| Rate limiting, SSE, gzip, availability, logs, alerts, incident diagnosis | `references/operations-troubleshooting.md` |
| CAPI automation skill, import/export tooling, supporting or historical platform features | `references/platform-tools-history.md` |
| Find the exact source or audit coverage | `references/source-index.md` |

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

## 相关 skill

- YunAPI 资源的 CAM 鉴权、QCS 资源描述、请求/资源标签、List 过滤或创建者标签集成：用 `tencentcloud-cam`。
- 纯 YunAPI 规范评审可直接读 [references/spec-workflow.md](references/spec-workflow.md)，按其要求再读 [references/spec.md](references/spec.md)。

## 共同边界

- 联系人、入口、白名单、配额、版本、接口字段、审批流程、支持范围和当前状态属于易变事实；按本 skill 给出的来源回源核验。
- 区分公开产品契约、内部现行流程、本地稳定摘要和历史资料；来源冲突时列出冲突与更新时间，不静默合并。
- 默认可以搜索、读取、比较、设计和解释。修改平台配置、提交工单、发布、回滚或操作生产数据需要用户明确授权。
- 不输出 SecretKey、Token、Cookie、服务账号凭证、完整签名请求或其他敏感信息。
