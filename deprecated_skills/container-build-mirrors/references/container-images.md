# Container Image Mirrors

## Docker Hub accelerator priority

Docker Hub accelerators are volatile. Choose the narrowest primitive that matches the target build environment:

1. Project-owned or cloud-account accelerator documented for that environment.
   - Alibaba Cloud ACR personal accelerator: account-specific `<id>.mirror.aliyuncs.com`; configure as a Docker/containerd registry mirror, not as a repository default.
   - Huawei Cloud SWR accelerator: account/region-specific accelerator; configure the runtime and verify with `docker info`.
   - Tencent Cloud/TCR accelerator or legacy Docker Hub mirror: use only when the target Tencent Cloud network or TCR instance documents and verifies the endpoint. Do not assume `mirror.ccs.tencentyun.com` resolves everywhere.
2. Portable source in checked-in Dockerfiles:
   - Default to explicit Docker Hub references such as `docker.io/library/alpine:3.24`.
   - Expose `BASE_REGISTRY` or image args so CI can override the registry without editing the Dockerfile.
3. Public mirror fallback when the target network has no account accelerator:
   - DaoCloud public mirror supports prefix form `m.daocloud.io/docker.io/<namespace>/<image>:<tag>` and Docker Hub prefix-replacement form `docker.m.daocloud.io/<namespace>/<image>:<tag>`.
   - Prefer the prefix form for one-off pull/build commands because it preserves the original source registry in the reference.
   - Use public mirrors only after a live pull probe succeeds; expect rate limits, cached tags, and temporary 404/EOF failures.
4. Self-hosted pull-through cache for stable CI or production build networks:
   - Run an official Docker Registry pull-through cache with `proxy.remoteurl: https://registry-1.docker.io`.
   - Protect credentials if private Docker Hub content is cached.

## Docker Hub image references

For checked-in Dockerfiles that must remain portable, keep Docker Hub explicit and overridable:

```dockerfile
ARG BASE_REGISTRY=docker.io
FROM ${BASE_REGISTRY}/library/golang:1.26.4-alpine
```

For a verified Docker Hub-compatible mirror that supports direct prefix replacement, override `BASE_REGISTRY`:

```sh
podman build --build-arg BASE_REGISTRY=docker.m.daocloud.io -t IMAGE:TAG -f Containerfile .
```

For DaoCloud's preferred source-preserving prefix form, define full image args instead of a single `BASE_REGISTRY`:

```dockerfile
ARG GO_IMAGE=docker.io/library/golang:1.26.4-alpine
ARG ALPINE_IMAGE=docker.io/library/alpine:3.24

FROM ${GO_IMAGE} AS builder
FROM ${ALPINE_IMAGE}
```

```sh
podman build \
  --build-arg GO_IMAGE=m.daocloud.io/docker.io/library/golang:1.26.4-alpine \
  --build-arg ALPINE_IMAGE=m.daocloud.io/docker.io/library/alpine:3.24 \
  -t IMAGE:TAG \
  -f Containerfile .
```

Official Docker Hub library images use the `library/` namespace. Non-library images keep their Docker Hub namespace:

```dockerfile
FROM docker.io/library/nginx:1.27-alpine
FROM docker.io/prom/prometheus:v2.54.1
```

## Pull and build commands

Preferred local build:

```sh
podman pull docker.io/library/alpine:3.24
podman build -t IMAGE:TAG -f Containerfile .
```

Public mirror fallback after a live probe:

```sh
podman pull m.daocloud.io/docker.io/library/alpine:3.24
podman pull docker.m.daocloud.io/library/alpine:3.24
```

Docker-compatible fallback:

```sh
docker build -t IMAGE:TAG -f Dockerfile .
```

## Host-level fallback

Use host-level mirror configuration for account-specific accelerators, when explicit mirror references would be too invasive, when a third-party tool hardcodes Docker Hub names, or when the target build platform requires standard Docker Hub image names.

Podman fallback:

```toml
[[registry]]
prefix = "docker.io"
location = "docker.io"

[[registry.mirror]]
location = "<verified-accelerator-host>"
```

Docker fallback:

```json
{
  "registry-mirrors": ["https://<verified-accelerator-host>"]
}
```

## Verification

Run pull probes from the target build network before committing explicit mirror references:

```sh
podman pull docker.io/library/alpine:3.24
podman pull m.daocloud.io/docker.io/library/alpine:3.24
podman pull docker.m.daocloud.io/library/alpine:3.24
podman pull <verified-accelerator-host>/library/alpine:3.24
```

For openEuler base images in China-networked builds, prefer the domestic registry path documented by openEuler:

```dockerfile
FROM hub.oepkgs.net/openeuler/openeuler:latest
```
