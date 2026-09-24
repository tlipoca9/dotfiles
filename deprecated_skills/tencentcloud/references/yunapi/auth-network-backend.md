# Authentication, Internal Calls, Domains, and Backends

Primary sources: `4009690709`, `4009690711`, `4009690393`, `4009690277`, `4009936495`, `4009690681`, `4009690322`, `4009690317`, `4009690267`, `4009690324`, `4007885709`, `4009317231`.

## Authentication model

- YunAPI signature proves request authenticity; CAM decides authorization. Neither substitutes for backend object-level authorization and input security.
- Define whether the Action is resource-level. CAM resource descriptions use the current six-segment resource form and applicable condition keys; use non-resource authorization only when the product truly cannot identify a resource.
- For delegated/full-ticket calls, preserve the intended user identity and authorization chain. Do not silently fall back to a shared privileged identity.

## Internal service calls

Prefer the current service-account authorization model for machine-to-machine calls:

1. The callee defines the internal API, callable scope, CAM/resource model, and required service-account grant.
2. The caller obtains least-privilege service-account authorization and uses the approved internal endpoint/SDK/tooling.
3. Both sides validate identity semantics, RequestId propagation, quotas, expiration/rotation, and revocation.

The older “大账号” document (`4009690342`) is historical; do not recommend it over the current service-account flow without explicit platform confirmation.

Internal docs/Explorer/SDK can be used for internal-only Actions. “Not shown publicly” is not an access control.

## Environments and credentials

Identify development, test, pre-release, and production explicitly. Use only credentials approved for that environment. Development/test cannot be used as a production calling path, and their backend addresses must not target production.

Never paste SecretId/SecretKey, PAT, session token, or service-account material into tickets, skill output, source files, or examples. Ask the user to configure secrets through the approved credential mechanism.

## Endpoint selection

Choose among public/internal/control-plane clusters and domain or Polaris addresses based on caller network, Action scope, environment, and regional disaster-recovery requirements. Do not copy an endpoint from another environment.

For each route capture:

- caller network and environment;
- domain/Polaris service and namespace;
- regional versus non-regional behavior;
- TLS/Host/SNI requirements;
- timeout/retry/idempotency behavior;
- disaster-recovery target and data-isolation constraints.

The consolidated domain/Polaris guide is `4009936495`; consult it for exact current addresses rather than embedding addresses in generated instructions.

## Backend and gray backend

Backend configuration is environment-specific. Validate health, protocol, path, timeout, request headers, RequestId logging, and response contract. Gray backend routing can shift only selected traffic; verify the selected slice before global promotion.

Singapore/data-isolation routing has dedicated constraints (`4009690324`); consult the source for exact current topology.

## Diagnosis

Use API Doctor for an internal end-to-end diagnosis or shareable diagnostic URL, then correlate with Explorer and logs. Record what Doctor observed at each hop rather than treating its overall label as the root cause.
