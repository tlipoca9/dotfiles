#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# ///
"""Sync vendored sub-skills listed in sources.json into this router skill.

Hand-written: SKILL.md, sources.json, this script, local sub-skills.
Generated (overwritten on every sync): references/<sub-skill>/,
scripts/<sub-skill>/, assets/<sub-skill>/, upstream.lock.json.

A sub-skill's SKILL.md becomes references/<name>/INSTRUCTIONS.md, other .md
files keep their place under references/<name>/, its assets/ go to
assets/<name>/, and every other file goes to scripts/<name>/. Paths in the
docs are rewritten to the new locations.

sources.json lists upstream repos and the skill folders to vendor from each:
  {"sources": [{"repo": "https://github.com/<owner>/<repo>.git",
                "ref": "HEAD", "skills": ["path/to/skill-folder"]}]}
In place of "skills", "manifest": "<path>.json" reads the folder list from
that upstream file's "skills" array (e.g. .claude-plugin/plugin.json).
Each sub-skill keeps its upstream folder name, or becomes
<owner>-<repo>-<folder> when the source sets "prefix": true. Names must be
unique.

A top-level "local": ["<name>"] lists hand-written sub-skills with no
upstream; sync keeps their references/, scripts/ and assets/ folders as they
are. "sources" may be empty when every sub-skill is local.

Usage (from anywhere):
  uv run scripts/update.py           sync every source to its ref
  uv run scripts/update.py --check   exit 1 if any source moved past the lock
  uv run scripts/update.py --lint    only check SKILL.md against the lock

Exit codes: 0 ok, 1 upstream ahead (--check), 2 SKILL.md routing out of sync,
3 error.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SKILL_MD = ROOT / "SKILL.md"
SOURCES = ROOT / "sources.json"
LOCK = ROOT / "upstream.lock.json"
ENTRY = "INSTRUCTIONS.md"
SKIP_DIRS = {"agents"}
OUTPUT_DIRS = ("references", "scripts", "assets")
LICENSE_NAMES = ("LICENSE", "LICENSE.md", "LICENSE.txt", "COPYING")


class UpdateError(Exception):
    pass


def git(*args: str, cwd: Path | None = None) -> str:
    return subprocess.run(
        ["git", *args], cwd=cwd, check=True, capture_output=True, text=True
    ).stdout.strip()


def read_json(path: Path) -> dict:
    return json.loads(path.read_text()) if path.exists() else {}


def local_names() -> list[str]:
    return read_json(SOURCES).get("local", [])


def locked_names() -> list[str]:
    return [s["name"] for src in read_json(LOCK).get("sources", []) for s in src["skills"]]


def sub_skill_name(source: dict, folder: str) -> str:
    if not source.get("prefix"):
        return Path(folder).name
    m = re.search(r"[:/]([^/:]+)/([^/]+?)(?:\.git)?/?$", source["repo"])
    if not m:
        raise UpdateError(f"cannot parse owner/repo from {source['repo']!r}")
    raw = f"{m.group(1)}-{m.group(2)}-{Path(folder).name}".lower()
    return re.sub(r"-{2,}", "-", re.sub(r"[^a-z0-9-]", "-", raw)).strip("-")


def frontmatter(text: str) -> dict[str, str]:
    m = re.match(r"^---\n(.*?)\n---\n", text, re.S)
    fields: dict[str, str] = {}
    for line in (m.group(1) if m else "").splitlines():
        key, sep, value = line.partition(":")
        if sep and not line.startswith((" ", "\t")):
            fields[key.strip()] = value.strip().strip("\"'")
    return fields


def lint(names: list[str]) -> list[str]:
    if not SKILL_MD.is_file():
        return ["SKILL.md not found"]
    text = SKILL_MD.read_text()
    problems = []
    fm = frontmatter(text)
    if fm.get("name") != ROOT.name:
        problems.append(f"frontmatter name {fm.get('name')!r} != folder {ROOT.name!r}")
    if not 0 < len(fm.get("description", "")) <= 1024:
        problems.append("frontmatter description must be 1-1024 characters")
    if (n := text.count("\n")) > 500:
        problems.append(f"SKILL.md has {n} lines; keep it under 500")
    routed = set(re.findall(r"references/([a-z0-9-]+)/" + re.escape(ENTRY), text))
    for name in sorted(set(names) - routed):
        problems.append(f"missing route: references/{name}/{ENTRY}")
    for name in sorted(routed - set(names)):
        problems.append(f"stale route: references/{name}/{ENTRY}")
    return problems


def report(names: list[str]) -> int:
    problems = lint(names)
    for p in problems:
        print(f"SKILL.md: {p}", file=sys.stderr)
    return 2 if problems else 0


def fetch(repo: str, ref: str, dest: Path) -> str:
    git("init", "-q", str(dest))
    git("remote", "add", "origin", repo, cwd=dest)
    git("fetch", "-q", "--depth", "1", "origin", ref, cwd=dest)
    git("checkout", "-q", "FETCH_HEAD", cwd=dest)
    return git("rev-parse", "HEAD", cwd=dest)


def rewrite(text: str, old: str, new: str, *, rooted: bool) -> str:
    """Replace path token old with new; rooted tokens follow a <skill-dir> prefix."""
    if rooted:
        for sep in ("/", "\\"):
            text = text.replace(
                f"<skill-dir>{sep}{old.replace('/', sep)}",
                f"<skill-dir>{sep}{new.replace('/', sep)}",
            )
        return text
    return re.sub(r"(?<![\w/.<>-])(\./)?" + re.escape(old) + r"(?![\w/-])", new, text)


def vendor_skill(src: Path, name: str, repo_root: Path, stage: Path) -> None:
    ref_dir = stage / "references" / name
    script_dir = stage / "scripts" / name
    asset_dir = stage / "assets" / name
    docs: list[tuple[Path, Path]] = []
    moved: dict[Path, Path] = {}

    for path in sorted(p for p in src.rglob("*") if p.is_file()):
        rel = path.relative_to(src)
        if rel.parts[0] in SKIP_DIRS or path.name == ".DS_Store":
            continue
        if path.suffix == ".md":
            dest = ref_dir / (ENTRY if rel == Path("SKILL.md") else rel)
            docs.append((path, dest))
        elif rel.parts[0] == "assets":
            dest = asset_dir.joinpath(*rel.parts[1:])
            moved[path] = dest
        else:
            parts = rel.parts[1:] if rel.parts[0] == "scripts" else rel.parts
            dest = script_dir.joinpath(*parts)
            moved[path] = dest
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, dest)

    for candidate in LICENSE_NAMES:
        for where in (src, repo_root):
            if (where / candidate).is_file() and not (ref_dir / "LICENSE").exists():
                shutil.copy2(where / candidate, ref_dir / "LICENSE")

    for orig, dest in docs:
        text = dest.read_text()
        old_entry = os.path.relpath(src / "SKILL.md", orig.parent)
        new_entry = os.path.relpath(ref_dir / ENTRY, dest.parent)
        text = re.sub(
            r"\[(`?)SKILL\.md\1\]\((\./)?" + re.escape(old_entry) + r"\)",
            rf"[\1{ENTRY}\1]({new_entry})",
            text,
        )
        text = re.sub(
            r"\]\((\./)?" + re.escape(old_entry) + r"\)", f"]({new_entry})", text
        )
        for old, new in moved.items():
            text = rewrite(
                text,
                old.relative_to(src).as_posix(),
                new.relative_to(stage).as_posix(),
                rooted=True,
            )
            text = rewrite(
                text,
                Path(os.path.relpath(old, orig.parent)).as_posix(),
                Path(os.path.relpath(new, dest.parent)).as_posix(),
                rooted=False,
            )
            if orig.parent != src:
                text = rewrite(
                    text,
                    old.relative_to(src).as_posix(),
                    "<skill-dir>/" + new.relative_to(stage).as_posix(),
                    rooted=False,
                )
        dest.write_text(text)


def sync() -> int:
    config = read_json(SOURCES).get("sources", [])
    local = local_names()
    if not config and not local:
        raise UpdateError(f"no sources or local sub-skills in {SOURCES.name}")
    for name in local:
        if not (ROOT / "references" / name / ENTRY).is_file():
            raise UpdateError(f"local sub-skill references/{name}/{ENTRY} not found")
    old_names = set(locked_names())
    old_commits = {s["repo"]: s["commit"] for s in read_json(LOCK).get("sources", [])}
    lock_sources, info = [], {}

    with tempfile.TemporaryDirectory() as tmp:
        stage = Path(tmp) / "stage"
        stage.mkdir()
        for i, source in enumerate(config):
            repo, ref = source["repo"], source.get("ref", "HEAD")
            clone = Path(tmp) / f"clone-{i}"
            commit = fetch(repo, ref, clone)
            if "manifest" in source:
                manifest = json.loads((clone / source["manifest"]).read_text())
                folders = [str(Path(p)) for p in manifest["skills"]]
            else:
                folders = source["skills"]
            skills = []
            for folder in folders:
                src = clone / folder
                if not (src / "SKILL.md").is_file():
                    raise UpdateError(f"{repo}: {folder} has no SKILL.md")
                name = sub_skill_name(source, folder)
                if name in info or name in local:
                    raise UpdateError(f"duplicate sub-skill name {name}")
                vendor_skill(src, name, clone, stage)
                fm = frontmatter((src / "SKILL.md").read_text())
                kind = (
                    "user-invoked"
                    if fm.get("disable-model-invocation") == "true"
                    else "model-invoked"
                )
                info[name] = f"[{kind}] {fm.get('description', '')}"
                skills.append({"path": folder, "name": name})
            lock_sources.append({
                "repo": repo,
                "ref": ref,
                "commit": commit,
                "committed_at": git("log", "-1", "--format=%cI", cwd=clone),
                "skills": skills,
            })
            print(f"{repo} {old_commits.get(repo, 'none')[:7]} -> {commit[:7]}")
        (stage / "upstream.lock.json").write_text(
            json.dumps({"sources": lock_sources}, indent=2) + "\n"
        )
        for name in local:
            for kind in OUTPUT_DIRS:
                if (ROOT / kind / name).is_dir():
                    shutil.copytree(ROOT / kind / name, stage / kind / name)

        for kind in OUTPUT_DIRS:
            out = ROOT / kind
            if out.is_dir():
                for child in out.iterdir():
                    if child.is_dir():
                        shutil.rmtree(child)
                if not any(out.iterdir()):
                    out.rmdir()
        for child in stage.iterdir():
            dest = ROOT / child.name
            if child.is_dir() and dest.exists():
                for sub in child.iterdir():
                    shutil.move(str(sub), dest / sub.name)
            else:
                if dest.exists():
                    dest.unlink()
                shutil.move(str(child), dest)

    for name in sorted(set(info) - old_names):
        print(f"  added {name}: {info[name]}")
    for name in sorted(old_names - set(info)):
        print(f"  removed {name}")
    return report([*info, *local])


def check() -> int:
    locked = {s["repo"]: s for s in read_json(LOCK).get("sources", [])}
    behind = 0
    for source in read_json(SOURCES).get("sources", []):
        repo, ref = source["repo"], source.get("ref", "HEAD")
        out = git("ls-remote", repo, ref).split()
        if not out:
            raise UpdateError(f"ref {ref!r} not found on {repo}")
        have = locked.get(repo, {}).get("commit", "none")
        if out[0] == have and locked[repo]["ref"] == ref:
            print(f"{repo}: up to date at {have[:7]}")
        else:
            print(f"{repo}: {ref} is at {out[0][:7]}; lock is {have[:7]}")
            behind = 1
    return behind


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--check", action="store_true")
    mode.add_argument("--lint", action="store_true")
    args = parser.parse_args()
    try:
        if args.check:
            return check()
        if args.lint:
            return report([*locked_names(), *local_names()])
        return sync()
    except subprocess.CalledProcessError as e:
        print(f"error: git {' '.join(e.cmd[1:])}: {e.stderr.strip()}", file=sys.stderr)
        return 3
    except (UpdateError, KeyError, json.JSONDecodeError) as e:
        print(f"error: {e}", file=sys.stderr)
        return 3


if __name__ == "__main__":
    sys.exit(main())
