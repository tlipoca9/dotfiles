# Developer Tool Mirrors

## Homebrew / Linuxbrew

- Homebrew Git remote: `https://mirrors.tuna.tsinghua.edu.cn/git/homebrew/brew.git`
- Homebrew Core Git remote: `https://mirrors.tuna.tsinghua.edu.cn/git/homebrew/homebrew-core.git`
- Homebrew API: `https://mirrors.tuna.tsinghua.edu.cn/homebrew-bottles/api`
- Homebrew bottles: `https://mirrors.tuna.tsinghua.edu.cn/homebrew-bottles`

Use Homebrew/Linuxbrew in Linux build images only when the project already depends on `brew`; prefer distro package managers for normal image dependencies.

```dockerfile
ENV HOMEBREW_API_DOMAIN=https://mirrors.tuna.tsinghua.edu.cn/homebrew-bottles/api \
    HOMEBREW_BOTTLE_DOMAIN=https://mirrors.tuna.tsinghua.edu.cn/homebrew-bottles \
    HOMEBREW_BREW_GIT_REMOTE=https://mirrors.tuna.tsinghua.edu.cn/git/homebrew/brew.git \
    HOMEBREW_CORE_GIT_REMOTE=https://mirrors.tuna.tsinghua.edu.cn/git/homebrew/homebrew-core.git \
    HOMEBREW_INSTALL_FROM_API=1
```

For first install inside an image, clone the mirrored installer instead of fetching the script from GitHub:

```dockerfile
RUN git clone --depth=1 https://mirrors.tuna.tsinghua.edu.cn/git/homebrew/install.git /tmp/brew-install \
    && /bin/bash /tmp/brew-install/install.sh \
    && rm -rf /tmp/brew-install
```

For Brew 4.0 and newer, most default-prefix installs only need `HOMEBREW_API_DOMAIN` and `HOMEBREW_BOTTLE_DOMAIN`. Keep `HOMEBREW_CORE_GIT_REMOTE` when the Dockerfile uses non-default prefixes or Homebrew developer commands.

## Helm CLI

- Helm release artifacts: `https://mirrors.huaweicloud.com/helm/`

Use this when a CI/build image installs the Helm CLI from release tarballs.

```dockerfile
ARG HELM_VERSION=v3.18.6
ARG HELM_ARCH=amd64
ARG HELM_MIRROR=https://mirrors.huaweicloud.com/helm

RUN set -eux; \
    curl -fsSL "$HELM_MIRROR/${HELM_VERSION}/helm-${HELM_VERSION}-linux-${HELM_ARCH}.tar.gz" -o /tmp/helm.tgz; \
    curl -fsSL "$HELM_MIRROR/${HELM_VERSION}/helm-${HELM_VERSION}-linux-${HELM_ARCH}.tar.gz.sha256" -o /tmp/helm.tgz.sha256; \
    echo "$(cat /tmp/helm.tgz.sha256)  /tmp/helm.tgz" | sha256sum -c -; \
    tar -C /tmp -xzf /tmp/helm.tgz; \
    install -m 0755 "/tmp/linux-${HELM_ARCH}/helm" /usr/local/bin/helm; \
    rm -rf /tmp/helm.tgz /tmp/helm.tgz.sha256 "/tmp/linux-${HELM_ARCH}"
```

The mirror also carries `.asc` signatures. Verify signatures too when the image already manages Helm release signing keys.

## Qt

- Qt official releases and online repositories: `https://mirrors.tuna.tsinghua.edu.cn/qt/`

Prefer package-manager Qt packages when they satisfy the build. Use the Qt mirror when the image installs Qt from official Qt release channels.

With `aqtinstall`:

```dockerfile
ARG QT_MIRROR=https://mirrors.tuna.tsinghua.edu.cn/qt

RUN pip install --no-cache-dir aqtinstall \
    && aqt install-qt linux desktop 6.8.1 gcc_64 \
      --base "$QT_MIRROR" \
      --outputdir /opt/Qt
```

With the official online installer:

```dockerfile
ARG QT_MIRROR=https://mirrors.tuna.tsinghua.edu.cn/qt

RUN curl -fsSL "$QT_MIRROR/official_releases/online_installers/qt-online-installer-linux-x64-online.run" \
      -o /tmp/qt-installer.run \
    && chmod +x /tmp/qt-installer.run \
    && /tmp/qt-installer.run --mirror "$QT_MIRROR" \
      --root /opt/Qt \
      --accept-obligations --accept-licenses --default-answer --confirm-command \
      install qt.qt6.681.gcc_64 \
    && rm -f /tmp/qt-installer.run
```

## Apache ASF Distributions

- Apache ASF release mirror: `https://mirrors.tuna.tsinghua.edu.cn/apache/`

Use the mirror for large Apache release artifacts, but keep Apache release verification against ASF `KEYS`, `.asc`, and checksum files.

Spark example:

```dockerfile
ARG APACHE_MIRROR=https://mirrors.tuna.tsinghua.edu.cn/apache
ARG SPARK_VERSION=4.0.3

RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends ca-certificates curl gnupg; \
    curl -fsSL "$APACHE_MIRROR/spark/spark-${SPARK_VERSION}/spark-${SPARK_VERSION}-bin-hadoop3.tgz" \
      -o /tmp/spark.tgz; \
    curl -fsSL "https://downloads.apache.org/spark/KEYS" -o /tmp/apache-spark-KEYS; \
    curl -fsSL "https://downloads.apache.org/spark/spark-${SPARK_VERSION}/spark-${SPARK_VERSION}-bin-hadoop3.tgz.asc" \
      -o /tmp/spark.tgz.asc; \
    curl -fsSL "https://downloads.apache.org/spark/spark-${SPARK_VERSION}/spark-${SPARK_VERSION}-bin-hadoop3.tgz.sha512" \
      -o /tmp/spark.tgz.sha512; \
    gpg --import /tmp/apache-spark-KEYS; \
    gpg --verify /tmp/spark.tgz.asc /tmp/spark.tgz; \
    sha512sum -c /tmp/spark.tgz.sha512; \
    rm -f /tmp/apache-spark-KEYS /tmp/spark.tgz.asc /tmp/spark.tgz.sha512
```

Adjust the project path and artifact name for other Apache projects. Do not skip ASF signature or checksum verification just because the artifact came from a mirror.
