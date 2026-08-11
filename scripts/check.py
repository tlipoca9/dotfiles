#!/usr/bin/env python3
"""Validate repository contracts without changing the user's environment."""

from __future__ import annotations

import argparse
import ast
import importlib.util
import json
import os
import shutil
import stat
import subprocess
import sys
import sysconfig
import tempfile
from collections.abc import Callable, Sequence
from pathlib import Path

from pi_config import PiConfigError, declared_npm_packages, load_managed_pi_settings


PUBLIC_TASKS = {"apply", "bootstrap", "check", "diff", "doctor", "update"}
APPROVED_CODEX_SKILLS = frozenset(
    {
        "ask-matt",
        "brainstorming",
        "code-review",
        "codebase-design",
        "container-build-mirrors",
        "diagnosing-bugs",
        "domain-modeling",
        "evidence-driven-design",
        "find-skills",
        "grill-me",
        "grill-with-docs",
        "grilling",
        "handoff",
        "implement",
        "improve-codebase-architecture",
        "prototype",
        "research",
        "setup-matt-pocock-skills",
        "tdd",
        "teach",
        "tencentcloud-yunapi-3-spec",
        "tencentcloud-yunapi-all-in-one",
        "tencentcloud-yunapi-gateway-request-id-escalation",
        "to-issues",
        "to-prd",
        "triage",
        "write-coherent-content",
        "writing-great-skills",
        "wxwork",
    }
)
APPROVED_PI_PACKAGES = frozenset(
    {
        "@ff-labs/pi-fff",
        "@narumitw/pi-btw",
        "@narumitw/pi-chrome-devtools",
        "@narumitw/pi-goal",
        "@narumitw/pi-stamp",
        "@plannotator/pi-extension",
        "@tmustier/pi-usage-extension",
        "pi-extmgr",
        "pi-interactive-shell",
        "pi-lean-ctx",
        "pi-lens",
        "pi-mcp-adapter",
        "pi-memctx",
        "pi-observational-memory",
        "pi-open-tui",
        "pi-rewind",
        "pi-simplify",
        "pi-subagents",
        "pi-web-access",
    }
)
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
            ("source root", self.check_source_root),
            ("shell syntax", self.check_shell_syntax),
            ("Python standard library", self.check_python),
            ("JSON", self.check_json),
            ("Codex skill allowlist", self.check_codex_skills),
            ("Pi configuration", self.check_pi),
            ("Taskfile API", self.check_taskfile),
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
        if spec is None:
            return False
        spec_origin = spec.origin
        if spec_origin is None or spec_origin in {"built-in", "frozen"}:
            return True
        origin = Path(spec_origin).resolve()
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
            if path.name.startswith("modify_"):
                continue
            try:
                json.loads(path.read_text(encoding="utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError) as error:
                raise CheckFailure(f"{path.relative_to(self.repo_root)}: {error}") from error

    def check_codex_skills(self) -> None:
        skills_root = self.repo_root / "home" / "dot_agents" / "skills"
        if not skills_root.is_dir():
            raise CheckFailure("home/dot_agents/skills is missing")
        actual = {path.name for path in skills_root.iterdir() if path.is_dir()}
        if actual != APPROVED_CODEX_SKILLS:
            missing = sorted(APPROVED_CODEX_SKILLS - actual)
            unexpected = sorted(actual - APPROVED_CODEX_SKILLS)
            raise CheckFailure(f"Codex skill allowlist differs: missing={missing}, unexpected={unexpected}")
        missing_entrypoints = sorted(
            name for name in APPROVED_CODEX_SKILLS if not (skills_root / name / "SKILL.md").is_file()
        )
        if missing_entrypoints:
            raise CheckFailure(f"vendored Codex skills lack SKILL.md: {missing_entrypoints}")

    def check_pi(self) -> None:
        source = self.repo_root / "home" / "dot_pi" / "private_agent" / "modify_settings.json"
        try:
            source_mode = source.stat().st_mode
        except OSError as error:
            raise CheckFailure(f"cannot inspect {source.relative_to(self.repo_root)}: {error}") from error
        if not source_mode & stat.S_IXUSR:
            raise CheckFailure("home/dot_pi/private_agent/modify_settings.json must be executable")
        preserved = {"lastChangelogVersion": "runtime-owned", "futurePiSetting": True}
        try:
            settings = load_managed_pi_settings(self.repo_root, preserved)
            packages = declared_npm_packages(settings)
        except PiConfigError as error:
            raise CheckFailure(str(error)) from error
        if any(settings.get(key) != value for key, value in preserved.items()):
            raise CheckFailure("Pi settings merge does not preserve runtime-owned fields")
        expected = {
            "defaultProvider": "openai-codex",
            "defaultModel": "gpt-5.6-sol",
            "defaultThinkingLevel": "high",
            "enabledModels": ["openai-codex/*", "openai/gpt-*"],
            "subagents": {"defaultThinking": "low"},
        }
        mismatched = {key: settings.get(key) for key, value in expected.items() if settings.get(key) != value}
        if mismatched:
            raise CheckFailure(f"managed OpenAI model policy differs: {mismatched}")
        package_names = {name for name, _ in packages}
        if len(package_names) != len(packages):
            raise CheckFailure("Pi package allowlist contains duplicate package names")
        if package_names != APPROVED_PI_PACKAGES:
            missing = sorted(APPROVED_PI_PACKAGES - package_names)
            unexpected = sorted(package_names - APPROVED_PI_PACKAGES)
            raise CheckFailure(f"Pi package allowlist differs: missing={missing}, unexpected={unexpected}")

        interactive = self.read_json_object("home/dot_pi/private_agent/interactive-shell.json")
        spawn = interactive.get("spawn")
        commands = spawn.get("commands") if isinstance(spawn, dict) else None
        if not isinstance(commands, dict) or set(commands) != {"codex", "pi"}:
            raise CheckFailure("interactive shell may only spawn Codex or Pi")
        web = self.read_json_object("home/dot_pi/web-search.json")
        search_routing = web.get("searchRouting")
        fetch_routing = web.get("fetchRouting")
        if (
            web.get("provider") != "openai"
            or not isinstance(search_routing, dict)
            or search_routing.get("providers") != ["openai"]
            or not isinstance(fetch_routing, dict)
            or fetch_routing.get("providers") != ["http"]
            or not str(web.get("summaryModel", "")).startswith("openai-codex/")
        ):
            raise CheckFailure("Pi web access is not restricted to OpenAI and local HTTP fetching")
        for capability in ("youtube", "video"):
            config = web.get(capability)
            enabled = config.get("enabled") if isinstance(config, dict) else None
            if not isinstance(enabled, bool) or enabled:
                raise CheckFailure(f"Pi {capability} must stay disabled because it requires other providers")
        plannotator = self.read_json_object("home/dot_pi/private_agent/plannotator.json")
        defaults = plannotator.get("defaults")
        phases = plannotator.get("phases")
        if (
            not isinstance(defaults, dict)
            or defaults.get("model", "missing") is not None
            or not isinstance(phases, dict)
            or any(not isinstance(phases.get(name), dict) or phases[name].get("model", "missing") is not None for name in ("planning", "executing"))
        ):
            raise CheckFailure("Plannotator must inherit the current OpenAI model in every phase")

    def read_json_object(self, relative: str) -> dict[str, object]:
        path = self.repo_root / relative
        try:
            value = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            raise CheckFailure(f"{relative}: {error}") from error
        if not isinstance(value, dict):
            raise CheckFailure(f"{relative} must contain a JSON object")
        return value

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
                ".pi/agent/interactive-shell.json",
                ".pi/agent/open-tui.json",
                ".pi/agent/plannotator.json",
                ".pi/agent/settings.json",
                ".pi/web-search.json",
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
