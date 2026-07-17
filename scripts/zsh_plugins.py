#!/usr/bin/env python3
"""Parse, update, and verify the pinned Zsh plugin manifests."""

from __future__ import annotations

import argparse
import os
import re
import stat
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path


ENTRY_PATTERN = re.compile(
    r"^(?P<prefix>\s*)(?P<repo>[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+)"
    r"(?P<options>\s+.*?\bpin:)(?P<pin>[0-9a-f]{40})(?P<suffix>\s*)$"
)


class ManifestError(RuntimeError):
    """A plugin declaration or checkout violates the manifest contract."""


@dataclass(frozen=True)
class PluginEntry:
    """One pinned repository declaration and its source location."""

    path: Path
    line_number: int
    repository: str
    revision: str


class ZshPluginManifest:
    """Own the declared plugin set, its revisions, and checkout verification."""

    def __init__(self, paths: tuple[Path, ...], entries: tuple[PluginEntry, ...]) -> None:
        self.paths = paths
        self.entries = entries

    @classmethod
    def load(cls, paths: list[Path]) -> ZshPluginManifest:
        entries: list[PluginEntry] = []
        seen: set[str] = set()
        for path in paths:
            for line_number, raw_line in enumerate(
                path.read_text(encoding="utf-8").splitlines(), 1
            ):
                line = raw_line.strip()
                if not line or line.startswith("#"):
                    continue
                match = ENTRY_PATTERN.fullmatch(raw_line)
                if match is None:
                    raise ManifestError(f"{path}:{line_number}: invalid or unpinned plugin entry")
                repository = match.group("repo")
                if repository in seen:
                    raise ManifestError(f"{path}:{line_number}: duplicate plugin {repository}")
                seen.add(repository)
                entries.append(
                    PluginEntry(path, line_number, repository, match.group("pin"))
                )
        return cls(tuple(paths), tuple(entries))

    def update(self) -> None:
        revisions = {
            entry.repository: self.upstream_revision(entry.repository) for entry in self.entries
        }
        for path in self.paths:
            updated_lines: list[str] = []
            for raw_line in path.read_text(encoding="utf-8").splitlines(keepends=True):
                newline = "\n" if raw_line.endswith("\n") else ""
                line = raw_line.removesuffix("\n")
                match = ENTRY_PATTERN.fullmatch(line)
                if match is None:
                    updated_lines.append(raw_line)
                    continue
                updated_lines.append(
                    f'{match.group("prefix")}{match.group("repo")}'
                    f'{match.group("options")}{revisions[match.group("repo")]}'
                    f'{match.group("suffix")}{newline}'
                )
            self.replace(path, "".join(updated_lines))

    def bundle(self, cache_home: Path) -> None:
        prefix = subprocess.run(
            ("brew", "--prefix", "antidote"),
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=30,
            check=False,
        )
        if prefix.returncode != 0:
            raise ManifestError("antidote is not installed")
        antidote_script = Path(prefix.stdout.strip()) / "share" / "antidote" / "antidote.zsh"
        if not antidote_script.is_file():
            raise ManifestError(f"antidote entrypoint is missing: {antidote_script}")

        environment = os.environ.copy()
        environment.update(
            {
                "ANTIDOTE_CONFIG": "/dev/null",
                "ANTIDOTE_HOME": str(cache_home / "antidote"),
            }
        )
        static_dir = cache_home / "zsh" / "antidote"
        static_dir.mkdir(parents=True, exist_ok=True)
        for path in self.paths:
            phase = re.search(r"_plugins_(pre|post)\.txt$", path.name)
            if phase is None:
                raise ManifestError(f"cannot determine bundle phase from {path}")
            result = subprocess.run(
                (
                    "/bin/zsh",
                    "-f",
                    "-c",
                    'emulate -L zsh; setopt errexit pipefail; source "$1"; antidote bundle <"$2"',
                    "zsh-plugin-bundle",
                    str(antidote_script),
                    str(path),
                ),
                env=environment,
                text=True,
                stdout=subprocess.PIPE,
                stderr=None,
                timeout=180,
                check=False,
            )
            if result.returncode != 0:
                raise ManifestError(f"cannot build {phase.group(1)} plugin bundle")
            self.replace(static_dir / f"{phase.group(1)}.zsh", result.stdout)

    def verify_checkouts(self, cache_home: Path) -> None:
        for entry in self.entries:
            checkout = cache_home / "antidote" / "github.com" / entry.repository
            result = subprocess.run(
                ("git", "-C", str(checkout), "rev-parse", "HEAD"),
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=30,
                check=False,
            )
            if result.returncode != 0:
                raise ManifestError(f"plugin checkout is missing: {entry.repository}")
            if result.stdout.strip() != entry.revision:
                raise ManifestError(f"plugin checkout is stale: {entry.repository}")

    @staticmethod
    def upstream_revision(repository: str) -> str:
        result = subprocess.run(
            ("git", "ls-remote", f"https://github.com/{repository}.git", "HEAD"),
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=60,
            check=False,
        )
        if result.returncode != 0:
            raise ManifestError(f"cannot resolve upstream revision for {repository}")
        revision = result.stdout.split(maxsplit=1)[0]
        if re.fullmatch(r"[0-9a-f]{40}", revision) is None:
            raise ManifestError(f"invalid upstream revision for {repository}")
        return revision

    @staticmethod
    def replace(path: Path, content: str) -> None:
        mode = stat.S_IMODE(path.stat().st_mode) if path.exists() else 0o644
        descriptor, temporary_name = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.")
        try:
            with os.fdopen(descriptor, "w", encoding="utf-8") as temporary:
                temporary.write(content)
                os.fchmod(temporary.fileno(), mode)
            os.replace(temporary_name, path)
        except BaseException:
            try:
                os.unlink(temporary_name)
            except FileNotFoundError:
                pass
            raise


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("bundle", "check", "update"))
    parser.add_argument("manifests", nargs="+", type=Path)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        manifest = ZshPluginManifest.load(args.manifests)
        if args.command == "bundle":
            manifest.bundle(Path(os.environ.get("XDG_CACHE_HOME", Path.home() / ".cache")))
        elif args.command == "update":
            manifest.update()
    except ManifestError as error:
        raise SystemExit(str(error)) from error
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
