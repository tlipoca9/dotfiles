# Verification And Consistency Checks

## Build checks

- Run a syntax/build check with `podman build` when practical.
- When Docker Hub images are involved, run `podman pull` against the selected source or accelerator from the target build network before committing an explicit mirror reference.
- If host-level mirror configuration is the fallback, explain why.

## Targeted probes

Use ecosystem-specific probes instead of probing only mirror roots:

```sh
curl -fsSI http://mirrors.cloud.tencent.com/debian/
curl -fsSI http://mirrors.cloud.tencent.com/ubuntu/
curl -fsSI https://mirrors.ustc.edu.cn/deb-multimedia/dists/bookworm/InRelease
curl -fsSI https://mirrors.cloud.tencent.com/epel/9/Everything/x86_64/repodata/repomd.xml
curl -fsSI https://mirrors.cloud.tencent.com/fedora/releases/42/Everything/x86_64/os/repodata/repomd.xml
curl -fsSI https://mirrors.cloud.tencent.com/almalinux/9/BaseOS/x86_64/os/repodata/repomd.xml
curl -fsSI https://mirrors.ustc.edu.cn/openeuler/
curl -fsSI https://mirrors.cloud.tencent.com/pypi/simple/
curl -fsSL https://mirrors.cloud.tencent.com/go/github.com/pkg/errors/@v/list
curl -fsSL https://mirrors.cloud.tencent.com/go/sumdb/sum.golang.org/supported
curl -fsSL https://mirrors.cloud.tencent.com/npm/lodash
curl -fsSI https://mirrors.cloud.tencent.com/nodejs-release/index.json
curl -fsSI https://npmmirror.com/mirrors/electron/
curl -fsSL https://mirrors.cloud.tencent.com/nexus/repository/maven-public/junit/junit/maven-metadata.xml
curl -fsSI https://mirrors.cloud.tencent.com/nexus/repository/gradle-plugins/
curl -fsSI https://mirrors.cloud.tencent.com/gradle/gradle-8.14-bin.zip
curl -fsSI https://maven.aliyun.com/repository/google/com/android/tools/build/gradle/maven-metadata.xml
curl -fsSI https://mirrors.aliyun.com/remi/enterprise/9/remi/x86_64/repodata/repomd.xml
curl -fsSI https://repo.huaweicloud.com/repository/nuget/v3/index.json
curl -fsSL https://mirrors.cloud.tencent.com/composer/packages.json
curl -fsSL https://mirrors.cloud.tencent.com/rubygems/info/bundler
curl -fsSI https://mirrors.cloud.tencent.com/anaconda/pkgs/main/linux-64/repodata.json
curl -fsSI https://mirrors.cloud.tencent.com/anaconda/cloud/bioconda/linux-64/repodata.json
curl -fsSI https://mirrors.cloud.tencent.com/CRAN/src/contrib/PACKAGES.gz
curl -fsSI https://mirrors.tuna.tsinghua.edu.cn/bioconductor/packages/release/bioc/src/contrib/PACKAGES.gz
curl -fsSI https://mirror.sjtu.edu.cn/pytorch-wheels/
curl -fsSI https://developer.download.nvidia.cn/compute/cuda/repos/ubuntu2204/x86_64/InRelease
curl -fsSI https://developer.download.nvidia.cn/compute/cuda/repos/rhel9/x86_64/repodata/repomd.xml
curl -fsSI https://mirrors.ustc.edu.cn/julia
curl -fsSI https://mirrors.tuna.tsinghua.edu.cn/CPAN/
curl -fsSI https://pub.flutter-io.cn
curl -fsSI https://storage.flutter-io.cn
curl -fsSI https://mirrors.tuna.tsinghua.edu.cn/ros2/
curl -fsSI https://mirrors.tuna.tsinghua.edu.cn/rosdistro/index-v4.yaml
curl -fsSI https://mirrors.tuna.tsinghua.edu.cn/CTAN/systems/texlive/tlnet/
curl -fsSI https://mirrors.tuna.tsinghua.edu.cn/nix-channels/store/
curl -fsSI https://mirrors.tuna.tsinghua.edu.cn/packman/suse/openSUSE_Tumbleweed/repodata/repomd.xml
curl -fsSI https://mirrors.tuna.tsinghua.edu.cn/qt/official_releases/online_installers/qt-online-installer-linux-x64-online.run
curl -fsSI https://mirrors.huaweicloud.com/helm/v3.18.6/helm-v3.18.6-linux-amd64.tar.gz.sha256
curl -fsSI https://mirrors.tuna.tsinghua.edu.cn/apache/
curl -fsSI https://downloads.apache.org/spark/KEYS
curl -fsSI https://mirrors.cloud.tencent.com/kubernetes/apt/
curl -fsSI https://mirrors.cloud.tencent.com/docker-ce/linux/debian/
curl -fsSI https://mirrors.cloud.tencent.com/postgresql/repos/apt/
curl -fsSI https://mirrors.cloud.tencent.com/mysql/apt/
curl -fsSI https://mirrors.cloud.tencent.com/mariadb/repo/
curl -fsSI https://mirrors.cloud.tencent.com/mongodb/apt/
curl -fsSI https://mirrors.ustc.edu.cn/nginx/ubuntu/dists/jammy/InRelease
curl -fsSI https://mirrors.ustc.edu.cn/nginx/rhel/9/x86_64/repodata/repomd.xml
curl -fsSI https://mirrors.ustc.edu.cn/nginx/alpine/v3.22/main/x86_64/APKINDEX.tar.gz
curl -fsSI https://mirrors.ustc.edu.cn/openresty/debian/dists/bookworm/InRelease
curl -fsSI https://mirrors.ustc.edu.cn/openresty/rhel/9/x86_64/repodata/repomd.xml
curl -fsSI https://mirrors.aliyun.com/clickhouse/deb/stable/main/Release
curl -fsSI https://mirrors.aliyun.com/clickhouse/rpm/stable/repodata/repomd.xml
curl -fsSI https://mirrors.ustc.edu.cn/influxdata/debian/dists/stable/InRelease
curl -fsSI https://mirrors.ustc.edu.cn/influxdata/stable/x86_64/main/repodata/repomd.xml
curl -fsSI https://mirrors.ustc.edu.cn/ceph/debian-reef/dists/bookworm/InRelease
curl -fsSI https://mirrors.ustc.edu.cn/ceph/rpm-reef/el9/x86_64/repodata/repomd.xml
curl -fsSI https://mirrors.tuna.tsinghua.edu.cn/wine-builds/ubuntu/dists/jammy/InRelease
curl -fsSI https://mirrors.tuna.tsinghua.edu.cn/gitlab-runner/debian/dists/bookworm/InRelease
curl -fsSI https://mirrors.aliyun.com/google-chrome/google-chrome/repodata/repomd.xml
curl -fsSI https://mirrors.ustc.edu.cn/kali/dists/kali-rolling/InRelease
curl -fsSI https://mirrors.tuna.tsinghua.edu.cn/llvm-apt/
curl -fsSI https://mirrors.tuna.tsinghua.edu.cn/bazel-apt/
curl -fsSI https://mirrors.tuna.tsinghua.edu.cn/elasticstack/8.x/apt/
curl -fsSI https://mirrors.tuna.tsinghua.edu.cn/grafana/apt/
curl -fsSI https://mirrors.tuna.tsinghua.edu.cn/erlang-solutions/
curl -fsSI https://mirrors.ustc.edu.cn/rpmfusion/free/fedora/releases/42/Everything/x86_64/os/repodata/repomd.xml
curl -fsSI https://mirrors.tuna.tsinghua.edu.cn/hackage/
curl -fsSI https://mirrors.ustc.edu.cn/stackage/snapshots.json
curl -fsSI https://mirrors.tuna.tsinghua.edu.cn/homebrew-bottles/api/formula.json
curl -fsSI https://rsproxy.cn/rustup-init.sh
curl -fsSI https://rsproxy.cn/dist/channel-rust-stable.toml
curl -fsSI https://rsproxy.cn/index/config.json
```

For Docker Hub accelerators, prefer pull probes over HTTP root checks:

```sh
podman pull docker.io/library/alpine:3.24
podman pull m.daocloud.io/docker.io/library/alpine:3.24
podman pull docker.m.daocloud.io/library/alpine:3.24
podman pull <verified-accelerator-host>/library/alpine:3.24
```

## Stale URL search terms

Search for stale official upstream URLs that should now use mirrors:

```sh
rg 'dl-cdn\.alpinelinux\.org|deb\.debian\.org|security\.debian\.org|archive\.ubuntu\.com|security\.ubuntu\.com|ports\.ubuntu\.com|deb-multimedia\.org|pypi\.org/simple|registry\.npmjs\.org|nodejs\.org/dist|proxy\.golang\.org|sum\.golang\.org|static\.rust-lang\.org|crates\.io|services\.gradle\.org|plugins\.gradle\.org|repo\.maven\.apache\.org|dl\.google\.com/android/maven2|repo\.scala-sbt\.org|repo\.typesafe\.com|api\.nuget\.org|nuget\.org|packagist\.org|rubygems\.org|repo\.anaconda\.com|conda\.anaconda\.org|conda-forge|bioconda|cran\.r-project\.org|cloud\.r-project\.org|download\.pytorch\.org/whl|get\.helm\.sh|developer\.download\.nvidia\.com/compute/cuda|julialang-s3\.julialang\.org|cpan\.metacpan\.org|pub\.dev|storage\.googleapis\.com|packages\.ros\.org|raw\.githubusercontent\.com/ros/rosdistro|download\.qt\.io|apt\.kubernetes\.io|pkgs\.k8s\.io|download\.docker\.com|nginx\.org/packages|openresty\.org/package|apt\.postgresql\.org|download\.postgresql\.org|repo\.mysql\.com|apt\.mariadb\.org|yum\.mariadb\.org|repo\.mongodb\.org|repos\.influxdata\.com|packages\.clickhouse\.com|download\.ceph\.com|dl\.winehq\.org/wine-builds|packages\.gitlab\.com/runner/gitlab-runner|dl\.google\.com/linux/chrome|http\.kali\.org|kali\.download|apt\.llvm\.org|storage\.googleapis\.com/bazel-apt|packages\.erlang-solutions\.com|packages\.adoptium\.net|repo\.openeuler\.org|download\.fedoraproject\.org|mirrors\.fedoraproject\.org|repo\.almalinux\.org|artifacts\.elastic\.co|packages\.grafana\.com|download1\.rpmfusion\.org|remirepo\.net|packman\.links2linux\.org|hackage\.haskell\.org|stackage\.org|downloads\.haskell\.org|ghcr\.io/homebrew|github\.com/Homebrew|mirrorlist=|mirror\.centos\.org|mirror\.stream\.centos\.org|dl\.rockylinux\.org|vault\.centos\.org|archive\.debian\.org'
```

## Test policy

Do not add permanent tests that only freeze mirror spelling unless the repository treats mirror policy as a stable engineering contract.
