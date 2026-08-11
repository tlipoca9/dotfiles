#!/usr/bin/env python3
"""Validate contracts owned by the Darwin platform adapter."""

from __future__ import annotations

import platform
import re
import shutil
import subprocess
import sys
from pathlib import Path


class CheckFailure(RuntimeError):
    """A Darwin adapter contract was not satisfied."""


def command(args: tuple[str, ...]) -> str:
    result = subprocess.run(args, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    if result.returncode != 0:
        detail = (result.stderr or result.stdout).strip()
        raise CheckFailure(f"{' '.join(args)} exited {result.returncode}: {detail}")
    return result.stdout


def check_brewfile(adapter_dir: Path) -> None:
    brew = shutil.which("brew")
    if brew is None:
        raise CheckFailure("Homebrew is not installed")
    brewfile_path = adapter_dir / "Brewfile"
    entry = re.compile(r'^\s*(brew|cask)\s+["\']([^"\']+)["\']\s*(?:#.*)?$')
    declared: dict[str, set[str]] = {"brew": set(), "cask": set()}
    for number, line in enumerate(brewfile_path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        match = entry.fullmatch(line)
        if match is None:
            raise CheckFailure(f"unsupported Brewfile entry on line {number}")
        kind, name = match.groups()
        if name in declared[kind]:
            raise CheckFailure(f"duplicate {kind} entry on line {number}: {name}")
        declared[kind].add(name)

    brewfile = str(brewfile_path)
    parsed = {
        "brew": set(command((brew, "bundle", "list", "--formula", f"--file={brewfile}")).splitlines()),
        "cask": set(command((brew, "bundle", "list", "--cask", f"--file={brewfile}")).splitlines()),
    }
    if parsed != declared:
        raise CheckFailure(f"Homebrew parsed a different allowlist (declared={declared}, parsed={parsed})")


def main() -> int:
    if platform.system() != "Darwin":
        print("FAIL  Darwin adapter: current platform is not Darwin", file=sys.stderr)
        return 1
    try:
        check_brewfile(Path(__file__).resolve().parent)
    except CheckFailure as error:
        print(f"FAIL  Darwin adapter: {error}", file=sys.stderr)
        return 1
    print("PASS  Darwin adapter")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
