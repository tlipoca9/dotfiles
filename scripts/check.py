#!/usr/bin/env python3
"""Validate repository contracts without changing the user's environment."""

from __future__ import annotations

import argparse
import ast
import importlib.util
import json
import os
import platform
import re
import shutil
import subprocess
import sys
import sysconfig
import tempfile
from collections.abc import Callable, Sequence
from pathlib import Path


PUBLIC_TASKS = {"apply", "bootstrap", "check", "diff", "doctor", "update"}
PRIVATE_KEY_MARKERS = (
    b"-----BEGIN OPENSSH PRIVATE KEY-----",
    b"-----BEGIN PRIVATE KEY-----",
    b"AGE-SECRET-KEY-",
)


class CheckFailure(RuntimeError):
    """A repository contract was not satisfied."""


class RepositoryChecks:
    """Run independent, read-only checks and report all observed failures."""

    def __init__(self, repo_root: Path, *, ci: bool) -> None:
        self.repo_root = repo_root
        self.ci = ci
        self.failures: list[str] = []

    def run(self) -> int:
        checks: Sequence[tuple[str, Callable[[], None]]] = (
            ("platform", self.check_platform),
            ("source root", self.check_source_root),
            ("shell syntax", self.check_shell_syntax),
            ("Python standard library", self.check_python),
            ("JSON", self.check_json),
            ("Taskfile API", self.check_taskfile),
            ("Brewfile", self.check_brewfile),
            ("age identity tracking", self.check_identity_tracking),
            ("repository secrets", self.check_repository_secrets),
            ("chezmoi source state", self.check_chezmoi),
        )
        for label, check in checks:
            try:
                check()
            except CheckFailure as error:
                self.failures.append(f"{label}: {error}")
                print(f"FAIL  {label}: {error}")
            else:
                print(f"PASS  {label}")

        if self.failures:
            print(f"\n{len(self.failures)} check(s) failed.", file=sys.stderr)
            return 1
        mode = "CI" if self.ci else "local"
        print(f"\nAll repository checks passed ({mode} mode).")
        return 0

    def command(
        self,
        args: Sequence[str],
        *,
        input_text: str | None = None,
        timeout: int = 30,
    ) -> subprocess.CompletedProcess[str]:
        try:
            result = subprocess.run(
                args,
                cwd=self.repo_root,
                input=input_text,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=timeout,
                check=False,
            )
        except (OSError, subprocess.TimeoutExpired) as error:
            raise CheckFailure(f"cannot run {args[0]}: {error}") from error
        if result.returncode != 0:
            detail = (result.stderr or result.stdout).strip()
            if len(detail) > 500:
                detail = detail[-500:]
            raise CheckFailure(
                f"{' '.join(args)} exited {result.returncode}"
                + (f": {detail}" if detail else "")
            )
        return result

    def git(self, *args: str, allow_failure: bool = False) -> subprocess.CompletedProcess[str]:
        result = subprocess.run(
            ("git", *args),
            cwd=self.repo_root,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )
        if result.returncode != 0 and not allow_failure:
            raise CheckFailure((result.stderr or result.stdout).strip())
        return result

    def check_platform(self) -> None:
        if platform.system() != "Darwin":
            raise CheckFailure("this repository currently supports macOS only")

    def check_source_root(self) -> None:
        marker = self.repo_root / ".chezmoiroot"
        if not marker.is_file() or marker.read_text(encoding="utf-8").strip() != "home":
            raise CheckFailure(".chezmoiroot must contain exactly 'home'")
        if not (self.repo_root / "home").is_dir():
            raise CheckFailure("home/ source state is missing")

    def check_shell_syntax(self) -> None:
        bootstrap = self.repo_root / "bootstrap.sh"
        if not bootstrap.is_file():
            raise CheckFailure("bootstrap.sh is missing")
        self.command(("/bin/sh", "-n", str(bootstrap)))

        zsh_files = [self.repo_root / "home" / "dot_zshrc"]
        zsh_files.extend(sorted((self.repo_root / "home").rglob("*.zsh")))
        for path in zsh_files:
            if path.is_file():
                self.command(("/bin/zsh", "-n", str(path)))

    def check_python(self) -> None:
        scripts = sorted((self.repo_root / "scripts").glob("*.py"))
        if not scripts:
            raise CheckFailure("no Python validation scripts found")

        local_modules = {path.stem for path in scripts}
        standard_modules = set(getattr(sys, "stdlib_module_names", ())) | {"__future__"}
        external: dict[str, set[str]] = {}
        for path in scripts:
            source = path.read_text(encoding="utf-8")
            try:
                tree = ast.parse(source, filename=str(path))
                compile(tree, str(path), "exec")
            except SyntaxError as error:
                raise CheckFailure(f"{path.relative_to(self.repo_root)}: {error}") from error
            for node in ast.walk(tree):
                module: str | None = None
                if isinstance(node, ast.Import):
                    for alias in node.names:
                        root = alias.name.partition(".")[0]
                        if not self.is_standard_module(root, standard_modules, local_modules):
                            external.setdefault(str(path.relative_to(self.repo_root)), set()).add(root)
                elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
                    module = node.module.partition(".")[0]
                if module and not self.is_standard_module(module, standard_modules, local_modules):
                    external.setdefault(str(path.relative_to(self.repo_root)), set()).add(module)
        if external:
            details = "; ".join(
                f"{path}: {', '.join(sorted(modules))}" for path, modules in sorted(external.items())
            )
            raise CheckFailure(f"third-party Python imports found: {details}")

    @staticmethod
    def is_standard_module(name: str, standard: set[str], local: set[str]) -> bool:
        if name in standard or name in local or name in sys.builtin_module_names:
            return True
        spec = importlib.util.find_spec(name)
        if spec is None or spec.origin in {"built-in", "frozen"}:
            return spec is not None
        origin = Path(spec.origin).resolve()
        stdlib = Path(sysconfig.get_paths()["stdlib"]).resolve()
        try:
            relative = origin.relative_to(stdlib)
        except ValueError:
            return False
        return not any(part in {"site-packages", "dist-packages"} for part in relative.parts)

    def check_json(self) -> None:
        for path in sorted(self.repo_root.rglob("*.json")):
            if ".git" in path.parts or ".local" in path.parts:
                continue
            try:
                json.loads(path.read_text(encoding="utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError) as error:
                raise CheckFailure(f"{path.relative_to(self.repo_root)}: {error}") from error

    def check_taskfile(self) -> None:
        task = shutil.which("task")
        if task is None:
            raise CheckFailure("task is not installed")
        result = self.command((task, "--list", "--json", "--no-status"))
        try:
            payload = json.loads(result.stdout)
            names = {item["name"] for item in payload["tasks"]}
        except (KeyError, TypeError, json.JSONDecodeError) as error:
            raise CheckFailure("task returned an unexpected JSON task list") from error
        if names != PUBLIC_TASKS:
            missing = sorted(PUBLIC_TASKS - names)
            extra = sorted(names - PUBLIC_TASKS)
            raise CheckFailure(f"public tasks differ (missing={missing}, extra={extra})")

    def check_brewfile(self) -> None:
        brew = shutil.which("brew")
        if brew is None:
            raise CheckFailure("Homebrew is not installed")
        brewfile_path = self.repo_root / "Brewfile"
        brewfile = str(brewfile_path)
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

        formulae = set(
            self.command((brew, "bundle", "list", "--formula", f"--file={brewfile}"))
            .stdout.strip()
            .splitlines()
        )
        casks = set(
            self.command((brew, "bundle", "list", "--cask", f"--file={brewfile}"))
            .stdout.strip()
            .splitlines()
        )
        if formulae != declared["brew"] or casks != declared["cask"]:
            raise CheckFailure(
                "Homebrew parsed a different allowlist "
                f"(formula missing={sorted(declared['brew'] - formulae)}, "
                f"formula extra={sorted(formulae - declared['brew'])}, "
                f"cask missing={sorted(declared['cask'] - casks)}, "
                f"cask extra={sorted(casks - declared['cask'])})"
            )

    def check_identity_tracking(self) -> None:
        identity = ".local/age/identity.txt"
        tracked = self.git("ls-files", "--error-unmatch", identity, allow_failure=True)
        if tracked.returncode == 0:
            raise CheckFailure(f"{identity} is tracked")
        ignored = self.git("check-ignore", "--quiet", identity, allow_failure=True)
        if ignored.returncode != 0:
            raise CheckFailure(f"{identity} is not ignored")

    def check_repository_secrets(self) -> None:
        for path in self.repo_root.rglob("*"):
            relative_path = path.relative_to(self.repo_root)
            if not path.is_file() or any(part in {".git", ".local"} for part in relative_path.parts):
                continue
            relative = str(relative_path)
            try:
                data = path.read_bytes()
            except OSError as error:
                raise CheckFailure(f"cannot inspect repository file {relative}: {error}") from error
            if any(
                line.startswith(marker)
                for line in data.splitlines()
                for marker in PRIVATE_KEY_MARKERS
            ):
                raise CheckFailure(f"repository file contains private-key material: {relative}")

    def check_chezmoi(self) -> None:
        chezmoi = shutil.which("chezmoi")
        if chezmoi is None:
            raise CheckFailure("chezmoi is not installed")
        config_template = self.repo_root / "home" / ".chezmoi.toml.tmpl"
        with tempfile.TemporaryDirectory(prefix="dotfiles-check-") as temporary:
            temporary_path = Path(temporary)
            rendered = self.command(
                (
                    chezmoi,
                    "--source",
                    str(self.repo_root / "home"),
                    "--config",
                    "/dev/null",
                    "--config-format",
                    "toml",
                    "--cache",
                    str(temporary_path / "cache"),
                    "--persistent-state",
                    str(temporary_path / "state.boltdb"),
                    "execute-template",
                    "--init",
                    "--file",
                    str(config_template),
                )
            )
            config = temporary_path / "chezmoi.toml"
            config.write_text(rendered.stdout, encoding="utf-8")
            config.chmod(0o600)
            common = (
                chezmoi,
                "--source",
                str(self.repo_root / "home"),
                "--destination",
                str(temporary_path / "destination"),
                "--config",
                str(config),
                "--cache",
                str(temporary_path / "cache"),
                "--persistent-state",
                str(temporary_path / "state.boltdb"),
            )
            managed = set(
                self.command(
                    (*common, "managed", "--exclude=encrypted", "--path-style=relative")
                ).stdout.splitlines()
            )
            required = {
                ".agents/skills",
                ".codex/AGENTS.md",
                ".config/ghostty/config",
                ".config/starship.toml",
                ".ssh/id_ed25519.pub",
                ".zsh_plugins_post.txt",
                ".zsh_plugins_pre.txt",
                ".zshrc",
                "Library/Application Support/Code/User/keybindings.json",
                "Library/Application Support/Code/User/settings.json",
            }
            missing = sorted(required - managed)
            if missing:
                raise CheckFailure(f"required managed targets missing: {missing}")

            encrypted = set(
                self.command(
                    (*common, "managed", "--include=encrypted", "--path-style=relative")
                ).stdout.splitlines()
            )
            if encrypted != {".ssh/id_ed25519"}:
                raise CheckFailure(f"encrypted targets differ: {sorted(encrypted)}")

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--ci",
        action="store_true",
        help="run without requiring local-only secrets or applied HOME state",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    repo_root = Path(__file__).resolve().parent.parent
    ci = args.ci or os.environ.get("DOTFILES_CI") == "1" or os.environ.get("CI") == "true"
    return RepositoryChecks(repo_root, ci=ci).run()


if __name__ == "__main__":
    raise SystemExit(main())
