# Language Package Manager Mirrors

## Go

- Go modules: `https://mirrors.cloud.tencent.com/go/`

Do not use `https://mirrors.cloud.tencent.com/golang/` for Go toolchain tarballs; that path is not the Go module proxy. If a build needs a Go toolchain, prefer an explicit mirrored `golang` base image or an existing project-approved toolchain download source.

```dockerfile
ENV GOPROXY=https://mirrors.cloud.tencent.com/go/,direct \
    GOSUMDB=sum.golang.org
```

For private modules, set `GOPRIVATE` or `GONOSUMDB` for private import prefixes instead of disabling checksum verification globally.

## Rust

- Rust rustup and Cargo: ByteDance RsProxy, `https://rsproxy.cn`
- Cargo sparse index: `sparse+https://rsproxy.cn/index/`

```dockerfile
ENV RUSTUP_DIST_SERVER=https://rsproxy.cn \
    RUSTUP_UPDATE_ROOT=https://rsproxy.cn/rustup \
    CARGO_HOME=/usr/local/cargo \
    PATH=/usr/local/cargo/bin:$PATH

RUN mkdir -p /usr/local/cargo \
    && printf '%s\n' \
      '[source.crates-io]' \
      'replace-with = "rsproxy-sparse"' \
      '[source.rsproxy-sparse]' \
      'registry = "sparse+https://rsproxy.cn/index/"' \
      > /usr/local/cargo/config.toml
```

Install Rust through RsProxy instead of downloading the installer from upstream:

```dockerfile
RUN curl --proto '=https' --tlsv1.2 -fsSL https://rsproxy.cn/rustup-init.sh \
    | sh -s -- -y --profile minimal
```

## Node, NPM, Yarn, pnpm, Bun, and Corepack

- NPM registry: `https://mirrors.cloud.tencent.com/npm/`
- Node.js releases: `https://mirrors.cloud.tencent.com/nodejs-release/`

```dockerfile
ENV COREPACK_NPM_REGISTRY=https://mirrors.cloud.tencent.com/npm/

RUN npm config set registry https://mirrors.cloud.tencent.com/npm/ \
    && yarn config set registry https://mirrors.cloud.tencent.com/npm/ \
    && yarn config set npmRegistryServer https://mirrors.cloud.tencent.com/npm/ \
    && pnpm config set registry https://mirrors.cloud.tencent.com/npm/ \
    && printf '%s\n' '[install]' 'registry = "https://mirrors.cloud.tencent.com/npm/"' > bunfig.toml
```

Node.js runtime downloads are separate from the NPM registry:

```dockerfile
ENV NODE_MIRROR=https://mirrors.cloud.tencent.com/nodejs-release/ \
    NVM_NODEJS_ORG_MIRROR=https://mirrors.cloud.tencent.com/nodejs-release/ \
    FNM_NODE_DIST_MIRROR=https://mirrors.cloud.tencent.com/nodejs-release/
```

NPM registry mirrors do not cover packages that download browser or desktop binaries during install. Configure each package's documented download mirror variable when present:

```dockerfile
ENV ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ \
    PLAYWRIGHT_DOWNLOAD_HOST=https://npmmirror.com/mirrors/playwright/ \
    CYPRESS_DOWNLOAD_MIRROR=https://npmmirror.com/mirrors/cypress/ \
    PUPPETEER_CHROME_DOWNLOAD_BASE_URL=https://npmmirror.com/mirrors/chrome-for-testing/
```

## Python

- PyPI: `https://mirrors.cloud.tencent.com/pypi/simple`

```dockerfile
RUN pip config set global.index-url https://mirrors.cloud.tencent.com/pypi/simple
```

Only add `trusted-host` for PyPI when using an HTTP mirror or when the build environment has a documented certificate problem.

uv, Poetry, PDM, Pipenv, and pipx should point at the same Tencent PyPI source instead of relying only on `pip config`:

```dockerfile
ENV UV_DEFAULT_INDEX=https://mirrors.cloud.tencent.com/pypi/simple \
    UV_INDEX_URL=https://mirrors.cloud.tencent.com/pypi/simple \
    PIP_INDEX_URL=https://mirrors.cloud.tencent.com/pypi/simple \
    PDM_PYPI_URL=https://mirrors.cloud.tencent.com/pypi/simple \
    PIPENV_PYPI_MIRROR=https://mirrors.cloud.tencent.com/pypi/simple
```

In Poetry projects, add the Tencent source to the project configuration:

```dockerfile
RUN poetry source add --priority=primary tencent https://mirrors.cloud.tencent.com/pypi/simple
```

In PDM projects, write PDM's own PyPI URL:

```dockerfile
RUN pdm config pypi.url https://mirrors.cloud.tencent.com/pypi/simple
```

In Pipenv projects, set `PIPENV_PYPI_MIRROR` or pass `--pypi-mirror https://mirrors.cloud.tencent.com/pypi/simple` to `pipenv install`.

## JVM: Maven, Gradle, sbt, Clojars

- Maven: `https://mirrors.cloud.tencent.com/nexus/repository/maven-public/`
- Gradle distributions: `https://mirrors.cloud.tencent.com/gradle/`
- Gradle Plugin Portal: `https://mirrors.cloud.tencent.com/nexus/repository/gradle-plugins/`
- Android Google Maven: Aliyun, `https://maven.aliyun.com/repository/google`
- sbt / Scala Ivy: Huawei Cloud, `https://repo.huaweicloud.com/repository/ivy/` and `https://repo.huaweicloud.com/repository/maven/`
- Clojars: `https://mirrors.tuna.tsinghua.edu.cn/clojars/`

```dockerfile
RUN mkdir -p /root/.m2 \
    && printf '%s\n' \
      '<settings><mirrors><mirror>' \
      '<id>nexus-tencent</id><mirrorOf>*</mirrorOf>' \
      '<name>Tencent Maven Mirror</name>' \
      '<url>https://mirrors.cloud.tencent.com/nexus/repository/maven-public/</url>' \
      '</mirror></mirrors></settings>' \
      > /root/.m2/settings.xml
```

```dockerfile
RUN if [ -f gradle/wrapper/gradle-wrapper.properties ]; then \
      sed -i 's|https://services.gradle.org/distributions/|https://mirrors.cloud.tencent.com/gradle/|g' gradle/wrapper/gradle-wrapper.properties; \
    fi
```

```gradle
pluginManagement {
    repositories {
        maven { url = uri("https://mirrors.cloud.tencent.com/nexus/repository/gradle-plugins/") }
        maven { url = uri("https://mirrors.cloud.tencent.com/nexus/repository/maven-public/") }
    }
}

dependencyResolutionManagement {
    repositories {
        maven { url = uri("https://mirrors.cloud.tencent.com/nexus/repository/maven-public/") }
    }
}
```

Android Gradle builds need Google's Maven repository in addition to Maven Central and the Gradle Plugin Portal:

```gradle
pluginManagement {
    repositories {
        maven { url = uri("https://maven.aliyun.com/repository/google") }
        maven { url = uri("https://mirrors.cloud.tencent.com/nexus/repository/gradle-plugins/") }
        maven { url = uri("https://mirrors.cloud.tencent.com/nexus/repository/maven-public/") }
    }
}

dependencyResolutionManagement {
    repositories {
        maven { url = uri("https://maven.aliyun.com/repository/google") }
        maven { url = uri("https://mirrors.cloud.tencent.com/nexus/repository/maven-public/") }
    }
}
```

Clojars is separate from Maven Central:

```clojure
:repositories [["clojars" "https://mirrors.tuna.tsinghua.edu.cn/clojars/"]]
```

sbt uses both Maven and Ivy repository layouts. Configure `~/.sbt/repositories` instead of relying only on Maven settings:

```dockerfile
RUN mkdir -p /root/.sbt \
    && printf '%s\n' \
      '[repositories]' \
      'local' \
      'huaweicloud-ivy: https://repo.huaweicloud.com/repository/ivy/, [organization]/[module]/(scala_[scalaVersion]/)(sbt_[sbtVersion]/)[revision]/[type]s/[artifact](-[classifier]).[ext]' \
      'huaweicloud-maven: https://repo.huaweicloud.com/repository/maven/' \
      > /root/.sbt/repositories

ENV SBT_OPTS="-Dsbt.override.build.repos=true -Dsbt.repository.config=/root/.sbt/repositories"
```

Huawei Cloud may reject generic `HEAD` probes at the repository root. Verify sbt mirrors by running `sbt update` or resolving a project-specific artifact from the target build network.

## .NET / NuGet

- NuGet: Huawei Cloud, `https://repo.huaweicloud.com/repository/nuget/v3/index.json`

```dockerfile
RUN printf '%s\n' \
      '<?xml version="1.0" encoding="utf-8"?>' \
      '<configuration>' \
      '  <packageSources>' \
      '    <clear />' \
      '    <add key="huaweicloud" value="https://repo.huaweicloud.com/repository/nuget/v3/index.json" />' \
      '  </packageSources>' \
      '</configuration>' \
      > NuGet.Config
```

## PHP / Composer

- Composer: `https://mirrors.cloud.tencent.com/composer/`
- Remi RPM repository for PHP runtimes: `https://mirrors.aliyun.com/remi/`

```dockerfile
RUN composer config -g repos.packagist composer https://mirrors.cloud.tencent.com/composer/
```

For RHEL-compatible images that install PHP runtimes from Remi:

```dockerfile
RUN dnf install -y https://mirrors.aliyun.com/remi/enterprise/remi-release-9.rpm \
    && dnf module enable -y php:remi-8.4 \
    && dnf install -y php php-cli php-fpm \
    && dnf clean all \
    && rm -rf /var/cache/dnf
```

Use the Remi release RPM when possible so GPG keys and repo files stay aligned with the repository metadata.

## Ruby

- RubyGems: `https://mirrors.cloud.tencent.com/rubygems/`

```dockerfile
RUN gem sources --add https://mirrors.cloud.tencent.com/rubygems/ --remove https://rubygems.org/ \
    && bundle config set --global mirror.https://rubygems.org https://mirrors.cloud.tencent.com/rubygems/
```

## Perl / CPAN

- CPAN: `https://mirrors.tuna.tsinghua.edu.cn/CPAN/`

```dockerfile
ENV PERL_CPANM_OPT="--mirror https://mirrors.tuna.tsinghua.edu.cn/CPAN/ --mirror-only"
```

## Elixir / Hex / Rebar3

- Hex China mirror: `https://hexpm.upyun.com`

```dockerfile
ENV HEX_MIRROR=https://hexpm.upyun.com \
    HEX_CDN=https://hexpm.upyun.com
```

Hex and Rebar mirrors cover package dependencies only. For Erlang/Elixir runtime packages installed from system package repositories, use the Erlang Solutions APT mirror in [os-packages.md](os-packages.md).

## Haskell / GHCup / Hackage / Stackage

- Hackage: `https://mirrors.tuna.tsinghua.edu.cn/hackage/`
- GHCup: `https://mirrors.ustc.edu.cn/ghcup/`
- Stackage: `https://mirrors.ustc.edu.cn/stackage/`

```dockerfile
ENV BOOTSTRAP_HASKELL_YAML=https://mirrors.ustc.edu.cn/ghcup/ghcup-metadata/ghcup-0.0.9.yaml
```

Configure Cabal with the TUNA Hackage mirror when the Dockerfile runs `cabal update` or `cabal install`.

Configure Stack/Stackage metadata explicitly:

```dockerfile
RUN mkdir -p /root/.stack \
    && printf '%s\n' \
      'setup-info-locations:' \
      '  - https://mirrors.ustc.edu.cn/stackage/stack-setup.yaml' \
      'urls:' \
      '  latest-snapshot: https://mirrors.ustc.edu.cn/stackage/snapshots.json' \
      'snapshot-location-base: https://mirrors.ustc.edu.cn/stackage/stackage-snapshots/' \
      'global-hints-location:' \
      '  url: https://mirrors.ustc.edu.cn/stackage/stackage-content/stack/global-hints.yaml' \
      > /root/.stack/config.yaml
```

For Stack versions older than 3.1.1, check USTC's Stackage help before using `global-hints-location`; older Stack versions may need a manual `global-hints-cache.yaml`.
