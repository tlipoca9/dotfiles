# API Documentation and Internationalization

Primary sources: `4007788550`, `4016430323`, `4016587471`, `4015198156`, `4014405589`, `4016339611`, `4010045604`, `4026012351`, `4010974337`, `4018651030`, `4007885709`.

## Documentation content

Generated documentation is part of the public contract. Verify:

- Action/product/version and endpoint are correct.
- Request/response descriptions explain semantics, units, formats, constraints, conditional requirements, enum meanings, defaults, and cross-field relationships.
- Data-structure fields are documented where defined; avoid duplicated or contradictory descriptions.
- Error descriptions tell users what failed and what they can do.
- Examples use HTTPS, v3 signature conventions, a non-regional endpoint, matching `X-TC-Action`, safe placeholders for changing public parameters, and non-sensitive plausible values.
- API-level and parameter-level display scopes are intentional.

The parameter-description editor separates description elements; fill each applicable element rather than packing ambiguous prose into one field. AI quality detection is a review aid, not authority.

## Examples

For new and existing APIs, manage examples through the supported example workflow. If an existing generated example is unsafe or noncompliant, replace it in document-content management or with a verified Explorer call, then save and publish the Action. Manual editing may require a product/interface allowlist.

Never publish real UINs, keys, tokens, internal addresses, customer data, or live signed requests.

## Publication

1. Preview generated Chinese docs and compare them to configuration.
2. Confirm website product/category prerequisites and product introduction.
3. Publish through the API-document tool; first product publication may require setup.
4. Verify the actual website page, not only a successful platform status.
5. Account for asynchronous propagation: docs may publish on a schedule and SDK updates can arrive later.

Internal API docs, internal Explorer, and internal SDK are separate developer surfaces; document visibility is not authorization.

## International site

The newer English translation guide `4026012351` supersedes older workflow details where they conflict:

1. Ensure the source Chinese API documentation is current and in the internationalization list.
2. Submit translation and monitor progress.
3. Perform business/technical review; fix terminology, field semantics, examples, and formatting.
4. Preview and compare source/target documents.
5. Publish, then verify the international-site page.

For international-site Chinese docs, complete the initial website-category/visibility setup, push the intended scope, and use the single-document update/downline workflow thereafter.

Remove invisible `U+200D` characters when they break translation or publication, then republish and verify. Preserve meaningful Unicode; do not indiscriminately strip all non-ASCII characters.
