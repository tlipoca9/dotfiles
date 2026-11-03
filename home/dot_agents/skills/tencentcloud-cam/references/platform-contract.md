# Tencent Cloud YunAPI CAM and Tag Platform Contract

This reference defines the language-independent contract for integrating a Tencent Cloud YunAPI resource with CAM and Tag.

## Contents

- [Resource specification](#resource-specification)
- [Action authorization ownership](#action-authorization-ownership)
- [Resource identities](#resource-identities)
- [CAM request context](#cam-request-context)
- [Single-resource authorization](#single-resource-authorization)
- [List authorization](#list-authorization)
- [Tag conditions](#tag-conditions)
- [Tag storage and mutation](#tag-storage-and-mutation)
- [Creator system Tag](#creator-system-tag)
- [Failure semantics](#failure-semantics)
- [Optional authorization cache](#optional-authorization-cache)
- [Standard authorization response](#standard-authorization-response)
- [Platform registration specification](#platform-registration-specification)
- [Security and observability](#security-and-observability)

## Resource specification

Define one resource integration specification before writing implementation code.

| Field | Meaning |
|---|---|
| `serviceType` | YunAPI/CAM service identifier, such as `ags` |
| `resourceType` | CAM/Tag resource type, such as `deployment` |
| `resourcePrefix` | QCS resource path prefix; normally equal to the resource type |
| `regionSource` | Validated YunAPI request field that supplies the region |
| `ownerUinSource` | Resource-owner UIN, not automatically the current sub-user |
| `creatorUinSource` | Actor UIN used by Tag mutation and optional creator Tag |
| `resourceIdSource` | Stable product resource ID |
| `actions` | Complete Action inventory and kind |
| `tagCapabilities` | Request, resource, result, clear, and creator Tag support per Action |
| `pagination` | List offset/limit semantics, or N/A |

Classify every Action as:

- `Create`: authorize a wildcard resource and optionally evaluate request Tags;
- `Modify`: authorize one resource and optionally evaluate request and resource Tags;
- `List`: authorize the List Action, then filter candidate resources;
- `ResourceAction`: authorize one existing resource, usually at the YunAPI gateway.

Record action-specific prerequisites separately. For example, a Create Action may need permission to read a referenced dependency. Negative tests must retain prerequisite permissions so that they isolate the target Action.

## Action authorization ownership

Assign each Action to exactly one intentional pattern.

| Pattern | Use when | Required behavior |
|---|---|---|
| Gateway | YunAPI can authorize the complete target resource | Do not repeat internal CAM parsing or authorization |
| Internal | Service must evaluate request Tags or data unavailable to the gateway | Populate request and CAM context, then call CAM |
| Gateway + filter | Gateway can authorize List Action, but the service owns candidate resources | Filter candidates internally; never treat resource filtering as a second Action check |

Do not copy an ownership pattern from another Action merely for symmetry. Missing ownership creates an authorization gap; accidental double authorization can produce different QCS forms and contradictory errors.

## Resource identities

Keep internal CAM identity and customer-visible error identity separate.

Internal CAM resource:

```text
qcs::<serviceType>:<region>:uin/<ownerUin>:<resourcePrefix>/<resourceId|*>
```

Customer-visible YunAPI error resource:

```text
qcs::<serviceType>:<region>::<resourcePrefix>/<resourceId|*>
```

Use `*` for Create and List when there is no concrete target resource. Use the concrete ID for Modify and single-resource Actions. Source the region from the validated YunAPI request; do not duplicate a region constant in business handlers.

## CAM request context

Before a service-internal CAM call, require and normalize:

- Action;
- region;
- client IP;
- AppID;
- owner UIN;
- sub-account UIN;
- outer RequestId;
- request source;
- decoded `CamContext` including Role details;
- `ForceAuth=true` for the internal authorization call.

Reject malformed AppID or CAM context as authentication/context failures, not permission denials. If the product explicitly supports main-account bypass, make the decision before requiring sub-account CAM context and test it directly.

## Single-resource authorization

Build a structured resource with `serviceType`, `region`, owner UIN, `resourceType`, and `resourceId`. Pass request Tags only for Actions whose specification enables the request-Tag axis. Call the single-resource CAM authorization operation (`SigAndAuth` in the recommended Go library).

Classify outcomes:

- allow: continue;
- CAM no permission: standard unauthorized response;
- missing request/CAM context: authentication/context failure;
- downstream protocol, timeout, or transport error: dependency unavailable/internal error, never unauthorized.

## List authorization

List has two distinct authorization stages:

1. Determine whether the caller possesses the List Action.
2. Filter actual candidates by resource and resource Tag.

Use wildcard-aware `CheckResource` filtering with the complete candidate set or bounded batches. Interpret results as follows:

- missing List Action: return `AuthFailure.UnauthorizedOperation`;
- List Action allowed but no resource or Tag matches: return success with an empty list;
- matches exist: preserve deterministic candidate order and return only allowed resources.

Filter before computing `TotalCount`, offset, or limit. Paginating first leaks unauthorized counts and creates partial pages. Define `TotalCount` as the number of authorized resources, not raw candidates.

Unconditional List permission can expose an untagged resource. A policy that is allowed only through a `qcs:resource_tag` condition cannot expose an untagged or mismatched resource.

Do not cache candidate Lists or Tag query results as part of authorization.

## Tag conditions

Use one policy encoding for both single-resource and List paths:

```json
{
  "for_any_value:string_equal": {
    "qcs:request_tag": ["team&runtime"],
    "qcs:resource_tag": ["env&pre"]
  }
}
```

Encode each Tag as `<key>&<value>`. Include only the axes supported by the Action. Do not generate `qcs:request_tag/<key>` or `qcs:resource_tag/<key>` conditions; those may work on one authorization path but fail on List `CheckResource`.

Request Tags are caller-supplied desired custom Tags. Resource Tags are live Tags attached to an existing resource. Neither is the creator system Tag.

## Tag storage and mutation

Treat Tag as the source of truth. Read live Tag state for authorization and response projection; do not mirror Tags in the product database solely for CAM/Tag integration and do not return the requested Tags as if they were confirmed state.

Preserve field presence in mutation APIs. For the default exact-set contract:

- Create with an absent or empty Tags field creates no custom Tags;
- Modify with Tags omitted leaves custom Tags unchanged;
- Modify with Tags present and empty clears all custom Tags;
- Modify with Tags present and non-empty replaces the complete custom-Tag set.

If a product deliberately uses patch semantics instead, record that decision in its resource specification and tests. Reject duplicate custom Tag keys and reject the reserved creator key as caller-supplied input.

Use the Tag read service for bulk resource reads. Construct the same internal six-segment resource strings used by CAM.

Use `qcloud.tag.modifyResourceTags` for custom mutations with this payload:

```json
{
  "uin": "<ownerUin>",
  "createUin": "<creatorUin>",
  "resource": "<internal-six-segment-qcs>",
  "replaceTags": [{"tagKey": "key", "tagValue": "value"}],
  "deleteTags": [{"tagKey": "old", "tagValue": "value"}]
}
```

Do not add `projectId` to this contract.

Compute a deterministic custom-Tag difference by key:

- missing key or changed value: add the desired pair to `replaceTags`;
- key absent from the desired set: add the current pair to `deleteTags`;
- unchanged pair: send nothing;
- changed key: never also add the old pair to `deleteTags`.

Sort mutation arrays for deterministic tests. Bound concurrent writes. Keep the protocol behind a Tag writer interface so the entire integration can migrate coherently if the platform contract changes.

## Creator system Tag

The creator system Tag is an optional extension, not a prerequisite for custom Tags or CAM Tag authorization.

- key: `qcs:tag:createdBy`;
- attach operation: `qcloud.system.AttachResourceSystemTag`;
- detach operation: `qcloud.system.DetachResourceSystemTag`.

Attach/detach payloads use owner UIN, creator UIN, a resource list, and respectively `tags` or `tagKeys`. Never accept `qcs:tag:createdBy` as caller-supplied custom data. Exclude it from custom replacement, clearing, and exact custom-Tag equality checks.

Require a separate platform capability declaration for the creator Tag. Its absence must not disable custom Tag integration. When the business resource is deleted, detach the creator Tag and remove custom Tags only after the product has established that the resource deletion is committed.

## Failure semantics

Use these defaults unless the resource specification records a deliberate alternative:

| Operation | Failure behavior |
|---|---|
| Tag read required for authorization or response | Fail closed; never substitute empty Tags |
| Standalone Tag mutation API | Return failure |
| Tag mutation after a resource Create/Modify/Delete has committed | Record an observable error but do not reinterpret the committed resource operation as failed |
| CAM no permission | Standard unauthorized response |
| CAM/Tag timeout, transport, or protocol failure | Dependency unavailable/internal error |
| Optional creator Tag failure | Keep separate from custom Tag success and surface according to the declared optional capability |

Best-effort post-commit Tag mutations create a temporary consistency risk. State this behavior in the resource contract; do not conceal it by returning requested Tags as confirmed state.

## Optional authorization cache

Caching is an optimization, not a correctness prerequisite. If enabled:

- cache both allow and deny only for a declared TTL;
- include AppID, owner UIN, sub-UIN, stable Role identity, Action, region, client IP if relevant, request source, resource, and a sorted request-Tag digest in the key;
- never include full `CamContext`, QToken, or credentials in a key or value;
- keep Role sessions and sub-users isolated;
- on cache read/write failure, call CAM directly;
- do not cache List results or Tag reads;
- test propagation by waiting for the declared maximum cache/policy window rather than expecting immediate change.

## Standard authorization response

Return the YunAPI-standard outer shape:

```json
{
  "Response": {
    "Error": {
      "Code": "AuthFailure.UnauthorizedOperation",
      "Message": "<operation and customer-visible resource authorization message>"
    },
    "RequestId": "<request-id>"
  }
}
```

Keep the outer RequestId consistent with the request ID embedded in the message and, where the CAM client permits propagation, with the downstream CAM RequestId. Use the customer-visible QCS form in the message. Do not expose internal stack traces, credentials, CAM context, or policy documents.

## Platform registration specification

Produce a standalone registration artifact containing:

1. service type and public product name;
2. resource type/prefix and display name;
3. internal CAM QCS pattern with `uin/<ownerUin>`;
4. customer-visible YunAPI error QCS pattern;
5. every Action and whether it uses `*` or a concrete resource ID;
6. authorization owner for every Action;
7. request-Tag and resource-Tag support per Action;
8. List Action and filtering semantics;
9. optional creator-Tag capability as a separate declaration;
10. expected unauthorized code and resource projection.

Validate the artifact against the implementation and tests, not against memory. Do not claim that platform application or environment verification has occurred.

## Security and observability

Correlate CAM and Tag dependency calls using RequestId and trace context. Record operation, dependency, outcome, duration, resource type, and bounded resource count.

Do not record:

- credentials, QToken, authorization headers, or complete CAM context;
- Tag keys or values in logs, traces, or metric attributes;
- complete policy documents;
- unbounded resource IDs or account identifiers as metric labels.

Differentiate permission denial, malformed context, dependency unavailability, network failure, and local wait/timeout. Preserve the last real CAM/YunAPI error and RequestId when a polling or cache-propagation wait expires; do not let a final local context error overwrite the useful downstream evidence.
