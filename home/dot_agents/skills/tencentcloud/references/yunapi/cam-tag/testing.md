# CAM and Tag Test Contract

Use this reference to design deterministic repository-local tests and to generate a black-box acceptance specification. Do not connect to a real environment, create CAM identities, deploy services, or clean test-environment resources as part of this skill.

## Contents

- [Coverage model](#coverage-model)
- [Resource and registration tests](#resource-and-registration-tests)
- [CAM context tests](#cam-context-tests)
- [Single-resource authorization tests](#single-resource-authorization-tests)
- [List tests](#list-tests)
- [Tag policy tests](#tag-policy-tests)
- [Tag read and mutation tests](#tag-read-and-mutation-tests)
- [Creator-Tag tests](#creator-tag-tests)
- [Error-contract tests](#error-contract-tests)
- [Cache tests](#cache-tests)
- [Black-box acceptance specification](#black-box-acceptance-specification)
- [Completion gate](#completion-gate)

## Coverage model

Describe every case with explicit metadata instead of encoding meaning only in a test name:

| Dimension | Values |
|---|---|
| Identity | main account, sub-user, Role |
| Polarity | positive, negative |
| Action kind | Create, Modify, List, ResourceAction |
| Authorization axis | Action, resource, request Tag, resource Tag |
| Negative cause | wrong Action, other resource, missing Tag, mismatched Tag |
| Result | allow, unauthorized, success with empty result, dependency failure |

Apply only axes declared by the Action's capability table. Mark unsupported axes as N/A in a coverage report. Never silently skip them.

Test main-account behavior according to the resource specification. If service-internal main-account bypass is declared, a main-account negative case proves bypass without `CamContext`; it must not be mislabeled as an expected unauthorized response.

## Resource and registration tests

Lock the two resource projections:

```text
internal: qcs::<service>:<region>:uin/<owner>:<prefix>/<id|*>
public:   qcs::<service>:<region>::<prefix>/<id|*>
```

Test at least:

- Create uses `*`;
- List uses `*` for Action-level policy/error projection;
- Modify and ResourceAction use the target ID;
- internal QCS contains owner UIN;
- public QCS omits the account segment;
- region comes from the request;
- resource type and prefix come from the frozen specification.

Add a static consistency test that enumerates the same Action set in the resource specification, authorization ownership table, platform registration artifact, and test matrix. Fail on missing or duplicate Actions.

## CAM context tests

With a recording fake CAM service, assert that service-internal calls receive:

- Action, region, client IP, AppID, owner UIN, sub-UIN, RequestId, request source, and `ForceAuth=true`;
- decoded CAM context;
- stable Role details when the identity is a Role.

Reject and classify:

- missing Action;
- missing region;
- malformed AppID;
- empty or malformed CAM context;
- absent authorizer configuration.

Prove that gateway-owned Actions do not invoke the internal authorizer.

## Single-resource authorization tests

For every internally authorized Create or Modify Action, cover:

| Case | CAM input | Expected |
|---|---|---|
| Positive Action/resource | exact Action and resource | allow |
| Wrong Action | different Action, same resource | unauthorized |
| Other resource | exact Action, different resource | unauthorized |
| CAM no permission | coded no-permission error | standard unauthorized |
| CAM unavailable | timeout/transport/protocol error | dependency failure, not unauthorized |
| Missing context | context error | authentication/context failure |

When request Tags apply, add matching, missing, and mismatched cases. Assert that request Tags are passed to CAM only for Actions declaring the request-Tag axis.

For a negative Create case with prerequisite permissions, keep those prerequisite permissions allowed. The test must fail because the target Create permission is absent, not because an unrelated dependency cannot be read.

## List tests

List tests must distinguish Action denial from resource filtering:

| Case | Expected API behavior |
|---|---|
| Missing List Action | `AuthFailure.UnauthorizedOperation` |
| List Action + target resource allowed | return target |
| List Action + only another resource allowed | success, target omitted |
| Unconditional List Action + untagged target | return target |
| Resource-Tag condition + matching Tag | return target |
| Resource-Tag condition + missing Tag | success, target omitted |
| Resource-Tag condition + mismatched Tag | success, target omitted |
| Tag read failure during filtering | dependency failure; never success-empty |

Use at least two raw candidates so an allow test cannot pass accidentally by returning everything. Prove that filtered results preserve deterministic order.

Lock pagination on authorized results:

- `TotalCount` equals the complete authorized count;
- first page contains only authorized resources;
- later page contains the next authorized resources, not raw-candidate positions;
- an offset past the authorized count returns an empty page with unchanged `TotalCount`;
- unauthorized raw resources never affect counts or page shape.

Assert that a no-permission error from wildcard `CheckResource` maps to missing List Action. Assert that an empty filtered resource set without error maps to successful empty output.

## Tag policy tests

Generate policy conditions only in aggregate form:

```json
{
  "for_any_value:string_equal": {
    "qcs:request_tag": ["request-key&request-value"],
    "qcs:resource_tag": ["resource-key&resource-value"]
  }
}
```

Test:

- request-only Action;
- resource-only Action;
- Action supporting both axes;
- Action supporting neither axis returns no Tag condition;
- multiple Tags have deterministic ordering;
- no key begins with `qcs:request_tag/` or `qcs:resource_tag/`.

## Tag read and mutation tests

Use fake Tag clients to lock live-read semantics:

- resource IDs are converted to internal six-segment QCS values;
- returned Tags are normalized and deterministically sorted;
- nil/malformed entries are ignored without inventing values;
- successful untagged reads return an empty Tag list;
- read failures remain failures and are never converted to an empty map;
- response projection uses the read result, not the request payload.

Table-test the custom-Tag difference:

| Current | Wanted | `replaceTags` | `deleteTags` |
|---|---|---|---|
| none | `a=1` | `a=1` | none |
| `a=1` | `a=1` | none | none |
| `a=1` | `a=2` | `a=2` | none |
| `a=1,b=2` | `a=1` | none | `b=2` |
| `a=1` | none | none | `a=1` |

Assert the `qcloud.tag.modifyResourceTags` wire payload contains exactly:

- `uin`;
- `createUin`;
- `resource`;
- applicable `replaceTags`;
- applicable `deleteTags`.

Assert it does not contain `projectId`. Assert a no-op difference performs no write. Assert write concurrency is bounded and a canceled context can stop waiting for a slot.

Lock request-field presence separately from the difference algorithm:

- Create with Tags omitted or empty performs no custom Tag write;
- Modify with Tags omitted leaves existing custom Tags unchanged and performs no read/write for replacement;
- Modify with Tags present and empty deletes every custom Tag but preserves system Tags;
- Modify with Tags present and non-empty applies exact-set replacement;
- duplicate custom keys and the reserved creator key are rejected before CAM/Tag mutation.

## Creator-Tag tests

Run these tests only when the creator-Tag extension is enabled, and report them as N/A otherwise.

Assert:

- custom Tag behavior is identical whether creator Tag support is enabled or disabled;
- attach uses `qcloud.system.AttachResourceSystemTag` and key `qcs:tag:createdBy`;
- detach uses `qcloud.system.DetachResourceSystemTag` and the same key;
- custom replace and clear exclude the creator Tag;
- exact custom-Tag comparisons ignore the creator Tag but do not ignore arbitrary extra custom Tags;
- creator-Tag failure is classified separately from custom-Tag failure;
- business resource deletion triggers detach/custom removal only after committed deletion is established.

## Error-contract tests

For every expected authorization rejection, assert:

- code is exactly `AuthFailure.UnauthorizedOperation`;
- message is non-empty and identifies the actual Action;
- message uses the customer-visible QCS form;
- Create/List show `*`; concrete-resource Actions show the target ID;
- outer RequestId is non-empty;
- RequestId embedded in the message matches the outer RequestId when the message format carries it;
- raw CAM policy, CAM context, credentials, and internal stack details are absent.

Keep the original dependency error available to internal diagnostics when a public error assertion fails. This preserves coded error and RequestId evidence.

## Cache tests

If authorization caching is disabled, mark this section N/A. If enabled, prove:

- same stable identity, Action, resource, and normalized request Tags hit the cache;
- Tag input order does not change the key;
- sub-users do not share decisions;
- Roles with different stable Role details do not share decisions;
- allow and deny decisions expire at the declared TTL;
- cache read failure falls back to direct CAM;
- cache write failure does not change the current CAM result;
- complete CAM context, QToken, and credentials are absent from serialized keys/values;
- List results and Tag reads are not cached.

For permission-propagation test specifications, use a bounded wait at least as long as the declared maximum policy/cache propagation window. Preserve the last real authorization error and RequestId if the wait expires.

## Black-box acceptance specification

Generate a repository-local data structure or document describing the cases that a separate environment-specific runner could execute. Do not execute it here.

For each applicable Action, include:

1. main-account positive behavior;
2. sub-user and Role positive Action/resource behavior;
3. sub-user and Role wrong-Action behavior;
4. sub-user and Role other-resource behavior;
5. request-Tag matching, missing, and mismatched behavior when supported;
6. resource-Tag matching, missing, and mismatched behavior when supported;
7. standard public unauthorized response assertions;
8. successful response and returned-Tag assertions when applicable.

For List, also include unconditional access to an untagged resource, successful empty results for other-resource and Tag mismatch, authorized `TotalCount`, pagination, and beyond-end empty page.

Describe identities as immutable policy profiles. Do not propose switching policies on one Role or user inside a scenario because authorization caches can leak old decisions across cases.

## Completion gate

The test design is complete only when:

- every Action appears exactly once in the ownership table and at least once in the coverage report;
- every supported Tag axis has positive, missing, and mismatched coverage;
- every unsupported Tag axis is explicitly N/A;
- List Action denial and successful empty filtering are separately tested;
- custom Tag changed-value behavior cannot produce the same key in replace and delete sets;
- creator Tag is optional and cannot affect custom Tag coverage;
- public errors and internal dependency classifications are tested separately;
- no test requires a live environment to establish repository-local correctness.
