# Data Science And Specialized Mirrors

## Conda / Anaconda

- Anaconda/Conda: `https://mirrors.cloud.tencent.com/anaconda/`

```dockerfile
RUN mkdir -p /root \
    && printf '%s\n' \
      'channels:' \
      '  - defaults' \
      'show_channel_urls: true' \
      'default_channels:' \
      '  - https://mirrors.cloud.tencent.com/anaconda/pkgs/main' \
      '  - https://mirrors.cloud.tencent.com/anaconda/pkgs/r' \
      'custom_channels:' \
      '  conda-forge: https://mirrors.cloud.tencent.com/anaconda/cloud' \
      > /root/.condarc
```

For Bioconda-based bioinformatics images, add the Bioconda channel and keep strict channel priority:

```dockerfile
RUN mkdir -p /root \
    && printf '%s\n' \
      'channels:' \
      '  - conda-forge' \
      '  - bioconda' \
      '  - defaults' \
      'channel_priority: strict' \
      'show_channel_urls: true' \
      'default_channels:' \
      '  - https://mirrors.cloud.tencent.com/anaconda/pkgs/main' \
      '  - https://mirrors.cloud.tencent.com/anaconda/pkgs/r' \
      'custom_channels:' \
      '  conda-forge: https://mirrors.cloud.tencent.com/anaconda/cloud' \
      '  bioconda: https://mirrors.cloud.tencent.com/anaconda/cloud' \
      > /root/.condarc
```

## R / CRAN / Bioconductor

- CRAN/R: `https://mirrors.cloud.tencent.com/CRAN/`
- CRAN fallback: `https://mirrors.tuna.tsinghua.edu.cn/CRAN/`
- Bioconductor: `https://mirrors.tuna.tsinghua.edu.cn/bioconductor`

```dockerfile
RUN printf '%s\n' \
      'options(repos = c(CRAN = "https://mirrors.cloud.tencent.com/CRAN/"))' \
      'options(BioC_mirror = "https://mirrors.tuna.tsinghua.edu.cn/bioconductor")' \
      > /usr/local/lib/R/etc/Rprofile.site
```

Bioconductor mirrors may not retain every historical release. For old Bioconductor versions, verify the exact package path before editing a Dockerfile.

## PyTorch Wheels

PyTorch binary wheels are not fully covered by a PyPI mirror.

- SJTUG PyTorch wheels: `https://mirror.sjtu.edu.cn/pytorch-wheels`

```dockerfile
ENV PYTORCH_INDEX_URL=https://mirror.sjtu.edu.cn/pytorch-wheels
```

Use the matching CPU/CUDA/ROCm path from the upstream command, replacing `https://download.pytorch.org/whl` with `https://mirror.sjtu.edu.cn/pytorch-wheels`.

## NVIDIA CUDA APT/RPM

- NVIDIA CUDA China repository: `https://developer.download.nvidia.cn/compute/cuda/repos/`

Use this only when the image installs CUDA packages through APT/DNF. Official CUDA base images may already contain the required runtime/toolkit.

Debian/Ubuntu:

```dockerfile
ARG CUDA_DISTRO=ubuntu2204
ARG CUDA_ARCH=x86_64

RUN curl -fsSL "https://developer.download.nvidia.cn/compute/cuda/repos/${CUDA_DISTRO}/${CUDA_ARCH}/cuda-archive-keyring.gpg" \
      -o /usr/share/keyrings/cuda-archive-keyring.gpg \
    && printf '%s\n' \
      "deb [signed-by=/usr/share/keyrings/cuda-archive-keyring.gpg] https://developer.download.nvidia.cn/compute/cuda/repos/${CUDA_DISTRO}/${CUDA_ARCH}/ /" \
      > /etc/apt/sources.list.d/cuda-cn.list \
    && apt-get update
```

RHEL-compatible:

```dockerfile
ARG CUDA_DISTRO=rhel9
ARG CUDA_ARCH=x86_64

RUN curl -fsSL "https://developer.download.nvidia.cn/compute/cuda/repos/${CUDA_DISTRO}/${CUDA_ARCH}/cuda-${CUDA_DISTRO}.repo" \
      -o /etc/yum.repos.d/cuda-cn.repo \
    && sed -i 's|https://developer.download.nvidia.com|https://developer.download.nvidia.cn|g' /etc/yum.repos.d/cuda-cn.repo \
    && dnf makecache
```

Do not disable CUDA repository GPG checks. Verify the distro/architecture path before pinning a Dockerfile.

## Julia

- Julia packages: USTC, `https://mirrors.ustc.edu.cn/julia`
- Juliaup releases: TUNA, `https://mirrors.tuna.tsinghua.edu.cn/julia-releases`

```dockerfile
ENV JULIA_PKG_SERVER=https://mirrors.ustc.edu.cn/julia \
    JULIAUP_SERVER=https://mirrors.tuna.tsinghua.edu.cn/julia-releases
```

## Dart And Flutter

- Pub: `https://pub.flutter-io.cn`
- Flutter storage: `https://storage.flutter-io.cn`

```dockerfile
ENV PUB_HOSTED_URL=https://pub.flutter-io.cn \
    FLUTTER_STORAGE_BASE_URL=https://storage.flutter-io.cn
```

## ROS And ROS2

- ROS 1: `https://mirrors.tuna.tsinghua.edu.cn/ros/`
- ROS 2: `https://mirrors.tuna.tsinghua.edu.cn/ros2/`
- rosdistro metadata: `https://mirrors.tuna.tsinghua.edu.cn/rosdistro/index-v4.yaml`

```dockerfile
ENV ROSDISTRO_INDEX_URL=https://mirrors.tuna.tsinghua.edu.cn/rosdistro/index-v4.yaml
```

## TeX Live / CTAN

- TeX Live repository: `https://mirrors.tuna.tsinghua.edu.cn/CTAN/systems/texlive/tlnet`

```dockerfile
RUN tlmgr option repository https://mirrors.tuna.tsinghua.edu.cn/CTAN/systems/texlive/tlnet
```

## Nix

- Nix binary cache: `https://mirrors.tuna.tsinghua.edu.cn/nix-channels/store`

```dockerfile
RUN mkdir -p /etc/nix \
    && printf '%s\n' \
      'substituters = https://mirrors.tuna.tsinghua.edu.cn/nix-channels/store https://cache.nixos.org/' \
      'trusted-public-keys = cache.nixos.org-1:6NCHdD59X431o0gWJFeP8S26wN0rPt0gNJZma4s0x7U=' \
      > /etc/nix/nix.conf
```
