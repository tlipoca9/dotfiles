#!/usr/bin/env python3
"""Dispatch read-only health checks to the implemented platform adapter."""

from __future__ import annotations

import os
import platform
import sys
from pathlib import Path


def main() -> int:
    adapters = {"Darwin": "darwin"}
    system = platform.system()
    adapter = adapters.get(system)
    if adapter is None:
        print(f"doctor has no platform adapter for {system}", file=sys.stderr)
        return 1
    doctor = Path(__file__).resolve().parent.parent / "platform" / adapter / "doctor.py"
    os.execv(sys.executable, (sys.executable, str(doctor), *sys.argv[1:]))
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
