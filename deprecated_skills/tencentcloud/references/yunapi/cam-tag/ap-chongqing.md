# Chongqing CAM and Tag Defaults

These are non-secret, role-specific defaults for `ap-chongqing`, verified on 2026-08-21. Treat them as versioned defaults, not immutable platform constants. Allow explicit configuration overrides. Do not bundle Redis, database, account, credential, or token settings with them.

## Polaris and endpoint mapping

| Role | Namespace | Service | Host | Endpoint | UseTransport |
|---|---|---|---|---|---|
| Tag read | `Production` | `1179521:65536` | `tag.tencentyun.com` | `http://tag.tencentyun.com:50030` | `false` |
| Tag write | `Production` | `1221441:65536` | `wtag.tencentyun.com` | `http://wtag.tencentyun.com:50031` | `false` |
| CAM Auth | `Production` | `1109697:65536` | `auth.cam.logical.server.console.tencentyun.com` | `http://auth.cam.logical.server.console.tencentyun.com:9502` | `false` |
| CAM List | `Production` | `1109697:131072` | `list.cam.tencentyun.com` | `http://list.cam.tencentyun.com:52022` | `false` |

CAM Auth and CAM List are distinct roles and must not share the same service identifier by accident. Tag read and Tag write are also distinct clients.

## Repository-neutral configuration shape

Adapt field names to the target repository while preserving the four roles:

```yaml
camTag:
  enabled: true
  serviceType: "<yunapi-service-type>"
  polaris:
    tagRead:
      namespace: "Production"
      service: "1179521:65536"
      host: "tag.tencentyun.com"
      endpoint: "http://tag.tencentyun.com:50030"
      useTransport: false
    tagWrite:
      namespace: "Production"
      service: "1221441:65536"
      host: "wtag.tencentyun.com"
      endpoint: "http://wtag.tencentyun.com:50031"
      useTransport: false
    camAuth:
      namespace: "Production"
      service: "1109697:65536"
      host: "auth.cam.logical.server.console.tencentyun.com"
      endpoint: "http://auth.cam.logical.server.console.tencentyun.com:9502"
      useTransport: false
    camList:
      namespace: "Production"
      service: "1109697:131072"
      host: "list.cam.tencentyun.com"
      endpoint: "http://list.cam.tencentyun.com:52022"
      useTransport: false
  creatorTag:
    enabled: false
```

Keep creator-Tag enablement independent from CAM and custom Tag enablement. Keep optional authorization-cache configuration outside this regional block so the same regional endpoints can be used without Redis.

## Configuration review gate

Before completing a repository change, verify statically that:

- all four roles are either configured or explicitly unused by the Action responsibility table;
- CAM Auth and CAM List point to their own service IDs;
- Tag read and Tag write use different endpoints;
- the product service type is not hard-coded in shared clients;
- region comes from the validated YunAPI request for QCS construction;
- no credential or unrelated connection value was copied into the regional defaults.

This gate is a configuration review. It does not perform DNS, network, Polaris, deployment, or live-environment verification.
