#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# ///
"""Digest Cursor agent sessions active in a time window, for skill-retro.

Reads ~/.cursor/projects/<project>/agent-transcripts/<id>/<id>.jsonl and its
subagents/<sub-id>.jsonl. Transcripts carry no per-line timestamps and no tool
results: a session's end is the file's mtime, its start is the first
<timestamp> tag in a user message (falling back to the file's birth time), and
only tool calls are digested, never their output.

Writes one Markdown digest per session to <out>/cursor/<id>.md and an index to
<out>/cursor/index.md, and prints the index.

Usage:
  uv run scripts/cursor_sessions.py --out DIR [--since 7d] [--until now]
--since/--until take "<n>d", "<n>h", an ISO date, or an ISO datetime.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

PROJECTS = Path.home() / ".cursor" / "projects"
SKILLS = Path.home() / ".agents" / "skills"
SKILL_PATH = re.compile(
    r"(?:~|" + re.escape(str(Path.home())) + r")/\.agents/skills/([\w.-]+)(?:/references/([\w.-]+))?"
)
TIMESTAMP = re.compile(r"<timestamp>(.*?)\s*\(UTC([+-]\d+)(?::(\d+))?\)</timestamp>")
ATTACHED = re.compile(r"Skill Name: (.+)\nPath: (.+)")
USER_LIMIT, AGENT_LIMIT, CMD_LIMIT = 4000, 400, 200


def parse_time(value: str) -> datetime:
    now = datetime.now().astimezone()
    if value == "now":
        return now
    if m := re.fullmatch(r"(\d+)([dh])", value):
        n = int(m[1])
        return now - (timedelta(days=n) if m[2] == "d" else timedelta(hours=n))
    t = datetime.fromisoformat(value)
    return t if t.tzinfo else t.astimezone()


def clip(text: str, limit: int) -> str:
    text = text.strip()
    return text if len(text) <= limit else text[:limit] + f" …[+{len(text) - limit} chars]"


def skill_refs(text: str, into: set[str]) -> None:
    """Collect the user-level skills and sub-skills whose files the text names.

    Names absent from the current skill set stay, marked, because history
    predates renames and merges into routers.
    """
    for m in SKILL_PATH.finditer(text):
        if not (SKILLS / m[1]).is_dir():
            into.add(f"{m[1]} (not installed)")
        elif m[2] and (SKILLS / m[1] / "references" / m[2]).is_dir():
            into.add(f"{m[1]}/{m[2]}")
        else:
            into.add(m[1])


def tag_time(text: str) -> datetime | None:
    m = TIMESTAMP.search(text)
    if not m:
        return None
    sign = -1 if m[2].startswith("-") else 1
    tz = timezone(sign * timedelta(hours=abs(int(m[2])), minutes=int(m[3] or 0)))
    try:
        return datetime.strptime(m[1], "%A, %b %d, %Y, %I:%M %p").replace(tzinfo=tz)
    except ValueError:
        return None


def tool_line(name: str, args: dict) -> str:
    """One line per tool call, naming its target rather than its full input."""
    target = (
        args.get("command")
        or args.get("path")
        or args.get("target_file")
        or args.get("pattern")
        or args.get("glob_pattern")
        or args.get("query")
        or args.get("search_term")
        or args.get("url")
        or args.get("description")
        or args.get("input")
        or ""
    )
    if name == "CallDynamicTool":
        target = f"{args.get('namespace')}.{args.get('toolName')}"
    return clip(f"{name}: {target}".replace("\n", " "), CMD_LIMIT)


class Session:
    def __init__(self, path: Path, project: str, parent: str):
        self.path = path
        self.id = path.stem
        self.project = project
        self.parent = parent
        stat = path.stat()
        self.last = datetime.fromtimestamp(stat.st_mtime).astimezone()
        birth = getattr(stat, "st_birthtime", stat.st_mtime)
        self.first = datetime.fromtimestamp(birth).astimezone()
        self.dated = False
        self.entries: list[str] = []
        self.skills: set[str] = set()
        self.user_messages = 0
        self.interrupts = 0

    def interrupt(self, line: str) -> None:
        self.interrupts += 1
        self.entries.append(f"- ⚠ {line}")


def load(path: Path, project: str, parent: str) -> Session:
    s = Session(path, project, parent)
    with path.open() as f:
        for raw in f:
            try:
                o = json.loads(raw)
            except json.JSONDecodeError:
                continue
            if o.get("type") == "turn_ended" and o.get("status") != "success":
                s.interrupt(f"turn {o.get('status')}: {clip(o.get('error', ''), 300)}")
            elif o.get("type") == "error":
                s.interrupt(f"error: {clip(o.get('error', ''), 300)}")
            role = o.get("role")
            for block in (o.get("message") or {}).get("content", []):
                if role == "user" and block.get("type") == "text":
                    user(s, block["text"])
                elif role == "assistant" and block.get("type") == "text":
                    text = block["text"].replace("[REDACTED]", "").strip()
                    if text:
                        s.entries.append(f"- agent: {clip(text, AGENT_LIMIT)}")
                elif role == "assistant" and block.get("type") == "tool_use":
                    args = block.get("input")
                    args = args if isinstance(args, dict) else {"input": str(args or "")}
                    skill_refs(json.dumps(args), s.skills)
                    s.entries.append(f"- {tool_line(block.get('name', '?'), args)}")
    return s


def user(s: Session, text: str) -> None:
    if not s.dated and (t := tag_time(text)):
        s.first, s.dated = t, True
    for name, path in ATTACHED.findall(text):
        s.entries.append(f"- skill attached: `{name.strip()}` ({path.strip()})")
        skill_refs(path, s.skills)
    query = re.search(r"<user_query>(.*?)</user_query>", text, re.S)
    body = query[1] if query else text
    skill_refs(body, s.skills)
    when = tag_time(text)
    quoted = clip(body, USER_LIMIT).replace("\n", "\n> ")
    speaker = "Parent prompt" if s.parent else "User"
    s.user_messages += not s.parent
    s.entries.append(f"\n**{speaker}** {when.strftime('%m-%d %H:%M') if when else ''}\n> {quoted}\n")


def fmt(t: datetime | None) -> str:
    return t.strftime("%Y-%m-%d %H:%M") if t else "?"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--since", default="7d", type=parse_time)
    ap.add_argument("--until", default="now", type=parse_time)
    args = ap.parse_args()
    since, until = args.since, args.until

    # A subagent is stored under its parent's subagents/ and often again as a
    # top-level transcript; keep the newest copy and the parent link.
    latest: dict[str, Path] = {}
    parents: dict[str, str] = {}

    def keep(path: Path) -> None:
        if path.stem not in latest or path.stat().st_mtime > latest[path.stem].stat().st_mtime:
            latest[path.stem] = path

    for path in PROJECTS.glob("*/agent-transcripts/*/*.jsonl"):
        keep(path)
        for sub in path.parent.glob("subagents/*.jsonl"):
            parents[sub.stem] = path.stem
            keep(sub)

    sessions = []
    for sid, path in latest.items():
        if datetime.fromtimestamp(path.stat().st_mtime).astimezone() < since:
            continue
        project = path.parents[3 if path.parent.name == "subagents" else 2].name
        s = load(path, project, parents.get(sid, ""))
        if s.first <= until:
            sessions.append(s)
    sessions.sort(key=lambda s: s.first)

    out = args.out / "cursor"
    out.mkdir(parents=True, exist_ok=True)
    rows = []
    for s in sessions:
        digest = out / f"{s.id}.md"
        kind = f"subagent of {s.parent}" if s.parent else "root"
        digest.write_text(
            f"# Cursor session {s.id}\n\n"
            f"- source: {s.path}\n- project: {s.project}\n- kind: {kind}\n"
            f"- active: {fmt(s.first)} – {fmt(s.last)}\n"
            f"- user-level skills referenced: {', '.join(sorted(s.skills)) or 'none'}\n\n"
            + "\n".join(s.entries)
            + "\n"
        )
        first_user = next((e for e in s.entries if e.startswith("\n**")), "")
        first_user = clip(first_user.split("\n> ", 1)[-1].replace("\n", " "), 120) if first_user else ""
        rows.append(
            f"| {digest} | {'sub' if s.parent else 'root'} | {s.project} | {fmt(s.first)} | {fmt(s.last)} "
            f"| {s.user_messages} | {s.interrupts} | {', '.join(sorted(s.skills))} | {first_user.replace('|', '/')} |"
        )
    index = (
        f"# Cursor sessions {fmt(since)} – {fmt(until)}: {len(sessions)}\n\n"
        "| digest | kind | project | start | end | user msgs | interrupts | skills | first user message |\n"
        "|---|---|---|---|---|---|---|---|---|\n" + "\n".join(rows) + "\n"
    )
    (out / "index.md").write_text(index)
    sys.stdout.write(index)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
