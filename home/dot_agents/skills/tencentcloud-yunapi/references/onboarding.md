# Product and API Onboarding

Primary sources: `4009690583`, `4009892838`, `4013886822`, `4016456514`, `4024486988`.

## Preconditions

- Complete product registration in the appropriate cloud/product system. A console entry alone may not equal an official website product.
- Settle the immutable or costly-to-change identifiers first: product English name, public product name, API version, website documentation category, owners, product FT, and CAM model.
- Product name: lowercase English letters or lowercase letters plus digits, starts with a letter, 2–16 characters. Version: `YYYY-MM-DD`.
- Identify product/API administrators, developers, API security owner, testers, document/translation owner, backend owner, and release approvers.
- Assess backend requirements: HTTPS/HTTP behavior, timeout, idempotency, RequestId propagation, CAM, rate limits, availability, regional/data-isolation needs, and `tcp_timestamps` where relevant to short-connection TIME_WAIT reuse.

## End-to-end path

1. Register or select the product in CAPI (`capi.woa.com`) and configure product metadata, owners, FT, recommended version, visibility, and environments.
2. Add a complete API version rather than fragmenting a product across unnecessary versions.
3. Define reusable data structures before Actions that reference them; some editors do not preserve unfinished dependent configuration.
4. Create/import Actions, request/response fields, errors, examples, backend routes, CAM resources/conditions, callable scope, document visibility, rate limits, and risk/security ownership.
5. Pass automated specification checks and required product/YunAPI review. Resolve uncertainty rather than working around validators.
6. Integrate in development and use Explorer to self-test success and failure paths. Inspect the complete request chain by RequestId.
7. Submit testing and associate the required TAPD/test evidence. New APIs normally proceed through test and pre-release.
8. In pre-release, perform at least one successful CAM-enabled request where required; verify security controls and run security scans. YunAPI authentication does not prevent SQL injection, broken authorization, or other application flaws.
9. Preview generated API documentation and examples; verify public fields, error codes, descriptions, visibility, and language output.
10. Release through gray configuration, validate the gray slice, obtain approvals, then globally release. Prepare rollback.
11. Publish website docs/SDK/CLI artifacts through the documentation process. First publication may require product-level setup; SDK propagation can lag documentation.
12. Confirm alerts, dashboards, log access, on-call recipients, availability threshold, and incident ownership.

## Completion checklist

- Product/version/owners and FT are correct.
- API and data structures pass current 3.0 mandatory rules.
- Backend addresses are environment-safe; CAM and access scope are intentional.
- Self-test, test gate, pre-release request, security checks, and documentation preview have evidence.
- Gray and global state are verified independently.
- Logs, alerts, rollback target, docs, SDK/CLI expectations, and support path are recorded.
