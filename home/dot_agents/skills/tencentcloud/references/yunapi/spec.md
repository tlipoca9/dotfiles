# YunAPI 3.0 规范参考

Source: local attachment copied from iWiki document "云 API 3.0规范"; page metadata shows last modified 2025-12-24. This reference is extracted for agent use and should be treated as a local source, not as a live upstream document.

## Review Output Standard

When reviewing an API artifact, separate:

- Facts: artifact text, file path, command output, or explicit user-provided data.
- Evidence: the specific YunAPI 3.0 rule in this reference.
- Reasoning: why the fact satisfies or violates the rule.
- Conclusion: compliant, non-compliant, or insufficient evidence.
- Confidence: high only when both artifact and rule are explicit.
- Still needs verification: missing docs, source files, runtime behavior, or upstream confirmation.

## 1. 产品名规范

- Product name is an English abbreviation or functional name, such as `cvm` for Cloud Virtual Machine or `account` for a product function.
- Avoid pinyin or pinyin abbreviations for internationalization.
- Product name affects product domain, SDK package, CLI command, and official API docs. Treat renaming after launch as high impact.
- Product name must use lowercase English letters, or lowercase English letters plus digits. The first character must be a letter.
- Length must be 2-16 characters inclusive.
- Prefer concise abbreviations when they do not create ambiguity or conflict, such as `cvm`, `vpc`, `cbs`, `cdb`.

## 2. 版本规范

- APIs are organized under product versions.
- Version format is `YYYY-MM-DD`, such as `2017-03-12`, representing the date the version was created.
- A product should generally have no more than 5 API versions.
- Too many versions should be deprecated through pre-offline/offline flow after existing users accept it.
- APIs under one version should form a functionally complete set; avoid upgrading only some APIs when users need a consistent version to complete operations.

## 3. 接口规范

### 3.1 接口名规范

- Interface/Action names must use UpperCamelCase.
- Names must be `Verb + Noun`.
- Length must not exceed 64 characters.
- Use English full words; avoid ambiguous abbreviations and Chinese pinyin.
- Batch processing interfaces should append `List`; do not pluralize with `s` or `es`. Example: use `DNSList`.
- Common terms should follow industry spelling and casing, such as RFC or Wikipedia conventions. Custom abbreviation proper nouns should be uppercase.
- Chinese and English meanings should match.

Common Action examples:

| Category | Meaning | Standard name |
| --- | --- | --- |
| CRUD | Create resource | `CreateResource` |
| CRUD | Delete resource | `DeleteResource` |
| CRUD | Modify resource | `ModifyResource` |
| CRUD | Query resource details | `DescribeResource` |

### 3.2 接口参数规范

- Parameter names must use UpperCamelCase.
- Use English full words; avoid ambiguous abbreviations and Chinese pinyin.
- If one product's API includes another product's resource parameter, reuse the other product's standard parameter naming.
- String enum constants must use uppercase letters or uppercase snake case. Example: `AUTO_RENEW`.
- Common terms should follow industry spelling and casing. Example: `UUID` should be all uppercase. Custom abbreviation proper nouns should be uppercase.
- Chinese and English meanings should match.

Common parameter names:

| Category | Meaning | Standard name | Notes |
| --- | --- | --- | --- |
| Pagination | Offset, integer | `Offset` | Use with `Limit`; recommended to count from 0. |
| Pagination | Limit count, integer | `Limit` | Use with `Offset`. |
| Pagination | Page number, integer | `PageNumber` | Use with `PageSize`; recommended to count from 0. |
| Pagination | Page size, integer | `PageSize` | Use with `PageNumber`. |
| Pagination | Filter | `Filters` / `Filter` | Use `Filter` structure; make exact vs fuzzy matching explicit. |
| Pagination | Total count, integer | `TotalCount` |  |
| Region | Availability zone | `Zone` | Do not use integer `ZoneId` to represent zone. |
| Region | Region | `Region` | Do not use integer `RegionId` to represent region. |
| Instance | Instance ID | `InstanceId` |  |
| Instance | Instance type | `InstanceType` |  |
| Credential | Password | `Password` |  |
| Credential | User name | `UserName` |  |
| Project | Project ID | `ProjectId` |  |
| Idempotency | Idempotency token | `ClientToken` |  |

### 3.3 数据结构规范

- Define data structures when request or response parameters are complex, need multilevel expression, or are reused by multiple APIs.
- Data structure names follow interface and parameter naming rules.
- Prefer singular names for data structures.
- If a response field is `BackupFiles` and its element type is a data structure, name the structure `BackupFile`, not `BackupFiles`, `BackupFileList`, or `BackupFileSet`.

Common `Filter` structure:

- Use `Filter` to express key-value query filters, such as instance ID, name, or status.
- Multiple filters have logical AND relationship.
- Multiple values under the same filter have logical OR relationship.
- Members: `Name` of type `string`; `Values` of type `string` array. A single `Value` member can be used when arrays are unsupported.
- For multiple filter names, define a parameter named `Filters` with type `Filter[]`.
- Document whether each filter field uses exact or fuzzy matching.

### 3.4 参数值规范

Time parameters:

- If a parameter represents a concrete time, use the YunAPI predefined `datetime_iso` type.
- Default concrete time format must follow ISO8601 and is restricted to `YYYY-MM-DDTHH:mm:ssZ`, where `Z` means UTC+0. Example: `2023-10-05T14:30:00Z`.
- Date-only parameters should use predefined `date` type and format `YYYY-MM-DD`, without timezone.
- Hour-precision times must pad minutes and seconds with zero and include timezone, format `YYYY-MM-DDTHH:mm:ssZ`.
- Millisecond-precision times use `YYYY-MM-DDTHH:mm:ss.SSSZ`.
- Other timezone requirements use `YYYY-MM-DDTHH:mm:ss±HH:mm`; minutes should be `00` or `30`.
- Do not define time parameters as `string`.
- Do not define time parameters as integer timestamps; precision and language handling can create barriers.

## 4. 接口返回规范

- Usually YunAPI passes through the business response and does not format-convert or compress it.

### 4.1 响应码规范

- If the backend can respond, regardless of normal or exceptional return, HTTP status code must be 200.
- Otherwise YunAPI returns `InternalError` to the user.

### 4.2 响应头规范

- For non-streaming protocol responses, the business backend should return `Content-Length` to declare response size.

### 4.3 JSON 格式返回

- The first-level JSON field is fixed as `Response`.
- `Response` is an object.
- The second level must contain `RequestId`.
- The `RequestId` value must be the `RequestId` issued by YunAPI as input.
- Interface response parameters appear as other second-level fields under `Response`.
- Returned `RequestId` must exactly match the issued `RequestId`; otherwise YunAPI returns `InternalError`.
- Response JSON should not be pretty-printed or indented. Formatting should happen at the terminal, SDK, or CLI layer.

Compact example:

```json
{"Response":{"InstanceIdSet":["xxx1","xxx2"],"RequestId":"eac6b301-a322-493a-8e36-83b295459397"}}
```

Pretty-printed form can be shown by clients, but should not be the backend return format.

## 5. 错误码规范

- Source document points to the internal error-code reference: `http://tapd.oa.com/qcloud_api/markdown_wikis/show/#1210161711001597621`.
- If detailed error code compliance matters, verify against that upstream/internal reference or supplied project docs before concluding.

## 6. 示例规范

### v3 签名格式规范（推荐）

Shape:

```http
POST / HTTP/1.1
Host: ***
Content-Type: ***
X-TC-Action: ***
<公共请求参数>

{业务请求参数}
```

Rules:

- v3 signature examples must start with `POST / HTTP/1.1`.
- Request parameters must include `Host`, `Content-Type`, `X-TC-Action`, and `<公共请求参数>`, using `:` between key and value.
- `X-TC-Action` must equal the externally configured Action/interface name.
- Other public fields such as `Version`, `Region`, and `Timestamp` must not be expanded in examples because public fields may change. Use `<公共请求参数>`.
- Examples must use HTTPS.
- Endpoint must not be regional. Use `cvm.tencentcloudapi.com`, not `cvm.ap-guangzhou.tencentcloudapi.com`.
- Put each parameter on a separate line for readability.
- Put public request parameters at the end of the first part, then a blank line, then business request parameters.
- Business request parameters are defined by the business, but should be JSON-parseable.
- Source document points to request example details: `http://tapd.oa.com/qcloud_api/markdown_wikis/show/#1210161711001595463`.

### v1 签名格式规范（不推荐）

Shape:

```text
https://domain/?Action=xxxxx&<业务参数>&<公共请求参数>
```

Rules:

- URL parameters use `&` and `key=value`, such as `&key1=value1&key2=value2`.
- The first URL parameter key is `Action`; its value must equal the external Action/interface name.
- Other public fields such as `Version`, `Region`, and `Timestamp` must not be included as literals. Use `<公共请求参数>`.
- Do not expand public request parameters; represent them at URL end as `&<公共请求参数>`.
- Examples must use HTTPS.
- Endpoint must not be regional. Use `cvm.tencentcloudapi.com`, not `cvm.ap-guangzhou.tencentcloudapi.com`.
- Put each parameter on a separate line for readability.
- Array elements expand by zero-based index, for example `&FooArray.0=hello` and `&FooArray.1=world`.
- Structures expand by member, for example `&FooObject.Hello=1` and `&FooObject.World=2`.

## 7. 其他规范

### 7.1 可用性规范

- Availability should not be lower than 99.9%.
- Availability is considered at both product and interface dimensions.
- Let `c1` be the count of requests returning `InternalError` or subcodes such as `InternalError.UnknownError` for the day.
- Let `c2` be total requests for the day.
- The source formula appears to intend availability based on request counts. Verify the exact formula in upstream context before using it for automated calculation because the copied HTML lost part of the rendered math.
- The source notes this is API-call based request-count availability, not normal-service-time based availability.
- `InternalError` includes backend address resolution failure and timeout. CAM and API framework exceptions are not separated, but the source states mixed deployment does not materially affect fairness.

### 7.2 时延规范

- YunAPI interface latency standard is 500 ms.
- API framework average latency, including CAM signature authentication call latency, should be within 10 ms.
- YunAPI's default timeout for calling business backend is 5 seconds.

### 7.3 域名规范

- Businesses accessing YunAPI do not need to register and maintain internal or external domains; YunAPI manages them uniformly.
- If a business already has self-applied legacy domains, hand them over to YunAPI for unified handling.
- Source reference: `https://iwiki.woa.com/p/4009936495`.

### 7.4 地域规范

- YunAPI region names uniformly use full pinyin form such as `ap-guangzhou`.
- Only legacy console scenarios may pass region abbreviations.
- Source reference: YunAPI region list `https://iwiki.woa.com/p/4009690355`.

### 7.5 国际化多语言规范

- YunAPI supports specified language.
- Interfaces can configure transparent forwarding of public parameter `Language` to the business backend.
- The business backend can internationalize returns or errors based on the user's specified language.
- Allowed `Language` values are `zh-CN`, `en-US`, `ko-KR`, and `ja-JP`.
- If the interface configures `Language`, YunAPI currently checks only `zh-CN` and `en-US`.
- YunAPI's own error details support `zh-CN` and `en-US`.
- If the user does not specify `Language`, YunAPI's own errors default to English.
- Business backends can use system parameter `AccountArea`, which always has a value where `0` means domestic-site user and `1` means international-site user, to decide default behavior when `Language` is omitted.

### 7.6 业务接入 V3 流程

- Source document points to YunAPI onboarding guide: `https://iwiki.woa.com/p/4009690583`.

### 7.7 幂等性和 DryRun

- Production business APIs need idempotency.
- Example: CVM `RunInstances` uses user input parameter `ClientToken` to ensure request idempotency.
- Business backend should save user request `ClientToken` information and process requests with the same `ClientToken` idempotently.
- This assumes users ensure each `ClientToken` is unique.
- Business APIs can add `DryRun` to let users validate request legality without actually executing the request.

## 8. 更新历史

- 2017.08: Initial plan.
- 2018.05: Strong validation of business backend response parameters.
- 2019.07: Added note that pagination `Offset` and `Limit` must be integer because some businesses defined them as strings.
- 2019.12: Added term spelling rules for interface and parameter names, such as `UUID`.
- 2020.08: Updated example specification.
- 2025.07: Product abbreviations may include digits.
- 2025.12: Clarified time parameter format requirements.

## Compact Compliance Checklist

Use this checklist after reading the relevant sections above:

- Product name: lowercase letters or lowercase plus digits, first char letter, 2-16 chars, English abbreviation/function name, no pinyin.
- Version: `YYYY-MM-DD`, limited version count, functionally complete version set.
- Action: UpperCamelCase, `Verb + Noun`, <=64 chars, English full words, batch suffix `List`.
- Parameters: UpperCamelCase; enum constants uppercase or uppercase snake case; common names reused; no conflicting cross-product resource names.
- Structures: singular data structure names; `Filter` semantics documented; exact/fuzzy matching documented.
- Time: `datetime_iso`/`date` as appropriate; strict ISO8601 forms; no plain `string` or integer timestamps.
- Response: backend responds with HTTP 200; non-streaming response includes `Content-Length`; JSON shape is compact `{"Response":{...,"RequestId":"..."}}`.
- Errors: verify detailed error codes against the internal error-code reference before strict conclusions.
- Examples: v3 preferred; HTTPS; non-regional endpoint; `X-TC-Action` matches Action; public params represented as `<公共请求参数>`.
- Operations: availability target >=99.9%; latency target 500 ms; backend timeout default 5 s; idempotent production operations use `ClientToken`; optional `DryRun`.
