#!/usr/bin/env python3
"""Offline, temporary-HOME validation for this personal dotfiles repository."""

from __future__ import annotations

import json
import os
from pathlib import Path
import re
import runpy
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
SKILLS = HOME_SOURCE / "dot_agents" / "skills"
PRIVATE_SKILLS = {"garyyu-perspective", "tlipoca9-perspective"}
MODIFIER = HOME_SOURCE / "dot_pi" / "private_agent" / "modify_settings.json"
BROWSER = HOME_SOURCE / "dot_pi" / "private_agent" / "extensions" / "browser"
LEAN_CTX_CONFIG_SOURCE = (
    HOME_SOURCE / "dot_pi" / "private_agent" / "extensions"
    / "pi-lean-ctx" / "config.json.tmpl"
)
DSH_PATCH = HOME_SOURCE / "dot_dsh" / "cordis.patch.yml"
WORKTREE_SKILL = (
    HOME_SOURCE / "dot_agents" / "skills" / "git-worktree-delegation" / "SKILL.md"
)
EXPECTED_DSH_PATCH = (
    "# Stock DeepSeek Harness configuration: no custom plugins or overrides.\n[]\n"
)
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


class TrackedSnapshot:
    """One repository-worktree snapshot with a single-read text cache."""

    def __init__(self) -> None:
        completed = subprocess.run(
            ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
            cwd=ROOT, stdout=subprocess.PIPE,
            stderr=subprocess.PIPE, check=False,
        )
        if completed.returncode:
            raise AssertionError(
                f"git ls-files failed ({completed.returncode}): "
                f"{completed.stderr.decode(errors='replace')}"
            )
        relative_paths = tuple(
            Path(os.fsdecode(raw)) for raw in completed.stdout.split(b"\0") if raw
        )
        self.paths = tuple(
            ROOT / path
            for path in relative_paths
            if os.path.lexists(ROOT / path)
        )
        self._path_set = frozenset(self.paths)
        self._text: dict[Path, str | None] = {}
        self._read_count: dict[Path, int] = {}

    def contains(self, path: Path) -> bool:
        return path in self._path_set

    def under(self, directory: Path) -> tuple[Path, ...]:
        return tuple(path for path in self.paths if path.is_relative_to(directory))

    def text(self, path: Path) -> str | None:
        if path not in self._path_set:
            raise AssertionError(f"refusing to read non-tracked repository path: {path}")
        if path not in self._text:
            self._read_count[path] = self._read_count.get(path, 0) + 1
            try:
                self._text[path] = path.read_text()
            except UnicodeDecodeError:
                self._text[path] = None
        return self._text[path]

    def required_text(self, path: Path) -> str:
        text = self.text(path)
        assert text is not None, f"expected tracked UTF-8 text: {path}"
        return text

    def read_count(self, path: Path) -> int:
        return self._read_count.get(path, 0)

    def assert_all_text_read_once(self) -> None:
        assert set(self._text) == self._path_set
        assert all(count == 1 for count in self._read_count.values())


def validate_ignored_identity_fixture(snapshot: TrackedSnapshot) -> None:
    """An ignored fake identity must never enter repository discovery or reads."""
    identity = ROOT / ".local" / "age" / "identity.txt"
    created = False
    if not identity.exists():
        identity.parent.mkdir(parents=True, exist_ok=True)
        identity.write_text("fake identity fixture; never a real credential\n")
        created = True
    try:
        assert not snapshot.contains(identity)
        try:
            snapshot.text(identity)
        except AssertionError as error:
            assert "non-tracked" in str(error)
        else:
            raise AssertionError("ignored identity unexpectedly entered the tracked reader")
        assert snapshot.read_count(identity) == 0
    finally:
        if created:
            identity.unlink()
            for directory in (identity.parent, identity.parent.parent):
                try:
                    directory.rmdir()
                except OSError:
                    pass


def validate_declarations(snapshot: TrackedSnapshot) -> None:
    for path in snapshot.paths:
        if path.suffix == ".toml":
            tomllib.loads(snapshot.required_text(path))

    logical_id = re.compile(r"[A-Za-z0-9][A-Za-z0-9._+-]*")
    package_name = re.compile(r"[A-Za-z0-9][A-Za-z0-9._+@/-]*")
    command_name = re.compile(r"[A-Za-z0-9][A-Za-z0-9._+-]*")
    packages = tomllib.loads(snapshot.required_text(DATA / "packages.toml"))["darwin"]["packages"]
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

    vscode = tomllib.loads(snapshot.required_text(DATA / "vscode.toml"))["darwin"]["vscode"]
    assert set(vscode) == {"extensions"}
    extensions = vscode["extensions"]
    assert extensions and len(extensions) == len(set(extensions))
    assert all(re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]+", item) for item in extensions)

    dsh = tomllib.loads(snapshot.required_text(DATA / "dsh.toml"))["darwin"]["dsh"]
    assert set(dsh) == {"install_version"}
    assert isinstance(dsh["install_version"], str) and SEMVER.fullmatch(dsh["install_version"])

    for path in snapshot.paths:
        if path.suffix == ".json" and path != MODIFIER:
            json.loads(snapshot.required_text(path))

    merged = run(sys.executable, MODIFIER, input_text='{"runtimeOwned":{"keep":true}}').stdout
    settings = json.loads(merged)
    assert settings["runtimeOwned"] == {"keep": True}
    pins = settings["packages"]
    assert pins and len(pins) == len(set(pins))
    pin_pattern = re.compile(r"npm:(?:@[^/]+/)?[^@/]+@" + SEMVER.pattern)
    assert all(pin_pattern.fullmatch(pin) for pin in pins)

    # Reverse-scan the cached tracked texts once: exact pins have one declaration owner.
    owners: dict[str, list[Path]] = {pin: [] for pin in pins}
    for path in snapshot.paths:
        text = snapshot.text(path)
        if text is None:
            continue
        for pin in pins:
            if pin in text:
                owners[pin].append(path)
    for pin in pins:
        assert owners[pin] == [MODIFIER], (pin, owners[pin])

    modifier_globals = runpy.run_path(str(MODIFIER))
    browser_source = modifier_globals["BROWSER_EXTENSION_SOURCE"]
    assert set(browser_source) == {"repository", "commit", "localPolicy"}
    assert browser_source["repository"] == "https://github.com/amosblomqvist/pi-config.git"
    assert browser_source["localPolicy"] == "default-on"
    browser_commit = browser_source["commit"]
    assert re.fullmatch(r"[0-9a-f]{40}", browser_commit)
    assert [
        path for path in snapshot.paths
        if browser_commit in (snapshot.text(path) or "")
    ] == [MODIFIER]

    browser_files = snapshot.under(BROWSER)
    assert tuple(path.name for path in browser_files) == (
        "README.md", "index.ts", "package-lock.json", "package.json",
    )
    browser_package = json.loads(snapshot.required_text(BROWSER / "package.json"))
    assert browser_package["private"] is True
    assert browser_package["pi"] == {"extensions": ["./index.ts"]}
    assert browser_package["dependencies"] == {"playwright-core": "^1.49.0"}
    browser_lock = json.loads(snapshot.required_text(BROWSER / "package-lock.json"))
    playwright = browser_lock["packages"]["node_modules/playwright-core"]
    assert playwright == {
        "version": "1.60.0",
        "resolved": "https://registry.npmjs.org/playwright-core/-/playwright-core-1.60.0.tgz",
        "integrity": "sha512-9bW6zvX/m0lEbgTKJ6YppOKx8H3VOPBMOCFh2irXFOT4BbHgrx5hPjwJYLT40Lu+4qtD36qKc/Hn56StUW57IA==",
        "license": "Apache-2.0",
        "bin": {"playwright-core": "cli.js"},
        "engines": {"node": ">=18"},
    }
    browser_index = snapshot.required_text(BROWSER / "index.ts")
    browser_readme = snapshot.required_text(BROWSER / "README.md")
    assert 'let enabled = true;' in browser_index
    assert 'let want = true;' in browser_index
    assert "managed default is on" in browser_index
    assert "apply the\n  // managed default" in browser_index
    assert "flip the\n  // browser tools out" not in browser_index
    assert 'pi.registerCommand("browser"' in browser_index
    assert "for (const name of BROWSER_TOOL_NAMES) active.delete(name);" in browser_index
    assert "pi.setActiveTools(Array.from(active));" in browser_index
    assert "Default on, opt out per session" in browser_readme
    assert "`/new` starts enabled" in browser_readme
    assert "resets to off" not in browser_readme
    assert not any("pi-chrome-devtools" in pin for pin in pins)

    lean_ctx_package = packages["lean_ctx"]
    assert lean_ctx_package == {
        "manager": "homebrew",
        "kind": "formula",
        "name": "yvgude/lean-ctx/lean-ctx",
        "check": {"command": "lean-ctx"},
    }
    lean_ctx_config_template = snapshot.required_text(LEAN_CTX_CONFIG_SOURCE)
    assert '"binary": "{{ output "brew" "--prefix" | trim }}/bin/lean-ctx"' in (
        lean_ctx_config_template
    )
    assert '"ctx_find"' in lean_ctx_config_template
    assert '"ctx_grep"' in lean_ctx_config_template

    plugin_pattern = re.compile(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+ pin:[0-9a-f]{40}")
    repositories: list[str] = []
    for phase in ("pre", "post"):
        lines = snapshot.required_text(HOME_SOURCE / f"dot_zsh_plugins_{phase}.txt").splitlines()
        assert lines and all(plugin_pattern.fullmatch(line) for line in lines)
        repositories.extend(line.split()[0] for line in lines)
    assert len(repositories) == len(set(repositories))


def chezmoi_base(source: Path, destination: Path, config: Path, cache: Path,
                  state: Path) -> list[str | Path]:
    return [
        "chezmoi", "--source", source, "--destination", destination,
        "--config", config, "--config-format", "toml", "--cache", cache,
        "--persistent-state", state,
    ]


def validate_render_and_apply(snapshot: TrackedSnapshot, sandbox: Path,
                              env: dict[str, str]) -> None:
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
    config_text = config.read_text()
    tomllib.loads(config_text)
    assert str(Path(env["HOME"]) / ".config/chezmoi/age.txt") in config_text

    common = chezmoi_base(ROOT, destination, config, cache, state)
    rendered_scripts: dict[str, Path] = {}
    script_sources = sorted(
        path for path in snapshot.under(SCRIPTS) if path.name.endswith(".tmpl")
    )
    for source in script_sources:
        target = rendered / source.name.removesuffix(".tmpl")
        target.write_text(run(*common, "execute-template", "--file", source.relative_to(ROOT), env=env).stdout)
        assert target.stat().st_size > 0
        run("/bin/sh", "-n", target, env=env)
        non_darwin = run(
            *common, "--override-data", '{"chezmoi":{"os":"linux"}}',
            "execute-template", "--file", source.relative_to(ROOT), env=env,
        ).stdout
        assert non_darwin == "#!/bin/sh\nexit 0\n", (source, non_darwin)
        rendered_scripts[source.name] = target

    managed = run(*common, "managed", "--exclude=encrypted,scripts", "--path-style=relative", env=env).stdout.splitlines()
    assert ".agents/skills/git-worktree-delegation/SKILL.md" in managed
    assert ".dsh/cordis.patch.yml" in managed
    assert ".pi/agent/settings.json" in managed
    assert ".pi/agent/extensions/browser/index.ts" in managed
    assert ".pi/agent/extensions/pi-lean-ctx/config.json" in managed
    assert ".ssh/id_ed25519.pub" in managed
    assert ".zshrc" in managed
    encrypted = run(*common, "managed", "--include=encrypted", "--path-style=relative", env=env).stdout.splitlines()
    assert ".ssh/id_ed25519" in encrypted
    assert all(
        path == ".ssh/id_ed25519"
        or any(path.startswith(f".agents/skills/{directory}/")
               for directory in PRIVATE_SKILLS)
        for path in encrypted
    )
    assert all(
        f".agents/skills/{directory}/SKILL.md" in encrypted
        for directory in PRIVATE_SKILLS
    )

    run(*common, "apply", "--exclude=encrypted,scripts", env=env)
    run(*common, "verify", "--exclude=encrypted,scripts", env=env)
    assert (destination / ".dsh/cordis.patch.yml").read_text() == EXPECTED_DSH_PATCH
    assert (
        destination / ".agents/skills/git-worktree-delegation/SKILL.md"
    ).read_text() == snapshot.required_text(WORKTREE_SKILL)
    assert stat.S_IMODE((destination / ".pi/agent").stat().st_mode) == 0o700
    assert (
        destination / ".pi/agent/extensions/browser/index.ts"
    ).read_text() == snapshot.required_text(BROWSER / "index.ts")
    assert json.loads(
        (destination / ".pi/agent/extensions/pi-lean-ctx/config.json").read_text()
    ) == {
        "binary": f"{run('brew', '--prefix', env=env).stdout.strip()}/bin/lean-ctx",
        "disableTools": ["ctx_find", "ctx_grep"],
    }
    assert stat.S_IMODE((destination / ".ssh/id_ed25519.pub").stat().st_mode) == 0o644
    assert not (destination / ".ssh/id_ed25519").exists()

    validate_dsh_first_install(
        snapshot, rendered_scripts["run_onchange_after_15-install-dsh.sh.tmpl"], sandbox, env,
    )
    validate_zsh_generation(
        rendered_scripts["run_onchange_after_20-build-zsh-plugins.sh.tmpl"], sandbox, env,
    )


def executable(path: Path, content: str) -> None:
    path.write_text(content)
    path.chmod(0o755)


def fake_brew(path: Path) -> None:
    executable(path, """#!/bin/sh
case "$*" in
  shellenv)
    printf 'export HOMEBREW_PREFIX=%s\\nexport PATH=%s/bin:$PATH\\n' \
      "${FAKE_BREW_PREFIX:?}" "${FAKE_BREW_PREFIX:?}"
    ;;
  '--prefix antidote')
    printf '%s\\n' "${FAKE_BREW_PREFIX:?}"
    ;;
  *) exit 64 ;;
esac
""")


def validate_dsh_first_install(snapshot: TrackedSnapshot, script: Path,
                               sandbox: Path, base_env: dict[str, str]) -> None:
    scenarios = sandbox / "dsh-scenarios"
    scenarios.mkdir()
    npm_log = scenarios / "npm.log"
    common_env = {
        **base_env,
        "FAKE_NPM_LOG": str(npm_log),
    }

    initial_bin = scenarios / "initial-bin"
    initial_bin.mkdir()
    executable(initial_bin / "dsh", "#!/bin/sh\nexit 0\n")
    executable(initial_bin / "brew", "#!/bin/sh\nexit 91\n")
    run("/bin/sh", script, env={**common_env, "PATH": f"{initial_bin}:/usr/bin:/bin"})
    assert not npm_log.exists()

    shellenv_bin = scenarios / "shellenv-bin"
    shellenv_prefix = scenarios / "shellenv-prefix"
    shellenv_bin.mkdir()
    (shellenv_prefix / "bin").mkdir(parents=True)
    fake_brew(shellenv_bin / "brew")
    executable(shellenv_prefix / "bin/dsh", "#!/bin/sh\nexit 0\n")
    run("/bin/sh", script, env={
        **common_env,
        "PATH": f"{shellenv_bin}:/usr/bin:/bin",
        "FAKE_BREW_PREFIX": str(shellenv_prefix),
    })
    assert not npm_log.exists()

    missing_bin = scenarios / "missing-bin"
    missing_prefix = scenarios / "missing-prefix"
    missing_bin.mkdir()
    (missing_prefix / "bin").mkdir(parents=True)
    fake_brew(missing_bin / "brew")
    executable(missing_prefix / "bin/node", "#!/bin/sh\nexit 0\n")
    executable(missing_prefix / "bin/npm", """#!/bin/sh
printf '%s\\n' "$*" >>"${FAKE_NPM_LOG:?}"
cat >"${FAKE_BREW_PREFIX:?}/bin/dsh" <<'EOF'
#!/bin/sh
exit 0
EOF
chmod +x "$FAKE_BREW_PREFIX/bin/dsh"
""")
    run("/bin/sh", script, env={
        **common_env,
        "PATH": f"{missing_bin}:/usr/bin:/bin",
        "FAKE_BREW_PREFIX": str(missing_prefix),
    })
    install_version = tomllib.loads(snapshot.required_text(DATA / "dsh.toml"))["darwin"]["dsh"]["install_version"]
    assert npm_log.read_text().splitlines() == [
        f"install --global --no-fund --no-audit @deepseek-ai/dsh@{install_version}"
    ]

    source = sandbox / "invalid-dsh-source"
    (source / "home/.chezmoidata/darwin").mkdir(parents=True)
    (source / "home/.chezmoiscripts/darwin").mkdir(parents=True)
    (source / "home/.chezmoitemplates").mkdir(parents=True)
    (source / ".chezmoiroot").write_text("home\n")
    dsh_template = SCRIPTS / "run_onchange_after_15-install-dsh.sh.tmpl"
    (source / "home/.chezmoiscripts/darwin" / dsh_template.name).write_text(
        snapshot.required_text(dsh_template)
    )
    (source / "home/.chezmoitemplates/darwin-shell-helpers").write_text(
        snapshot.required_text(HOME_SOURCE / ".chezmoitemplates/darwin-shell-helpers")
    )
    (source / "home/.chezmoidata/darwin/dsh.toml").write_text(
        '[darwin.dsh]\ninstall_version = "1.2.3\\"; touch /tmp/dotfiles-dsh-injection"\n'
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


def validate_zsh_generation(script: Path, sandbox: Path,
                            base_env: dict[str, str]) -> None:
    fixture = sandbox / "zsh-generation"
    fake_bin = fixture / "bin"
    prefix = fixture / "brew-prefix"
    antidote = prefix / "share/antidote/antidote.zsh"
    cache = fixture / "cache"
    fake_bin.mkdir(parents=True)
    antidote.parent.mkdir(parents=True)
    cache.mkdir()
    fake_brew(fake_bin / "brew")
    antidote.write_text("""antidote() {
  local content
  content=$(cat)
  if [[ -n ${FAKE_ANTIDOTE_FAIL_POST:-} && $content == *Aloxaf/fzf-tab* ]]; then
    return 23
  fi
  print -r -- "compiled:${content}"
}
""")
    env = {
        **base_env,
        "PATH": f"{fake_bin}:/usr/bin:/bin",
        "FAKE_BREW_PREFIX": str(prefix),
        "XDG_CACHE_HOME": str(cache),
    }

    run("/bin/sh", script, env=env)
    current = cache / "zsh/antidote/current"
    first_target = os.readlink(current)
    first_generation = current.resolve()
    first_pre = (first_generation / "pre.zsh").read_text()
    first_post = (first_generation / "post.zsh").read_text()
    assert "mattmc3/ez-compinit" in first_pre
    assert "Aloxaf/fzf-tab" in first_post

    failed = run("/bin/sh", script, env={**env, "FAKE_ANTIDOTE_FAIL_POST": "1"}, check=False)
    assert failed.returncode != 0
    assert os.readlink(current) == first_target
    assert current.resolve() == first_generation
    assert (first_generation / "pre.zsh").read_text() == first_pre
    assert (first_generation / "post.zsh").read_text() == first_post


def validate_repository_contracts(snapshot: TrackedSnapshot,
                                  env: dict[str, str]) -> None:
    assert snapshot.required_text(ROOT / ".chezmoiroot") == "home\n"
    assert snapshot.required_text(DSH_PATCH) == EXPECTED_DSH_PATCH
    skill_text = snapshot.required_text(WORKTREE_SKILL)
    assert skill_text.startswith(
        "---\nname: git-worktree-delegation\ndescription: "
    )
    assert "\n---\n\n# Git worktree delegation\n" in skill_text
    assert snapshot.under(WORKTREE_SKILL.parent) == (WORKTREE_SKILL,)
    tracked_relative = tuple(path.relative_to(ROOT) for path in snapshot.paths)
    assert Path(".github/workflows/check.yml") not in tracked_relative
    assert not any(path.parts[:2] == (".github", "workflows") for path in tracked_relative)
    for forbidden in ("Taskfile.yml", "tasks", "platform", "scripts", "bootstrap.sh"):
        assert not any(path.parts and path.parts[0] == forbidden for path in tracked_relative)
    assert not any(path.name.startswith("exact_") and path.is_relative_to(HOME_SOURCE)
                   for path in snapshot.paths)

    skill_paths = snapshot.under(SKILLS)
    assert skill_paths
    top_level_skills = {
        path.relative_to(SKILLS).parts[0]
        for path in skill_paths
    }
    assert all(
        (SKILLS / directory / "SKILL.md") in skill_paths
        or (SKILLS / directory / "encrypted_SKILL.md.age") in skill_paths
        for directory in top_level_skills
    )
    assert not any(len(path.relative_to(SKILLS).parts) == 1 for path in skill_paths)
    assert not snapshot.under(HOME_SOURCE / "dot_codex" / "skills")
    assert not any(
        path.name in {".DS_Store", "__pycache__"} or path.suffix == ".pyc"
        for path in skill_paths
    )

    assert PRIVATE_SKILLS <= top_level_skills
    for directory in PRIVATE_SKILLS:
        private_paths = snapshot.under(SKILLS / directory)
        assert private_paths
        assert all(path.suffix == ".age" for path in private_paths)

    skill_names: dict[str, Path] = {
        directory: SKILLS / directory / "encrypted_SKILL.md.age"
        for directory in PRIVATE_SKILLS
    }
    for path in skill_paths:
        if path.name != "SKILL.md":
            continue
        text = snapshot.required_text(path)
        assert text.startswith("---\n"), path
        frontmatter, separator, _ = text[4:].partition("\n---\n")
        assert separator, path
        fields = {}
        for line in frontmatter.splitlines():
            key, colon, value = line.partition(":")
            if colon and key in {"name", "description"}:
                fields[key] = value.strip().strip("\"'")
        assert fields.get("name"), path
        assert fields.get("description"), path
        assert fields["name"] not in skill_names, (
            fields["name"], skill_names.get(fields["name"]), path
        )
        skill_names[fields["name"]] = path

    nuwa = snapshot.required_text(SKILLS / "huashu-nuwa" / "SKILL.md")
    assert "[skills-source]/[person-name]-perspective/SKILL.md" in nuwa
    assert "写入 `.claude/skills" not in nuwa

    ssh_files = sorted(
        path.name for path in snapshot.under(HOME_SOURCE / "dot_ssh")
        if path.parent == HOME_SOURCE / "dot_ssh"
    )
    assert ssh_files == ["encrypted_private_id_ed25519.age", "id_ed25519.pub"]
    assert stat.S_IMODE(MODIFIER.stat().st_mode) == 0o755
    assert not any(path.name in {"age.txt", "identity.txt"} for path in snapshot.paths)

    secret_pattern = re.compile(
        "AGE-" + "SECRET-KEY-" + "|-----BEGIN (?:OPENSSH |RSA |EC )?" + "PRIVATE KEY-----"
    )
    secret_owners = []
    for path in snapshot.paths:
        text = snapshot.text(path)
        if text is not None and secret_pattern.search(text):
            secret_owners.append(path)
    assert not secret_owners, secret_owners

    zshrc = snapshot.required_text(HOME_SOURCE / "dot_zshrc")
    assert zshrc.count("${_dotfiles_zsh_current:A}") == 1
    assert "$DOTFILES_ZSH_GENERATION/pre.zsh" in zshrc
    assert "$DOTFILES_ZSH_GENERATION/post.zsh" in zshrc
    pi_script = snapshot.required_text(
        SCRIPTS / "run_onchange_after_40-install-pi-extensions.sh.tmpl"
    )
    assert "pi list >/dev/null" in pi_script
    assert "Failed to load extension" not in pi_script
    browser_script = snapshot.required_text(
        SCRIPTS / "run_onchange_after_42-install-pi-browser.sh.tmpl"
    )
    assert 'include "dot_pi/private_agent/extensions/browser/package.json"' in browser_script
    assert 'include "dot_pi/private_agent/extensions/browser/package-lock.json"' in browser_script
    assert "npm ci --ignore-scripts --no-audit --no-fund" in browser_script
    assert "./node_modules/.bin/playwright-core install chromium" in browser_script
    assert "npx playwright" not in browser_script

    run("/bin/zsh", "-n", "home/dot_zshrc", env=env)
    empty_tree = run("git", "hash-object", "-t", "tree", "/dev/null", env=env).stdout.strip()
    assert re.fullmatch(r"[0-9a-f]+", empty_tree)
    run("git", "diff", "--check", empty_tree, "HEAD", "--", env=env)


def main() -> int:
    required = ("chezmoi", "git")
    missing = [command for command in required if shutil.which(command) is None]
    if missing:
        raise SystemExit(f"missing required local command(s): {', '.join(missing)}")

    snapshot = TrackedSnapshot()
    validate_ignored_identity_fixture(snapshot)
    validate_declarations(snapshot)
    with tempfile.TemporaryDirectory(prefix="dotfiles-check-") as temporary:
        sandbox = Path(temporary)
        fake_home = sandbox / "home"
        fake_home.mkdir()
        env = {**os.environ, "HOME": str(fake_home)}
        validate_render_and_apply(snapshot, sandbox, env)
        validate_repository_contracts(snapshot, env)
    snapshot.assert_all_text_read_once()
    print("dotfiles checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
