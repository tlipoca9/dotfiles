# Infrastructure And Security Mirrors

Use these mirrors only when the container image directly installs the corresponding infrastructure or security packages. Prefer application base images or distro packages when they already satisfy the build.

## NGINX Official Packages

- NGINX official APT/RPM/APK packages: `https://mirrors.ustc.edu.cn/nginx/`

Use these only when the image needs NGINX packages from the official NGINX repository instead of distro-provided packages.

Debian/Ubuntu:

```dockerfile
ARG NGINX_APT_DISTRO=debian
ARG DEBIAN_CODENAME=bookworm

RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends ca-certificates curl gnupg; \
    curl -fsSL https://mirrors.ustc.edu.cn/nginx/keys/nginx_signing.key \
      | gpg --dearmor -o /usr/share/keyrings/nginx.gpg; \
    printf 'deb [signed-by=/usr/share/keyrings/nginx.gpg] https://mirrors.ustc.edu.cn/nginx/%s/ %s nginx\n' \
      "$NGINX_APT_DISTRO" "$DEBIAN_CODENAME" \
      > /etc/apt/sources.list.d/nginx.list; \
    apt-get update; \
    apt-get install -y --no-install-recommends nginx; \
    rm -rf /var/lib/apt/lists/*
```

Set `NGINX_APT_DISTRO=ubuntu` for Ubuntu bases.

RHEL-compatible:

```dockerfile
RUN printf '%s\n' \
      '[nginx-stable]' \
      'name=nginx stable repo' \
      'baseurl=https://mirrors.ustc.edu.cn/nginx/rhel/$releasever/$basearch/' \
      'gpgcheck=1' \
      'enabled=1' \
      'gpgkey=https://mirrors.ustc.edu.cn/nginx/keys/nginx_signing.key' \
      'module_hotfixes=true' \
      > /etc/yum.repos.d/nginx.repo \
    && dnf install -y nginx \
    && dnf clean all \
    && rm -rf /var/cache/dnf
```

Alpine:

```dockerfile
ARG ALPINE_VERSION=v3.22

RUN wget -O /etc/apk/keys/nginx_signing.rsa.pub https://nginx.org/keys/nginx_signing.rsa.pub \
    && printf '%s\n' "https://mirrors.ustc.edu.cn/nginx/alpine/${ALPINE_VERSION}/main" \
      >> /etc/apk/repositories \
    && apk add --no-cache nginx
```

## OpenResty Official Packages

- OpenResty official APT/RPM packages: `https://mirrors.ustc.edu.cn/openresty/`

Use this when the image needs official OpenResty packages for NGINX+Lua, Kong/APISIX-style builds, or OpenResty module work.

Debian/Ubuntu:

```dockerfile
ARG OPENRESTY_APT_DISTRO=debian
ARG DEBIAN_CODENAME=bookworm

RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends ca-certificates curl gnupg; \
    curl -fsSL https://openresty.org/package/pubkey.gpg \
      | gpg --dearmor -o /usr/share/keyrings/openresty.gpg; \
    printf 'deb [signed-by=/usr/share/keyrings/openresty.gpg] https://mirrors.ustc.edu.cn/openresty/%s %s main\n' \
      "$OPENRESTY_APT_DISTRO" "$DEBIAN_CODENAME" \
      > /etc/apt/sources.list.d/openresty.list; \
    apt-get update; \
    apt-get install -y --no-install-recommends openresty; \
    rm -rf /var/lib/apt/lists/*
```

Set `OPENRESTY_APT_DISTRO=ubuntu` for Ubuntu bases.

RHEL-compatible:

```dockerfile
RUN printf '%s\n' \
      '[openresty]' \
      'name=OpenResty Repository' \
      'baseurl=https://mirrors.ustc.edu.cn/openresty/rhel/$releasever/$basearch' \
      'enabled=1' \
      'gpgcheck=1' \
      'gpgkey=https://openresty.org/package/pubkey.gpg' \
      > /etc/yum.repos.d/openresty.repo \
    && dnf install -y openresty \
    && dnf clean all \
    && rm -rf /var/cache/dnf
```

## ClickHouse

- ClickHouse APT/RPM: `https://mirrors.aliyun.com/clickhouse/`

Debian/Ubuntu:

```dockerfile
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends ca-certificates curl gnupg; \
    curl -fsSL https://mirrors.aliyun.com/clickhouse/rpm/stable/repodata/repomd.xml.key \
      | gpg --dearmor -o /usr/share/keyrings/clickhouse.gpg; \
    printf '%s\n' \
      'deb [signed-by=/usr/share/keyrings/clickhouse.gpg] https://mirrors.aliyun.com/clickhouse/deb/stable/ main/' \
      > /etc/apt/sources.list.d/clickhouse.list; \
    apt-get update; \
    apt-get install -y --no-install-recommends clickhouse-client; \
    rm -rf /var/lib/apt/lists/*
```

RHEL-compatible:

```dockerfile
RUN printf '%s\n' \
      '[clickhouse-stable]' \
      'name=ClickHouse - Stable Repository' \
      'baseurl=https://mirrors.aliyun.com/clickhouse/rpm/stable/' \
      'gpgkey=https://mirrors.aliyun.com/clickhouse/rpm/stable/repodata/repomd.xml.key' \
      'repo_gpgcheck=1' \
      'enabled=1' \
      > /etc/yum.repos.d/clickhouse.repo \
    && dnf install -y clickhouse-client \
    && dnf clean all \
    && rm -rf /var/cache/dnf
```

Keep repository signature verification enabled. Do not set `repo_gpgcheck=0` to work around mirror or key problems.

## InfluxData

- InfluxData APT/RPM: `https://mirrors.ustc.edu.cn/influxdata/`

Debian/Ubuntu:

```dockerfile
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends ca-certificates curl; \
    curl -fsSL https://mirrors.ustc.edu.cn/influxdata/debian/packages/influxdata-archive-keyring_2026.01.09_all.deb \
      -o /tmp/influxdata-archive-keyring.deb; \
    apt-get install -y /tmp/influxdata-archive-keyring.deb; \
    printf '%s\n' \
      'deb [signed-by=/usr/share/keyrings/influxdata-archive.gpg] https://mirrors.ustc.edu.cn/influxdata/debian stable main' \
      > /etc/apt/sources.list.d/influxdata.list; \
    apt-get update; \
    apt-get install -y --no-install-recommends telegraf; \
    rm -rf /var/lib/apt/lists/* /tmp/influxdata-archive-keyring.deb
```

RHEL-compatible:

```dockerfile
RUN printf '%s\n' \
      '[influxdata]' \
      'name = InfluxData Repository - Stable' \
      'baseurl = https://mirrors.ustc.edu.cn/influxdata/stable/$basearch/main' \
      'enabled = 1' \
      'gpgcheck = 1' \
      'gpgkey = https://repos.influxdata.com/influxdata-archive.key' \
      > /etc/yum.repos.d/influxdata.repo \
    && dnf install -y telegraf \
    && dnf clean all \
    && rm -rf /var/cache/dnf
```

When the InfluxData keyring package version changes, update the filename from the mirror directory instead of hardcoding an obsolete `.deb`.

## Ceph

- Ceph packages and source tarballs: `https://mirrors.ustc.edu.cn/ceph/`

Debian/Ubuntu:

```dockerfile
ARG CEPH_RELEASE=reef
ARG DEBIAN_CODENAME=bookworm

RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends ca-certificates curl gnupg; \
    curl -fsSL https://mirrors.ustc.edu.cn/ceph/keys/release.asc \
      | gpg --dearmor -o /usr/share/keyrings/ceph.gpg; \
    printf 'deb [signed-by=/usr/share/keyrings/ceph.gpg] https://mirrors.ustc.edu.cn/ceph/debian-%s/ %s main\n' \
      "$CEPH_RELEASE" "$DEBIAN_CODENAME" \
      > /etc/apt/sources.list.d/ceph.list; \
    apt-get update; \
    apt-get install -y --no-install-recommends ceph-common; \
    rm -rf /var/lib/apt/lists/*
```

RHEL-compatible:

```dockerfile
ARG CEPH_RELEASE=reef
ARG EL_MAJOR=9

RUN printf '%s\n' \
      '[ceph]' \
      'name=Ceph packages' \
      "baseurl=https://mirrors.ustc.edu.cn/ceph/rpm-${CEPH_RELEASE}/el${EL_MAJOR}/\$basearch" \
      'enabled=1' \
      'gpgcheck=1' \
      'gpgkey=https://mirrors.ustc.edu.cn/ceph/keys/release.asc' \
      > /etc/yum.repos.d/ceph.repo \
    && dnf install -y ceph-common \
    && dnf clean all \
    && rm -rf /var/cache/dnf
```

Set `CEPH_RELEASE`, distro codename, and EL major to match the base image.

## WineHQ Builds

- WineHQ builds: `https://mirrors.tuna.tsinghua.edu.cn/wine-builds/`

Use this only for images that need Wine, such as Electron/Windows cross-packaging or Windows compatibility test images.

Ubuntu:

```dockerfile
ARG UBUNTU_CODENAME=jammy

RUN dpkg --add-architecture i386 \
    && apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl gnupg \
    && curl -fsSL https://dl.winehq.org/wine-builds/winehq.key \
      | gpg --dearmor -o /usr/share/keyrings/winehq-archive.gpg \
    && printf 'deb [arch=amd64,i386 signed-by=/usr/share/keyrings/winehq-archive.gpg] https://mirrors.tuna.tsinghua.edu.cn/wine-builds/ubuntu/ %s main\n' "$UBUNTU_CODENAME" \
      > /etc/apt/sources.list.d/winehq.list \
    && apt-get update \
    && apt-get install -y --install-recommends winehq-stable \
    && rm -rf /var/lib/apt/lists/*
```

## GitLab Runner APT

- GitLab Runner APT: `https://mirrors.tuna.tsinghua.edu.cn/gitlab-runner/`

Use this only for CI build images that install `gitlab-runner` inside the image. Do not use the RPM mirror recipe if it requires disabling GPG checks.

```dockerfile
ARG DEBIAN_CODENAME=bookworm

RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends ca-certificates curl gnupg; \
    curl -fsSL https://packages.gitlab.com/runner/gitlab-runner/gpgkey \
      | gpg --dearmor -o /usr/share/keyrings/gitlab-runner.gpg; \
    printf 'deb [signed-by=/usr/share/keyrings/gitlab-runner.gpg] https://mirrors.tuna.tsinghua.edu.cn/gitlab-runner/debian %s main\n' "$DEBIAN_CODENAME" \
      > /etc/apt/sources.list.d/gitlab-runner.list; \
    apt-get update; \
    apt-get install -y --no-install-recommends gitlab-runner; \
    rm -rf /var/lib/apt/lists/*
```

## Google Chrome RPM

- Google Chrome RPM repository: `https://mirrors.aliyun.com/google-chrome/google-chrome/`

Use this only for browser test images based on RHEL/Fedora/openSUSE-compatible RPM systems. It does not cover Debian/Ubuntu APT.

```dockerfile
RUN printf '%s\n' \
      '[google-chrome]' \
      'name=google-chrome - Aliyun mirror' \
      'baseurl=https://mirrors.aliyun.com/google-chrome/google-chrome/' \
      'enabled=1' \
      'gpgcheck=1' \
      'gpgkey=https://dl.google.com/linux/linux_signing_key.pub' \
      > /etc/yum.repos.d/google-chrome.repo \
    && dnf install -y google-chrome-stable \
    && dnf clean all \
    && rm -rf /var/cache/dnf
```

## Kali Linux

- Kali APT: `https://mirrors.ustc.edu.cn/kali/`

Use this only for Kali-based security tool images such as `kalilinux/kali-rolling`.

```dockerfile
RUN printf '%s\n' \
      'deb https://mirrors.ustc.edu.cn/kali kali-rolling main non-free non-free-firmware contrib' \
      > /etc/apt/sources.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*
```

Kali does not use by-hash. If `apt-get update` reports a file-size mismatch during mirror sync, retry after the mirror finishes syncing rather than disabling signature checks.
