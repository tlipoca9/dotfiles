---
name: tencentcloud-yunapi-3-spec
description: Use when reviewing, designing, or generating Tencent Cloud YunAPI 3.0 API specs, product names, versions, Action names, parameters, data structures, response JSON, error codes, examples, endpoint/region/language/idempotency/DryRun conventions, or onboarding artifacts.
---

# YunAPI 3.0 Spec

Use this skill to check Tencent Cloud 云 API / YunAPI 3.0 compliance from the local reference derived from the iWiki document "云 API 3.0规范" last modified 2025-12-24.

## Evidence Rules

Before judging compliance, define:

- Question: what artifact is being reviewed or generated, and which YunAPI 3.0 surface is in scope.
- Evidence standard: a finding needs a specific rule from the reference plus the inspected artifact text or observable output.
- Source priority: current artifact and repository evidence first, then `references/spec.md`, then upstream/official docs if explicitly supplied. Do not use memory as authority.
- Report format: separate facts, evidence, reasoning, conclusion, confidence, and questions still needing verification.

If evidence is missing, say the conclusion is not supported yet and list the missing artifact or check.

## Workflow

1. Read `references/spec.md` before making any normative call.
2. Identify the artifact type: product name, version, Action/interface, request parameters, data structure, response, error code, example, or access/onboarding rule.
3. Apply only the relevant checklist sections; avoid inventing extra local rules.
4. For reviews, report findings first by severity with concrete rule references.
5. For generation, produce a compliant draft and call out assumptions such as product acronym, version date, region behavior, or language forwarding.

## Quick Checks

| Area | Required checks |
| --- | --- |
| Product | Lowercase English letters or lowercase letters plus digits, first char letter, 2-16 chars, avoid pinyin. |
| Version | `YYYY-MM-DD`; keep product API versions limited and functionally complete. |
| Action | UpperCamelCase, `Verb + Noun`, <=64 chars, English full words, batch suffix `List`. |
| Parameter | UpperCamelCase; enum string values uppercase or uppercase snake case; common names such as `Offset`, `Limit`, `Region`, `Zone`, `ClientToken`. |
| Time | Prefer `datetime_iso` with `YYYY-MM-DDTHH:mm:ssZ`; use `date` for date-only; avoid string or integer timestamp. |
| Response | HTTP status must be 200 when backend responds; top-level JSON field is `Response`; `RequestId` must match the request. |
| Example | Prefer v3 signature; HTTPS; non-regional endpoint; `X-TC-Action` equals external Action; do not expand changing public params. |
| Operations | Availability >=99.9%; API latency target 500 ms; backend timeout default 5 s; consider `ClientToken` idempotency and `DryRun`. |

## Common Mistakes

- Keeping legacy or workaround behavior after the spec provides a direct YunAPI primitive.
- Treating `Version`, `Region`, `Timestamp`, or other public params as stable example literals instead of `<公共请求参数>`.
- Using regional endpoints such as `cvm.ap-guangzhou.tencentcloudapi.com` in examples.
- Returning a mismatched `RequestId`, formatted JSON payloads, or non-200 status when the backend has responded.
- Defining time values as plain `string` or integer timestamps.
- Leaving review conclusions without rule evidence from `references/spec.md`.

## Resources

- `references/spec.md`: detailed YunAPI 3.0 rules and review checklist extracted from the attached source document.
