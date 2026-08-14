#!/usr/bin/env python3
"""Offline, temporary-HOME validation for this personal dotfiles repository."""

from __future__ import annotations

import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import tomllib

ROOT = Path(__file__).resolve().parents[1]
HOME_SOURCE = ROOT / "home"
DATA = HOME_SOURCE / ".chezmoidata" / "darwin"
SCRIPTS = HOME_SOURCE / ".chezmoiscripts" / "darwin"
MODIFIER = HOME_SOURCE / "dot_pi" / "private_agent" / "modify_settings.json"
SEMVER = re.compile(
    r"(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)"
    r"(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?"
    r"(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?"
)


def run(*args: str | os.PathLike[str], env: dict[str, str] | None = None,
        check: bool = True, input_text: str | None = None) -> subprocess.CompletedProcess[str]:
    completed = subprocess.run(
        [str(arg) for arg in args], cwd=ROOT, env=env, input=input_text,
        text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    )
    if check and completed.returncode:
        command = " ".join(str(arg) for arg in args)
        raise AssertionError(
            f"command failed ({completed.returncode}): {command}\n"
            f"stdout:\n{completed.stdout}\nstderr:\n{completed.stderr}"
        )
    return completed


def validate_declarations() -> None:
    for path in ROOT.rglob("*.toml"):
        if ".git" not in path.parts:
            tomllib.loads(path.read_text())

    logical_id = re.compile(r"[A-Za-z0-9][A-Za-z0-9._+-]*")
    package_name = re.compile(r"[A-Za-z0-9][A-Za-z0-9._+@/-]*")
    command_name = re.compile(r"[A-Za-z0-9][A-Za-z0-9._+-]*")
    packages = tomllib.loads((DATA / "packages.toml").read_text())["darwin"]["packages"]
    assert packages
    for key, package in packages.items():
        assert logical_id.fullmatch(key)
        assert set(package) <= {"manager", "kind", "name", "check"}
        assert package.get("manager") == "homebrew"
        assert package.get("kind") in {"formula", "cask"}
        assert package_name.fullmatch(package.get("name", key))
        if "check" in package:
            assert set(package["check"]) == {"command"}
            assert command_name.fullmatch(package["check"]["command"])

    vscode = tomllib.loads((DATA / "vscode.toml").read_text())["darwin"]["vscode"]
    assert set(vscode) == {"extensions"}
    extensions = vscode["extensions"]
    assert extensions and len(extensions) == len(set(extensions))
    assert all(re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]+", item) for item in extensions)

    dsh = tomllib.loads((DATA / "dsh.toml").read_text())["darwin"]["dsh"]
    assert set(dsh) == {"install_version"}
    assert isinstance(dsh["install_version"], str) and SEMVER.fullmatch(dsh["install_version"])

    for path in ROOT.rglob("*.json"):
        if path != MODIFIER and ".git" not in path.parts:
            json.loads(path.read_text())

    merged = run(sys.executable, MODIFIER, input_text='{"runtimeOwned":{"keep":true}}').stdout
    settings = json.loads(merged)
    assert settings["runtimeOwned"] == {"keep": True}
    pins = settings["packages"]
    assert pins and len(pins) == len(set(pins))
    pin_pattern = re.compile(r"npm:(?:@[^/]+/)?[^@/]+@" + SEMVER.pattern)
    assert all(pin_pattern.fullmatch(pin) for pin in pins)

    # Exact Pi pin strings must have one declaration source, not copied fixtures/docs.
    text_files = [path for path in ROOT.rglob("*") if path.is_file() and ".git" not in path.parts]
    for pin in pins:
        owners = []
        for path in text_files:
            try:
                if pin in path.read_text():
                    owners.append(path)
            except UnicodeDecodeError:
                pass
        assert owners == [MODIFIER], (pin, owners)

    plugin_pattern = re.compile(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+ pin:[0-9a-f]{40}")
    repositories: list[str] = []
    for phase in ("pre", "post"):
        lines = (HOME_SOURCE / f"dot_zsh_plugins_{phase}.txt").read_text().splitlines()
        assert lines and all(plugin_pattern.fullmatch(line) for line in lines)
        repositories.extend(line.split()[0] for line in lines)
    assert len(repositories) == len(set(repositories))


def chezmoi_base(source: Path, destination: Path, config: Path, cache: Path,
                  state: Path) -> list[str]:
    return [
        "chezmoi", "--source", source, "--destination", destination,
        "--config", config, "--config-format", "toml", "--cache", cache,
        "--persistent-state", state,
    ]


def validate_render_and_apply(sandbox: Path, env: dict[str, str]) -> None:
    destination = sandbox / "destination"
    cache = sandbox / "cache"
    rendered = sandbox / "rendered"
    destination.mkdir()
    cache.mkdir()
    rendered.mkdir()
    config = sandbox / "chezmoi.toml"
    state = sandbox / "state.boltdb"

    initial = chezmoi_base(ROOT, destination, Path("/dev/null"), cache, state)
    config.write_text(run(
        *initial, "execute-template", "--init", "--file", "home/.chezmoi.toml.tmpl", env=env,
    ).stdout)
    tomllib.loads(config.read_text())
    assert str(Path(env["HOME"]) / ".config/chezmoi/age.txt") in config.read_text()

    common = chezmoi_base(ROOT, destination, config, cache, state)
    rendered_scripts: dict[str, Path] = {}
    for source in sorted(SCRIPTS.glob("*.tmpl")):
        target = rendered / source.name.removesuffix(".tmpl")
        target.write_text(run(*common, "execute-template", "--file", source.relative_to(ROOT), env=env).stdout)
        assert target.read_text()
        run("/bin/sh", "-n", target, env=env)
        non_darwin = run(
            *common, "--override-data", '{"chezmoi":{"os":"linux"}}',
            "execute-template", "--file", source.relative_to(ROOT), env=env,
        ).stdout
        assert non_darwin == "#!/bin/sh\nexit 0\n", (source, non_darwin)
        rendered_scripts[source.name] = target

    for template in (
        "home/dot_dsh/cordis.patch.yml.tmpl",
        "home/dot_dsh/dot_agent-presets/worktree/agent.cordis.yml.tmpl",
    ):
        output = run(*common, "execute-template", "--file", template, env=env).stdout
        assert "/.dsh/worktree.mjs" in output
        assert "name: {{" not in output

    managed = run(*common, "managed", "--exclude=encrypted,scripts", "--path-style=relative", env=env).stdout.splitlines()
    assert ".pi/agent/settings.json" in managed
    assert ".ssh/id_ed25519.pub" in managed
    assert ".zshrc" in managed
    encrypted = run(*common, "managed", "--include=encrypted", "--path-style=relative", env=env).stdout.splitlines()
    assert encrypted == [".ssh/id_ed25519"]

    run(*common, "apply", "--exclude=encrypted,scripts", env=env)
    run(*common, "verify", "--exclude=encrypted,scripts", env=env)
    assert stat.S_IMODE((destination / ".pi/agent").stat().st_mode) == 0o700
    assert stat.S_IMODE((destination / ".ssh/id_ed25519.pub").stat().st_mode) == 0o644
    assert not (destination / ".ssh/id_ed25519").exists()

    validate_dsh_first_install(rendered_scripts["run_onchange_after_15-install-dsh.sh.tmpl"], sandbox, env)


def validate_dsh_first_install(script: Path, sandbox: Path, base_env: dict[str, str]) -> None:
    fake = sandbox / "fake-bin"
    fake.mkdir()
    log = sandbox / "npm.log"
    brew = fake / "brew"
    brew.write_text("#!/bin/sh\n[ \"$1\" = shellenv ] && printf 'export HOMEBREW_PREFIX=%s\\n' \"${FAKE_BREW_PREFIX:?}\"\n")
    node = fake / "node"
    node.write_text("#!/bin/sh\nexit 0\n")
    npm = fake / "npm"
    npm.write_text(
        "#!/bin/sh\nprintf '%s\\n' \"$*\" >>\"${FAKE_NPM_LOG:?}\"\n"
        "cat >\"${FAKE_BIN:?}/dsh\" <<'EOF'\n#!/bin/sh\nexit 0\nEOF\n"
        "chmod +x \"$FAKE_BIN/dsh\"\n"
    )
    for path in (brew, node, npm):
        path.chmod(0o755)
    env = {
        **base_env,
        "PATH": f"{fake}:/usr/bin:/bin",
        "FAKE_BIN": str(fake),
        "FAKE_NPM_LOG": str(log),
        "FAKE_BREW_PREFIX": str(sandbox / "brew-prefix"),
    }
    run("/bin/sh", script, env=env)
    install_version = tomllib.loads((DATA / "dsh.toml").read_text())["darwin"]["dsh"]["install_version"]
    assert log.read_text().splitlines() == [
        f"install --global --no-fund --no-audit @deepseek-ai/dsh@{install_version}"
    ]

    # Existing DSH bypasses Homebrew, Node, npm, and version inspection entirely.
    brew.unlink()
    node.unlink()
    npm.unlink()
    run("/bin/sh", script, env=env)
    assert len(log.read_text().splitlines()) == 1

    source = sandbox / "invalid-dsh-source"
    (source / "home/.chezmoidata/darwin").mkdir(parents=True)
    (source / "home/.chezmoiscripts/darwin").mkdir(parents=True)
    (source / "home/.chezmoitemplates").mkdir(parents=True)
    (source / ".chezmoiroot").write_text("home\n")
    shutil.copy(SCRIPTS / "run_onchange_after_15-install-dsh.sh.tmpl", source / "home/.chezmoiscripts/darwin/")
    shutil.copy(HOME_SOURCE / ".chezmoitemplates/darwin-shell-helpers", source / "home/.chezmoitemplates/")
    (source / "home/.chezmoidata/darwin/dsh.toml").write_text(
        '[darwin.dsh]\ninstall_version = "1.2.3\\\"; touch /tmp/dotfiles-dsh-injection"\n'
    )
    common = chezmoi_base(
        source, sandbox / "invalid-home", Path("/dev/null"),
        sandbox / "invalid-cache", sandbox / "invalid-state.boltdb",
    )
    failed = run(
        *common, "execute-template", "--init", "--file",
        "home/.chezmoiscripts/darwin/run_onchange_after_15-install-dsh.sh.tmpl",
        env=base_env, check=False,
    )
    assert failed.returncode != 0


def validate_repository_contracts(env: dict[str, str]) -> None:
    assert (ROOT / ".chezmoiroot").read_text() == "home\n"
    assert not (ROOT / ".github/workflows/check.yml").exists()
    assert not list((ROOT / ".github/workflows").glob("*"))
    for forbidden in ("Taskfile.yml", "tasks", "platform", "scripts", "bootstrap.sh"):
        assert not (ROOT / forbidden).exists()
    assert not list(HOME_SOURCE.rglob("exact_*"))

    ssh_files = sorted(path.name for path in (HOME_SOURCE / "dot_ssh").iterdir())
    assert ssh_files == ["encrypted_private_id_ed25519.age", "id_ed25519.pub"]
    assert stat.S_IMODE(MODIFIER.stat().st_mode) == 0o755
    assert not list(ROOT.rglob("age.txt"))
    assert not list(ROOT.rglob("identity.txt"))

    secret_scan = run(
        "git", "grep", "-n", "-E",
        r"AGE-SECRET-KEY-|-----BEGIN (OPENSSH |RSA |EC )?PRIVATE KEY-----",
        env=env, check=False,
    )
    assert secret_scan.returncode == 1, secret_scan.stdout

    zshrc = (HOME_SOURCE / "dot_zshrc").read_text()
    assert zshrc.count("${_dotfiles_zsh_current:A}") == 1
    assert "$DOTFILES_ZSH_GENERATION/pre.zsh" in zshrc
    assert "$DOTFILES_ZSH_GENERATION/post.zsh" in zshrc
    pi_script = (SCRIPTS / "run_onchange_after_40-install-pi-extensions.sh.tmpl").read_text()
    assert "pi list >/dev/null" in pi_script
    assert "Failed to load extension" not in pi_script

    run("node", "--check", "home/dot_dsh/worktree-git.mjs", env=env)
    run("node", "--check", "home/dot_dsh/worktree.mjs", env=env)
    run("node", "--test", "tests/worktree.test.mjs", env=env)
    run("/bin/zsh", "-n", "home/dot_zshrc", env=env)
    run("git", "diff", "--check", env=env)


def main() -> int:
    required = ("chezmoi", "git", "node")
    missing = [command for command in required if shutil.which(command) is None]
    if missing:
        raise SystemExit(f"missing required local command(s): {', '.join(missing)}")

    validate_declarations()
    with tempfile.TemporaryDirectory(prefix="dotfiles-check-") as temporary:
        sandbox = Path(temporary)
        fake_home = sandbox / "home"
        fake_home.mkdir()
        env = {**os.environ, "HOME": str(fake_home)}
        validate_render_and_apply(sandbox, env)
        validate_repository_contracts(env)
    print("dotfiles checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
