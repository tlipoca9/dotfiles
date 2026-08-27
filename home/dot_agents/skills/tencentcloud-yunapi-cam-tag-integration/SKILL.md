---
name: tencentcloud-yunapi-cam-tag-integration
description: Design or implement CAM and Tag integration for Tencent Cloud YunAPI resources. Use for new YunAPI resources, CAM Action and six-segment QCS design, request/resource Tag authorization, List resource filtering, creator tags, standard authorization errors, platform registration specifications, or reviewing an existing CAM/Tag integration.
---

# Tencent Cloud YunAPI CAM and Tag Integration

Build a repository-independent CAM and Tag integration from explicit contracts. Treat the target repository as evidence, not as a template: discover its language, request model, dependency boundaries, and existing conventions before proposing files or code.

## Scope

Cover resource modeling, platform registration specifications, implementation, local tests, contract-test design, and failure diagnosis. Do not perform or prescribe environment verification, deployment checks, or test-environment cleanup. Do cover Tag behavior when the product's business resource is deleted; that is functional lifecycle correctness, not environment cleanup.

Treat custom Tags as the core feature. Treat the creator system Tag `qcs:tag:createdBy` as an independent, opt-in extension with separate configuration, errors, and tests.

## Read the bundled references

Read [platform-contract.md](references/platform-contract.md) before making design or implementation decisions. It is the normative language-independent contract.

Read [ap-chongqing.md](references/ap-chongqing.md) when producing configuration for Chongqing. Use its versioned values as defaults, allow explicit overrides, and never add credentials or unrelated data stores.

Read [go-pseudocode.md](references/go-pseudocode.md) when the target is Go. Adapt the pseudocode to the repository; do not promise that the snippets compile unchanged.

Read [testing.md](references/testing.md) before adding or reviewing tests. Apply every matrix cell that is applicable to the resource and mark unsupported Tag axes as N/A rather than silently omitting them.

## Workflow

### 1. Freeze the resource specification

Inspect the target API definitions, handlers, models, configuration, dependencies, and tests. Produce one `ResourceIntegrationSpec` containing:

- YunAPI service type, resource type/prefix, region source, owner UIN source, creator UIN source, and resource ID source;
- every Action, classified as Create, Modify, List, or single-resource Action;
- request Tags, resource Tags, returned Tags, pagination, and optional creator-Tag capabilities per Action;
- the internal CAM QCS and customer-visible error QCS forms;
- action-specific prerequisite permissions that are not the permission under test.

Do not infer capabilities from Action names. Finish only when every Action and Tag axis is explicitly supported or N/A.

### 2. Freeze authorization ownership

Create an Action responsibility table. Assign each Action to exactly one intentional pattern:

- YunAPI gateway authorization;
- service-internal CAM authorization;
- gateway Action authorization plus service-internal resource filtering.

Use service-internal authorization for request-Tag evaluation and service-internal filtering for a List whose candidate resources must be filtered by resource or resource Tag. Do not parse CAM context again for an Action that the gateway fully authorizes. Finish only when no Action is unowned or accidentally authorized twice.

### 3. Freeze platform registration inputs

Produce the registration specification from the resource and Action tables. Include the service type, resource type, Action-to-resource mapping, internal and public QCS patterns, List behavior, request/resource Tag capability, and the separately selected creator-Tag capability.

Do not claim that registration has been applied or verified. This skill defines the required registration artifact; external application and environment verification are out of scope.

### 4. Implement narrow adapters

Keep these boundaries separate:

- request/CAM context preparation;
- single-resource CAM authorization;
- List CAM filtering;
- live Tag reading;
- custom Tag writing;
- optional creator-Tag attachment/detachment;
- optional authorization cache.

Keep service/resource names in configuration or the resource specification, not scattered through handlers. Keep credentials, complete CAM context, QToken, Tag keys, and Tag values out of logs and metrics.

### 5. Implement Tag semantics

Read live Tags; do not introduce a mirror table or treat request Tags as confirmed stored state. Use `qcloud.tag.modifyResourceTags` for custom Tag mutations through one replace/delete adapter. A changed value belongs only in `replaceTags`; `deleteTags` contains only keys absent from the desired custom-Tag set.

Exclude `qcs:tag:createdBy` from custom Tag replacement and clearing. If creator Tags are enabled, use the separate system-Tag operations and keep their capability and failures independent from custom Tags.

Apply the failure rules in the platform contract. In particular, fail closed when a Tag read is required for authorization.

### 6. Implement CAM semantics

Populate the YunAPI request context and decoded CAM context before calling CAM. Use `SigAndAuth` for single-resource authorization and wildcard-aware `CheckResource` filtering for List candidates. Map CAM no-permission errors to the standard YunAPI unauthorized response; classify missing context separately from downstream unavailability.

Apply the List contract before pagination: filter candidates first, then calculate `TotalCount` and page the authorized result.

If authorization caching is enabled, make it an optional adapter. Include stable principal and Role identity, Action, region, resource, request source, and a deterministic request-Tag digest in the key. Cache failures must fall back to direct CAM calls.

### 7. Lock the behavior with tests

Add deterministic unit and component-contract tests from [testing.md](references/testing.md). Generate the black-box acceptance matrix as a test specification, but do not connect to or execute against a real environment.

Finish only when tests distinguish wrong Action, wrong resource, missing/mismatched request Tag, missing/mismatched resource Tag, List empty-result semantics, standard errors, creator-Tag opt-in behavior, cache isolation, and Tag replacement behavior.

### 8. Review the integration as a contract

Before handing off, verify all of the following:

- every Action has one authorization owner;
- internal and customer-visible QCS forms are not conflated;
- List filters before `TotalCount` and pagination;
- Tag-dependent authorization fails closed;
- custom Tags and creator Tags remain independent;
- no changed Tag key appears in both replace and delete sets;
- platform registration inputs match the implemented resource and Action tables;
- Chongqing defaults, if used, match the bundled regional reference or are explicitly overridden;
- tests cover every applicable cell and label the rest N/A.

Report unresolved registration or dependency assumptions explicitly. Do not replace missing evidence with a live probe, deployment, or environment mutation.
