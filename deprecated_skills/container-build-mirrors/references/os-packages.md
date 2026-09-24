# OS Package Mirrors

## Mirror list

Tencent Cloud:

- Unified public/internal software mirror: `https://mirrors.cloud.tencent.com`
- Public software mirror alias: `https://mirrors.tencent.com`
- Tencent Cloud internal software mirror: `https://mirrors.tencentyun.com`
- Alpine APK: `https://mirrors.cloud.tencent.com/alpine/`
- Debian APT: `https://mirrors.cloud.tencent.com/debian/`
- Debian security APT: `https://mirrors.cloud.tencent.com/debian-security/`
- Debian archive APT: `https://mirrors.cloud.tencent.com/debian-archive/`
- Ubuntu APT: `https://mirrors.cloud.tencent.com/ubuntu/`
- Ubuntu Ports APT: `https://mirrors.cloud.tencent.com/ubuntu-ports/`
- Debian Multimedia APT: `https://mirrors.ustc.edu.cn/deb-multimedia/`
- CentOS Yum/DNF: `https://mirrors.cloud.tencent.com/centos/`
- CentOS Stream Yum/DNF: `https://mirrors.cloud.tencent.com/centos-stream/`
- CentOS Vault Yum/DNF: `https://mirrors.cloud.tencent.com/centos-vault/`
- EPEL Yum/DNF: `https://mirrors.cloud.tencent.com/epel/`
- Fedora Yum/DNF: `https://mirrors.cloud.tencent.com/fedora/`
- AlmaLinux Yum/DNF: `https://mirrors.cloud.tencent.com/almalinux/`
- openEuler Yum/DNF: `https://mirrors.ustc.edu.cn/openeuler/`
- Rocky Linux Yum/DNF: `https://mirrors.cloud.tencent.com/rocky/`
- Kubernetes packages: `https://mirrors.cloud.tencent.com/kubernetes/`
- Docker CE packages: `https://mirrors.cloud.tencent.com/docker-ce/`
- PostgreSQL PGDG packages: `https://mirrors.cloud.tencent.com/postgresql/repos/`
- MySQL Community packages: `https://mirrors.cloud.tencent.com/mysql/`
- MariaDB packages: `https://mirrors.cloud.tencent.com/mariadb/`
- MongoDB Community packages: `https://mirrors.cloud.tencent.com/mongodb/`

Domestic fallbacks:

- Arch Linux: `https://mirrors.tuna.tsinghua.edu.cn/archlinux/`
- openSUSE: `https://mirrors.tuna.tsinghua.edu.cn/opensuse/`
- openSUSE Packman: `https://mirrors.tuna.tsinghua.edu.cn/packman/`
- RPM Fusion: `https://mirrors.ustc.edu.cn/rpmfusion/`
- LLVM APT: `https://mirrors.tuna.tsinghua.edu.cn/llvm-apt`
- Bazel APT: `https://mirrors.tuna.tsinghua.edu.cn/bazel-apt`
- Elastic Stack APT/RPM: `https://mirrors.tuna.tsinghua.edu.cn/elasticstack/`
- Grafana APT/RPM: `https://mirrors.tuna.tsinghua.edu.cn/grafana/`
- Erlang Solutions APT: `https://mirrors.tuna.tsinghua.edu.cn/erlang-solutions/`
- Adoptium Debian/Ubuntu packages: `https://mirrors.tuna.tsinghua.edu.cn/Adoptium/deb`
- Adoptium RPM packages: `https://mirrors.tuna.tsinghua.edu.cn/Adoptium/rpm`

## Alpine

```dockerfile
RUN sed -i 's|https\?://dl-cdn.alpinelinux.org/alpine|https://mirrors.cloud.tencent.com/alpine|g' /etc/apk/repositories \
    && apk add --no-cache ca-certificates curl
```

## Debian

APT slim images often lack `ca-certificates`; use Tencent HTTP APT mirrors for bootstrap installs, then switch to HTTPS only if the image already has CA certificates or after installing them.

```dockerfile
RUN set -eux; \
    for f in /etc/apt/sources.list /etc/apt/sources.list.d/debian.sources; do \
      [ -f "$f" ] || continue; \
      sed -i \
        -e 's|http://deb.debian.org/debian|http://mirrors.cloud.tencent.com/debian|g' \
        -e 's|https://deb.debian.org/debian|http://mirrors.cloud.tencent.com/debian|g' \
        -e 's|http://security.debian.org/debian-security|http://mirrors.cloud.tencent.com/debian-security|g' \
        -e 's|https://security.debian.org/debian-security|http://mirrors.cloud.tencent.com/debian-security|g' \
        "$f"; \
    done \
    && apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*
```

## Ubuntu

```dockerfile
RUN set -eux; \
    for f in /etc/apt/sources.list /etc/apt/sources.list.d/ubuntu.sources; do \
      [ -f "$f" ] || continue; \
      sed -i \
        -e 's|http://archive.ubuntu.com/ubuntu|http://mirrors.cloud.tencent.com/ubuntu|g' \
        -e 's|https://archive.ubuntu.com/ubuntu|http://mirrors.cloud.tencent.com/ubuntu|g' \
        -e 's|http://security.ubuntu.com/ubuntu|http://mirrors.cloud.tencent.com/ubuntu|g' \
        -e 's|https://security.ubuntu.com/ubuntu|http://mirrors.cloud.tencent.com/ubuntu|g' \
        -e 's|http://ports.ubuntu.com/ubuntu-ports|http://mirrors.cloud.tencent.com/ubuntu-ports|g' \
        -e 's|https://ports.ubuntu.com/ubuntu-ports|http://mirrors.cloud.tencent.com/ubuntu-ports|g' \
        "$f"; \
    done \
    && apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*
```

## Debian Multimedia

Use Debian Multimedia only when Debian images need packages that are not available from Debian's official repositories, such as multimedia codecs or specialized ffmpeg builds.

```dockerfile
ARG DEBIAN_CODENAME=bookworm

RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends ca-certificates curl; \
    curl -fsSL https://mirrors.ustc.edu.cn/deb-multimedia/pool/main/d/deb-multimedia-keyring/deb-multimedia-keyring_2024.9.1_all.deb \
      -o /tmp/deb-multimedia-keyring.deb; \
    apt-get install -y /tmp/deb-multimedia-keyring.deb; \
    printf 'deb https://mirrors.ustc.edu.cn/deb-multimedia/ %s main non-free\n' "$DEBIAN_CODENAME" \
      > /etc/apt/sources.list.d/deb-multimedia.list; \
    apt-get update; \
    rm -f /tmp/deb-multimedia-keyring.deb
```

If the keyring package version changes, update the `.deb` filename from the mirror directory.

## Rocky Linux

```dockerfile
RUN sed -i \
      -e 's|^mirrorlist=|#mirrorlist=|g' \
      -e 's|^#baseurl=http://dl.rockylinux.org/$contentdir|baseurl=https://mirrors.cloud.tencent.com/rocky|g' \
      /etc/yum.repos.d/rocky*.repo \
    && dnf install -y ca-certificates curl \
    && dnf clean all \
    && rm -rf /var/cache/dnf
```

## EPEL, Fedora, and AlmaLinux

```dockerfile
RUN set -eux; \
    for f in /etc/yum.repos.d/epel*.repo /etc/yum.repos.d/fedora*.repo /etc/yum.repos.d/almalinux*.repo; do \
      [ -f "$f" ] || continue; \
      sed -i \
        -e 's|^metalink=|#metalink=|g' \
        -e 's|^mirrorlist=|#mirrorlist=|g' \
        -e 's|^#baseurl=https\?://download.example/pub/epel|baseurl=https://mirrors.cloud.tencent.com/epel|g' \
        -e 's|^#baseurl=https\?://download.fedoraproject.org/pub/fedora/linux|baseurl=https://mirrors.cloud.tencent.com/fedora|g' \
        -e 's|^# baseurl=https\?://repo.almalinux.org/almalinux|baseurl=https://mirrors.cloud.tencent.com/almalinux|g' \
        "$f"; \
    done \
    && dnf clean all \
    && rm -rf /var/cache/dnf
```

## CentOS Stream

Prefer writing the repo file because current Stream images use `metalink=` and lowercase repo filenames.

```dockerfile
RUN set -eux; \
    stream="$(rpm -E %centos)-stream"; \
    basearch="$(rpm -E %_arch)"; \
    printf '%s\n' \
      '[baseos]' \
      'name=CentOS Stream - BaseOS - Tencent' \
      "baseurl=https://mirrors.cloud.tencent.com/centos-stream/${stream}/BaseOS/${basearch}/os/" \
      'enabled=1' \
      'gpgcheck=1' \
      'gpgkey=file:///etc/pki/rpm-gpg/RPM-GPG-KEY-centosofficial' \
      '' \
      '[appstream]' \
      'name=CentOS Stream - AppStream - Tencent' \
      "baseurl=https://mirrors.cloud.tencent.com/centos-stream/${stream}/AppStream/${basearch}/os/" \
      'enabled=1' \
      'gpgcheck=1' \
      'gpgkey=file:///etc/pki/rpm-gpg/RPM-GPG-KEY-centosofficial' \
      '' \
      '[crb]' \
      'name=CentOS Stream - CRB - Tencent' \
      "baseurl=https://mirrors.cloud.tencent.com/centos-stream/${stream}/CRB/${basearch}/os/" \
      'enabled=0' \
      'gpgcheck=1' \
      'gpgkey=file:///etc/pki/rpm-gpg/RPM-GPG-KEY-centosofficial' \
      > /etc/yum.repos.d/centos-stream-tencent.repo
RUN set -eux; \
    for f in /etc/yum.repos.d/centos.repo /etc/yum.repos.d/centos-addons.repo /etc/yum.repos.d/CentOS-Stream-*.repo; do \
      [ -f "$f" ] || continue; \
      sed -i -e 's|^enabled=1|enabled=0|g' "$f"; \
    done \
    && dnf install -y ca-certificates curl \
    && dnf clean all \
    && rm -rf /var/cache/dnf
```

## Arch Linux

```dockerfile
RUN printf '%s\n' 'Server = https://mirrors.tuna.tsinghua.edu.cn/archlinux/$repo/os/$arch' > /etc/pacman.d/mirrorlist \
    && pacman -Syu --noconfirm
```

## openSUSE

Use TUNA openSUSE mirrors when building from openSUSE bases:

```dockerfile
RUN zypper mr -da \
    && zypper ar -fcg https://mirrors.tuna.tsinghua.edu.cn/opensuse/distribution/leap/$releasever/repo/oss/ tuna-oss \
    && zypper ref
```

Use Packman only when openSUSE images need packages such as ffmpeg, multimedia codecs, or other Packman-owned builds:

```dockerfile
ARG PACKMAN_VARIANT=openSUSE_Tumbleweed

RUN zypper ar -fcg "https://mirrors.tuna.tsinghua.edu.cn/packman/suse/${PACKMAN_VARIANT}/" packman \
    && zypper --gpg-auto-import-keys refresh \
    && zypper install -y --from packman ffmpeg \
    && zypper clean -a
```

For Leap images, set `PACKMAN_VARIANT` to a matching value such as `openSUSE_Leap_15.6`.

## openEuler

Use USTC openEuler mirrors for openEuler-based images:

```dockerfile
RUN sed -i 's|https\?://repo.openeuler.org|https://mirrors.ustc.edu.cn/openeuler|g' /etc/yum.repos.d/openEuler.repo \
    && dnf clean all \
    && rm -rf /var/cache/dnf
```

## RPM Fusion

Use RPM Fusion only when Fedora/RHEL-compatible builds need extra packages such as multimedia codecs, ffmpeg, or drivers. Enable EPEL first for RHEL-compatible images.

Fedora:

```dockerfile
RUN dnf install -y \
      "https://mirrors.ustc.edu.cn/rpmfusion/free/fedora/rpmfusion-free-release-$(rpm -E %fedora).noarch.rpm" \
      "https://mirrors.ustc.edu.cn/rpmfusion/nonfree/fedora/rpmfusion-nonfree-release-$(rpm -E %fedora).noarch.rpm" \
    && sed -i \
      -e 's|^metalink=|#metalink=|g' \
      -e 's|^#baseurl=http://download1.rpmfusion.org|baseurl=https://mirrors.ustc.edu.cn/rpmfusion|g' \
      /etc/yum.repos.d/rpmfusion*.repo \
    && dnf clean all \
    && rm -rf /var/cache/dnf
```

RHEL-compatible:

```dockerfile
RUN dnf install -y \
      "https://mirrors.ustc.edu.cn/rpmfusion/free/el/rpmfusion-free-release-$(rpm -E %centos_ver).noarch.rpm" \
      "https://mirrors.ustc.edu.cn/rpmfusion/nonfree/el/rpmfusion-nonfree-release-$(rpm -E %centos_ver).noarch.rpm" \
    && sed -i \
      -e 's|^metalink=|#metalink=|g' \
      -e 's|^#baseurl=http://download1.rpmfusion.org|baseurl=https://mirrors.ustc.edu.cn/rpmfusion|g' \
      /etc/yum.repos.d/rpmfusion*.repo \
    && dnf clean all \
    && rm -rf /var/cache/dnf
```

## Third-party APT/RPM repositories

For Kubernetes, Docker CE, PostgreSQL PGDG, MySQL Community, MariaDB, MongoDB Community, LLVM APT, Bazel APT, Elastic Stack, Grafana, Erlang Solutions, and Adoptium/Temurin:

- Prefer Tencent Cloud package repository URLs when Tencent provides them, such as `https://mirrors.cloud.tencent.com/kubernetes/`, `https://mirrors.cloud.tencent.com/docker-ce/`, `https://mirrors.cloud.tencent.com/postgresql/repos/`, `https://mirrors.cloud.tencent.com/mysql/`, `https://mirrors.cloud.tencent.com/mariadb/`, and `https://mirrors.cloud.tencent.com/mongodb/`.
- Use TUNA for LLVM APT, Bazel APT, Elastic Stack, Grafana, Erlang Solutions, and Adoptium when Tencent does not provide a suitable mirror.
- Keep GPG key verification enabled. Download keys from the mirrored repository only when the mirror provides the upstream key, and verify the expected fingerprint when the project documents one.
- Do not replace `apt.kubernetes.io`, `pkgs.k8s.io`, `download.docker.com`, `apt.llvm.org`, `storage.googleapis.com/bazel-apt`, `packages.erlang-solutions.com`, or `packages.adoptium.net` with untrusted proxy URLs.

Kubernetes package repositories:

```dockerfile
RUN sed -i 's|https://apt.kubernetes.io|https://mirrors.cloud.tencent.com/kubernetes/apt|g; s|https://pkgs.k8s.io|https://mirrors.cloud.tencent.com/kubernetes|g' /etc/apt/sources.list.d/kubernetes*.list
```

Docker CE package repositories:

```dockerfile
RUN sed -i 's|https://download.docker.com/linux/debian|https://mirrors.cloud.tencent.com/docker-ce/linux/debian|g; s|https://download.docker.com/linux/ubuntu|https://mirrors.cloud.tencent.com/docker-ce/linux/ubuntu|g' /etc/apt/sources.list.d/docker*.list
```

Database package repositories:

```dockerfile
RUN set -eux; \
    for f in /etc/apt/sources.list.d/postgresql*.list /etc/apt/sources.list.d/mysql*.list /etc/apt/sources.list.d/mariadb*.list /etc/apt/sources.list.d/mongodb*.list; do \
      [ -f "$f" ] || continue; \
      sed -i \
        -e 's|https://apt.postgresql.org/pub/repos/apt|https://mirrors.cloud.tencent.com/postgresql/repos/apt|g' \
        -e 's|https://repo.mysql.com/apt|https://mirrors.cloud.tencent.com/mysql/apt|g' \
        -e 's|https://apt.mariadb.org|https://mirrors.cloud.tencent.com/mariadb/repo|g' \
        -e 's|https://repo.mongodb.org/apt|https://mirrors.cloud.tencent.com/mongodb/apt|g' \
        "$f"; \
    done
```

For RPM-based images, replace official base URLs with:

- PostgreSQL PGDG: `https://mirrors.cloud.tencent.com/postgresql/repos/yum/`
- MySQL Community: `https://mirrors.cloud.tencent.com/mysql/yum/`
- MariaDB: `https://mirrors.cloud.tencent.com/mariadb/yum/`
- MongoDB Community: `https://mirrors.cloud.tencent.com/mongodb/yum/`

LLVM APT with upstream `llvm.sh`:

```dockerfile
RUN curl -fsSL https://apt.llvm.org/llvm.sh -o /tmp/llvm.sh \
    && bash /tmp/llvm.sh -m https://mirrors.tuna.tsinghua.edu.cn/llvm-apt/
```

Bazel APT:

```dockerfile
RUN printf '%s\n' \
      'deb [signed-by=/usr/share/keyrings/bazel-archive-keyring.gpg] https://mirrors.tuna.tsinghua.edu.cn/bazel-apt stable jdk1.8' \
      > /etc/apt/sources.list.d/bazel.list
```

Adoptium/Temurin Debian packages:

```dockerfile
RUN printf '%s\n' \
      'deb [signed-by=/usr/share/keyrings/adoptium.gpg] https://mirrors.tuna.tsinghua.edu.cn/Adoptium/deb stable main' \
      > /etc/apt/sources.list.d/adoptium.list
```

Adoptium/Temurin RPM packages:

```dockerfile
RUN printf '%s\n' \
      '[Adoptium]' \
      'name=Adoptium' \
      'baseurl=https://mirrors.tuna.tsinghua.edu.cn/Adoptium/rpm/rhel/$releasever/$basearch' \
      'enabled=1' \
      'gpgcheck=1' \
      > /etc/yum.repos.d/adoptium.repo
```

Elastic Stack APT:

```dockerfile
RUN printf '%s\n' \
      'deb [signed-by=/usr/share/keyrings/elastic.gpg] https://mirrors.tuna.tsinghua.edu.cn/elasticstack/8.x/apt stable main' \
      > /etc/apt/sources.list.d/elastic-8.x.list
```

Grafana APT:

```dockerfile
RUN printf '%s\n' \
      'deb [signed-by=/usr/share/keyrings/grafana.gpg] https://mirrors.tuna.tsinghua.edu.cn/grafana/apt stable main' \
      > /etc/apt/sources.list.d/grafana.list
```

Grafana RPM:

```dockerfile
RUN printf '%s\n' \
      '[grafana]' \
      'name=grafana' \
      'baseurl=https://mirrors.tuna.tsinghua.edu.cn/grafana/yum/rpm' \
      'repo_gpgcheck=1' \
      'enabled=1' \
      'gpgcheck=1' \
      > /etc/yum.repos.d/grafana.repo
```

Erlang Solutions APT:

```dockerfile
RUN sed -i 's|https://packages.erlang-solutions.com|https://mirrors.tuna.tsinghua.edu.cn/erlang-solutions|g' /etc/apt/sources.list.d/erlang-solutions*.list
```
