---
name: container-build-mirrors
description: Use when writing Dockerfile/Containerfile files, building container images, configuring package mirrors inside images, or choosing podman/docker build commands in China-networked environments.
---

# Container Build Mirrors

Use this skill whenever creating or editing `Dockerfile`, `Containerfile`, image build scripts, CI image builds, or container build documentation.

## Core rules

- Prefer `podman` for build/pull/run examples. Use Docker only when the project already requires Docker, CI provides only Docker, or the user asks for Docker.
- Use Tencent Cloud mirrors for package ecosystems where Tencent provides a documented mirror, unless the target project already standardizes another source.
- When a Tencent mirror is unavailable or not the right primitive, use the explicit domestic fallback in the relevant reference. Do not write vague instructions such as "check Tencent first".
- For Docker Hub base images, prefer verified project/cloud-specific accelerators first, then a portable `docker.io` default with an overridable registry, then a probed public mirror fallback. Do not hardcode `mirror.ccs.tencentyun.com` unless the target build network has just verified it.
- Use host-level registry mirror configuration for account-specific Docker Hub accelerators, or as a fallback when explicit references are impractical.
- Configure mirrors inside the image for package managers. For checked-in base image references, prefer explicit and overridable image references over hidden host-level engine state.
- Keep mirror configuration close to the install command and remove package-manager caches in the same layer.
- Use HTTPS mirror URLs unless the upstream documentation or bootstrap conditions require HTTP.
- Prefer supported base image versions. Use archive/vault mirrors only when compatibility requires an end-of-life distribution, and document that reason in the Dockerfile.
- Keep signature, checksum, GPG key, and package checksum verification enabled. Do not replace verification with an untrusted proxy.

## Reference map

Read the relevant reference before editing a Dockerfile or build script:

- `references/container-images.md`: Docker Hub image references, domestic accelerator priority, podman/docker build commands.
- `references/os-packages.md`: Alpine, Debian, Ubuntu, Debian Multimedia, Rocky, CentOS Stream, EPEL, Fedora, AlmaLinux, Arch, openSUSE, openSUSE Packman, RPM Fusion, Kubernetes/Docker CE, LLVM APT, Bazel APT, Adoptium.
- `references/language-package-managers.md`: Go, Rust, Node/NPM/Yarn/pnpm/Bun/Corepack, Node runtime downloads, Node postinstall binaries, Python/pip/uv/Poetry/PDM/Pipenv/pipx, Maven, Gradle, Android Google Maven, sbt/Scala Ivy, NuGet, PHP/Composer/Remi, RubyGems, CPAN, Hex, Clojars, Haskell/GHCup/Hackage/Stackage.
- `references/developer-tools.md`: Homebrew/Linuxbrew, Helm, Qt, Apache ASF distributions, and related build-tool downloads used inside images.
- `references/infrastructure-and-security.md`: NGINX, OpenResty, ClickHouse, InfluxData, Ceph, WineHQ, GitLab Runner APT, Google Chrome RPM, Kali Linux, and other infra/security build-image package sources.
- `references/data-science-and-specialized.md`: Conda, Bioconda, R/CRAN, Bioconductor, PyTorch wheels, NVIDIA CUDA APT/RPM, Julia, Dart/Flutter, ROS/ROS2, TeX Live/CTAN, Nix.
- `references/verification.md`: targeted probes, stale upstream URL search terms, and final consistency checks.

## Workflow

1. Identify the ecosystems used by the Dockerfile, build script, or CI job.
2. Read every matching reference file from the map above.
3. Apply the closest official or upstream configuration primitive rather than ad hoc string rewrites.
4. If the build uses Docker Hub images, read `references/container-images.md`, choose a registry strategy from its priority list, and verify the chosen endpoint from the target build network before hardcoding it.
5. Run the verification probes and stale URL search terms from `references/verification.md`.

## Boundaries

- Do not add random GitHub Release/raw proxies. Prefer package managers, official mirrors, project-approved fixed URLs, and hash verification.
- Do not add a permanent test that only freezes mirror spelling unless the repository treats mirror policy as a stable engineering contract.
- For ecosystem-specific one-off binary downloads, use documented package variables only. Avoid inventing mirror variables.
