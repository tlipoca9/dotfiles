#!/usr/bin/env python3
"""Read-only health checks for the declared macOS dotfiles environment."""

from __future__ import annotations

import argparse
import json
import os
import platform
import re
import shutil
import stat
import subprocess
import sys
import tempfile
from collections.abc import Callable, Sequence
from pathlib import Path

from zsh_plugins import ManifestError, ZshPluginManifest


class DoctorFailure(RuntimeError):
    """The applied environment does not satisfy a declared contract."""


class EnvironmentDoctor:
    """Diagnose the managed environment without repairing or cleaning it."""

    def __init__(self, repo_root: Path, *, source_zsh: bool = False) -> None:
        self.repo_root = repo_root
        self.home = Path.home()
        self.source_zsh = source_zsh
        self.failures: list[str] = []

    def run(self, *, only_zsh: bool = False) -> int:
        all_checks: Sequence[tuple[str, Callable[[], None]]] = (
            ("macOS", self.check_platform),
            ("Homebrew environment", self.check_brew),
            ("declared software", self.check_brewfile),
            ("applications and font", self.check_applications_and_font),
            ("age identity", self.check_identity),
            ("chezmoi state", self.check_chezmoi),
            ("SSH identity", self.check_ssh),
            ("interactive zsh", self.check_zsh),
            ("VS Code theme", self.check_vscode),
            ("Codex files", self.check_codex),
        )
        checks = (("interactive zsh", self.check_zsh),) if only_zsh else all_checks
        for label, check in checks:
            try:
                check()
            except DoctorFailure as error:
                self.failures.append(f"{label}: {error}")
                print(f"FAIL  {label}: {error}")
            else:
                print(f"PASS  {label}")

        if self.failures:
            print(f"\n{len(self.failures)} health check(s) failed.", file=sys.stderr)
            return 1
        subject = "Zsh runtime" if only_zsh else "Declared dotfiles environment"
        print(f"\n{subject} is healthy.")
        return 0

    def command(
        self,
        args: Sequence[str],
        *,
        timeout: int = 30,
        env: dict[str, str] | None = None,
    ) -> subprocess.CompletedProcess[str]:
        try:
            result = subprocess.run(
                args,
                cwd=self.repo_root,
                env=env,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=timeout,
                check=False,
            )
        except (OSError, subprocess.TimeoutExpired) as error:
            raise DoctorFailure(f"cannot run {args[0]}: {error}") from error
        if result.returncode != 0:
            detail = (result.stderr or result.stdout).strip()
            if len(detail) > 500:
                detail = detail[-500:]
            raise DoctorFailure(
                f"{' '.join(args)} exited {result.returncode}"
                + (f": {detail}" if detail else "")
            )
        return result

    def check_platform(self) -> None:
        if platform.system() != "Darwin":
            raise DoctorFailure("doctor supports macOS only")

    def check_brew(self) -> None:
        brew = shutil.which("brew")
        if brew is None:
            raise DoctorFailure("Homebrew is not installed")
        result = self.command((brew, "shellenv"))
        if "HOMEBREW_PREFIX" not in result.stdout:
            raise DoctorFailure("brew shellenv did not return a usable environment")

    def check_brewfile(self) -> None:
        brew = shutil.which("brew")
        if brew is None:
            raise DoctorFailure("Homebrew is not installed")
        self.command(
            (
                brew,
                "bundle",
                "check",
                "--no-upgrade",
                f"--file={self.repo_root / 'Brewfile'}",
            ),
            timeout=60,
        )

    def check_applications_and_font(self) -> None:
        applications = ("Ghostty.app", "Visual Studio Code.app", "ChatGPT.app")
        missing_apps = [
            name
            for name in applications
            if not any((base / name).is_dir() for base in (Path("/Applications"), self.home / "Applications"))
        ]
        if missing_apps:
            raise DoctorFailure(f"applications are unavailable: {missing_apps}")
        if shutil.which("codex") is None:
            raise DoctorFailure("Codex CLI is unavailable")

        result = self.command(("/usr/sbin/system_profiler", "SPFontsDataType", "-json"), timeout=30)
        try:
            fonts = json.loads(result.stdout).get("SPFontsDataType", [])
        except (AttributeError, json.JSONDecodeError) as error:
            raise DoctorFailure("system_profiler returned invalid font data") from error
        maple_found = any(
            "Maple Mono NF CN" in str(typeface.get("family", ""))
            or "Maple Mono NF CN" in str(typeface.get("fullname", ""))
            for font in fonts
            for typeface in font.get("typefaces", [])
        )
        if not maple_found:
            raise DoctorFailure("Maple Mono NF CN is unavailable to macOS")

    def check_identity(self) -> None:
        identity = self.repo_root / ".local" / "age" / "identity.txt"
        if not identity.is_file():
            raise DoctorFailure(".local/age/identity.txt is missing")
        if stat.S_IMODE(identity.stat().st_mode) != 0o600:
            raise DoctorFailure(".local/age/identity.txt must have mode 0600")
        age_dir = identity.parent
        if stat.S_IMODE(age_dir.stat().st_mode) != 0o700:
            raise DoctorFailure(".local/age must have mode 0700")
        local_dir = age_dir.parent
        if stat.S_IMODE(local_dir.stat().st_mode) != 0o700:
            raise DoctorFailure(".local must have mode 0700")
        tracked = subprocess.run(
            ("git", "ls-files", "--error-unmatch", ".local/age/identity.txt"),
            cwd=self.repo_root,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        )
        if tracked.returncode == 0:
            raise DoctorFailure("age identity is tracked by Git")
        ignored = subprocess.run(
            ("git", "check-ignore", "--quiet", ".local/age/identity.txt"),
            cwd=self.repo_root,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        )
        if ignored.returncode != 0:
            raise DoctorFailure("age identity is not ignored by Git")

    def check_chezmoi(self) -> None:
        chezmoi = shutil.which("chezmoi")
        age_keygen = shutil.which("age-keygen")
        if chezmoi is None or age_keygen is None:
            raise DoctorFailure("chezmoi and age-keygen must be installed")
        identity = self.repo_root / ".local" / "age" / "identity.txt"
        recipient = self.command((age_keygen, "-y", str(identity))).stdout.strip()
        if not recipient.startswith("age1"):
            raise DoctorFailure("age identity did not produce a valid recipient")

        config = self.repo_root / ".local" / "chezmoi.toml"
        state = self.repo_root / ".local" / "chezmoistate.boltdb"
        if not config.is_file() or stat.S_IMODE(config.stat().st_mode) != 0o600:
            raise DoctorFailure(".local/chezmoi.toml is missing or does not have mode 0600")

        with tempfile.TemporaryDirectory(prefix="dotfiles-doctor-") as temporary:
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
                    str(self.repo_root / "home" / ".chezmoi.toml.tmpl"),
                )
            )
            configured = re.search(r'^recipient\s*=\s*"([^"]+)"\s*$', rendered.stdout, re.MULTILINE)
            if configured is None or configured.group(1) != recipient:
                raise DoctorFailure("configured age recipient does not match the local identity")
            if config.read_text(encoding="utf-8") != rendered.stdout:
                raise DoctorFailure(".local/chezmoi.toml is stale; run task apply")

        self.command(
            (
                chezmoi,
                "--source",
                str(self.repo_root),
                "--destination",
                str(self.home),
                "--config",
                str(config),
                "--persistent-state",
                str(state),
                "verify",
            ),
            timeout=60,
        )

    def check_ssh(self) -> None:
        private_key = self.home / ".ssh" / "id_ed25519"
        public_key = self.home / ".ssh" / "id_ed25519.pub"
        for path, expected_mode in ((private_key, 0o600), (public_key, 0o644)):
            if not path.is_file():
                raise DoctorFailure(f"{path} is missing")
            mode = stat.S_IMODE(path.stat().st_mode)
            if mode != expected_mode:
                raise DoctorFailure(f"{path} must have mode {expected_mode:04o}")
        ssh_keygen = shutil.which("ssh-keygen")
        if ssh_keygen is None:
            raise DoctorFailure("ssh-keygen is unavailable")
        derived = self.command((ssh_keygen, "-y", "-f", str(private_key))).stdout.split()
        declared = public_key.read_text(encoding="utf-8").split()
        if len(derived) < 2 or len(declared) < 2 or derived[:2] != declared[:2]:
            raise DoctorFailure("SSH private and public keys do not match")

    def check_zsh(self) -> None:
        zsh = "/bin/zsh"
        cache_home = Path(os.environ.get("XDG_CACHE_HOME", self.home / ".cache"))
        static_dir = cache_home / "zsh" / "antidote"
        missing_static = [name for name in ("pre.zsh", "post.zsh") if not (static_dir / name).is_file()]
        if missing_static:
            raise DoctorFailure(f"Antidote static bundles are missing: {missing_static}")
        manifests = [
            self.repo_root / "home" / "dot_zsh_plugins_pre.txt",
            self.repo_root / "home" / "dot_zsh_plugins_post.txt",
        ]
        try:
            ZshPluginManifest.load(manifests).verify_checkouts(cache_home)
        except ManifestError as error:
            raise DoctorFailure(str(error)) from error
        probe = r'''
          set -eu
          (( $+functions[run-compinit] ))
          (( $+functions[compdef] ))
          (( $+functions[zvm_init] ))
          (( $+functions[fzf-tab-complete] )) || zvm_init
          (( $+widgets[fzf-tab-complete] ))
          [[ "$(bindkey -M viins '^I')" == *fzf-tab-complete* ]]
          [[ "$(bindkey -M viins '^R')" == *fzf-history-widget* ]]
          [[ "$(bindkey -M vicmd '^R')" == *fzf-history-widget* ]]
          (( $+functions[_zsh_autosuggest_start] ))
          (( $+functions[_zsh_highlight] ))
          (( $+commands[zoxide] ))
          (( $+functions[z] || $+aliases[z] ))
          (( $+functions[zi] || $+aliases[zi] ))
          (( $+commands[starship] ))
          [[ -n "${STARSHIP_SHELL:-}" ]]
        '''
        with tempfile.TemporaryDirectory(prefix="dotfiles-zsh-doctor-") as temporary:
            temporary_path = Path(temporary)
            temporary_cache = temporary_path / "cache"
            temporary_static = temporary_cache / "zsh" / "antidote"
            temporary_static.mkdir(parents=True)
            for name in ("pre.zsh", "post.zsh"):
                shutil.copy2(static_dir / name, temporary_static / name)
            zdotdir = self.home
            starship_config = self.home / ".config" / "starship.toml"
            if self.source_zsh:
                zdotdir = temporary_path / "zdotdir"
                zdotdir.mkdir()
                shutil.copy2(self.repo_root / "home" / "dot_zshrc", zdotdir / ".zshrc")
                starship_config = self.repo_root / "home" / "dot_config" / "starship.toml"
            environment = os.environ.copy()
            environment.update(
                {
                    "DOTFILES_DOCTOR": "1",
                    "HOME": str(self.home),
                    "STARSHIP_CONFIG": str(starship_config),
                    "TERM": "xterm-256color",
                    "XDG_CACHE_HOME": str(temporary_cache),
                    "XDG_STATE_HOME": str(temporary_path / "state"),
                    "ZDOTDIR": str(zdotdir),
                }
            )
            self.command((zsh, "-lic", probe), timeout=15, env=environment)

    def check_vscode(self) -> None:
        candidates = (
            shutil.which("code"),
            "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code",
        )
        code = next((path for path in candidates if path and Path(path).is_file()), None)
        if code is None:
            raise DoctorFailure("Visual Studio Code CLI is unavailable")
        extensions = {
            line.casefold()
            for line in self.command((code, "--list-extensions"), timeout=30).stdout.splitlines()
        }
        if "catppuccin.catppuccin-vsc" not in extensions:
            raise DoctorFailure("Catppuccin.catppuccin-vsc is not installed")

    def check_codex(self) -> None:
        if shutil.which("codex") is None:
            raise DoctorFailure("Codex CLI is unavailable")
        agents = self.home / ".codex" / "AGENTS.md"
        if not agents.is_file():
            raise DoctorFailure("~/.codex/AGENTS.md is missing")
        source_skills = self.repo_root / "home" / "dot_agents" / "skills"
        target_skills = self.home / ".agents" / "skills"
        expected = sorted(path.parent.name for path in source_skills.glob("*/SKILL.md"))
        if not expected:
            raise DoctorFailure("no vendored skills are declared")
        missing = [name for name in expected if not (target_skills / name / "SKILL.md").is_file()]
        if missing:
            raise DoctorFailure(f"managed skills are missing: {missing}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--only-zsh", action="store_true", help="run only the Zsh runtime probe")
    parser.add_argument(
        "--source-zsh",
        action="store_true",
        help="probe the repository Zsh source instead of the applied target",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    repo_root = Path(__file__).resolve().parent.parent
    if args.source_zsh and not args.only_zsh:
        raise SystemExit("--source-zsh requires --only-zsh")
    return EnvironmentDoctor(repo_root, source_zsh=args.source_zsh).run(only_zsh=args.only_zsh)


if __name__ == "__main__":
    raise SystemExit(main())
