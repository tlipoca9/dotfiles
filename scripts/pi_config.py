#!/usr/bin/env python3
"""Read and validate the Pi configuration declared in chezmoi source state."""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path


PACKAGE_PATTERN = re.compile(r"^npm:(?P<name>(?:@[^/]+/)?[^@/]+)@(?P<version>\d+\.\d+\.\d+)$")


class PiConfigError(RuntimeError):
    """The managed Pi settings cannot be rendered or parsed."""


def load_managed_pi_settings(repo_root: Path, current: dict[str, object] | None = None) -> dict[str, object]:
    source = repo_root / "home" / "dot_pi" / "private_agent" / "modify_settings.json"
    if not source.is_file():
        raise PiConfigError("home/dot_pi/private_agent/modify_settings.json is missing")
    payload = json.dumps(current or {})
    try:
        result = subprocess.run(
            (sys.executable, str(source)),
            input=payload,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=10,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        raise PiConfigError(f"cannot render managed Pi settings: {error}") from error
    if result.returncode != 0:
        raise PiConfigError(result.stderr.strip() or "managed Pi settings renderer failed")
    try:
        settings = json.loads(result.stdout)
    except json.JSONDecodeError as error:
        raise PiConfigError(f"managed Pi settings renderer returned invalid JSON: {error}") from error
    if not isinstance(settings, dict):
        raise PiConfigError("managed Pi settings renderer must return a JSON object")
    return settings


def declared_npm_packages(settings: dict[str, object]) -> list[tuple[str, str]]:
    packages = settings.get("packages")
    if not isinstance(packages, list):
        raise PiConfigError("managed Pi settings must contain a package list")
    declared: list[tuple[str, str]] = []
    for source in packages:
        if not isinstance(source, str):
            raise PiConfigError("managed Pi packages must use string sources")
        match = PACKAGE_PATTERN.fullmatch(source)
        if match is None:
            raise PiConfigError(f"Pi package is not pinned to an exact npm version: {source}")
        declared.append((match.group("name"), match.group("version")))
    return declared
