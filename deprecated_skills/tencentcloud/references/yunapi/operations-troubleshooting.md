# Operations and Troubleshooting

Primary sources: `4009690585`, `4009690099`, `4026002734`, `4012202251`, `4024061584`, `4009317231`, `4007983604`, `4007888053`, `4007829070`, `4007799512`, `4009690116`.

## Observability baseline

- Propagate the YunAPI RequestId into backend access/application logs and return the matching RequestId.
- Maintain access to request logs for development, test, pre-release, and production.
- Configure dashboards and alerts for request volume, success/availability, latency, gateway errors, backend errors/timeouts, and throttling.
- Ensure current product developers/on-call recipients receive alerts; validate notification delivery.
- Define availability thresholds according to the current product rule; understand numerator/denominator and exclusions before interpreting a breach.

## Request-chain diagnosis

The common chain includes access, authentication, frequency limiting, and backend proxy stages. For an incident:

1. Capture environment, endpoint/region, product/version/Action, timestamp/timezone, caller identity class, exact error, and RequestId.
2. Query the complete chain by RequestId. The CLS dataset described by the docs is `cloudapi_cls_req_log`; `zhiyan-log` MCP supports OAuth (preferred for clients) or PAT (automation) after permissions are granted.
3. Determine the last successful boundary: request entry, signature/authentication, CAM, rate limit, route, backend connect, backend response, or gateway response validation.
4. Compare gateway logs with backend logs using RequestId and time. Separate observed facts at each boundary.
5. Check configuration diff, release/gray state, backend address, credentials/environment, caller-counting identity, and recent changes.
6. Use API Doctor/Explorer when they add an independent path observation.

Useful query dimensions: RequestId, Action, product, UIN identity class, status/error code, region, stage/component, and time range. Use aggregation for rates only after validating the raw sample semantics.

## Error branches

- **Signature/auth failure:** verify environment, clock, credential type, canonical request, token, Action/version/region, then CAM decision.
- **Throttling:** identify the exact limiter and counted identity (direct account, root/sub-account, assumed role/actor, group, IP, console).
- **Unknown/invalid parameter:** inspect request content type and gateway validation/compatibility path; JSON versus URL and old compatibility mode can differ (`4009892768`). Compare against the current contract before changing code.
- **Backend unavailable/timeout:** verify route, DNS/Polaris, TLS/Host, backend health, timeout budget, connection behavior, and whether gray routing selected a different backend.
- **Opaque InternalError:** read `gateway-request-id-escalation.md`; preserve the escalation packet and stop speculative response-shape edits.
- **Documentation/SDK mismatch:** compare CAPI configuration, generated docs, SDK propagation time, and actual Action/version.

## Operational features

- Call topology helps identify caller/backend relationships but is supporting evidence, not request-level proof.
- Configuration-difference and request-path views help expose environment drift.
- Status Page reporting has a dedicated source (`4009690116`); use its current approval/reporting procedure for public incidents.

## Incident output

Report timeline, impact, representative RequestIds, gateway facts, backend facts, configuration/release facts, diagnosis, mitigation/rollback, residual risk, owners, and follow-up validation.
