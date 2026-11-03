#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.14"
# ///
"""Digest Codex sessions active in a time window, for skill-retro.

Reads ~/.codex/sessions/**/*.jsonl and ~/.codex/archived_sessions/*.jsonl[.zst].
The event stream (event_msg/item_completed) is the source of truth for what
the user and agent did; response_item is read only for explicit <skill>
invocations, because it also carries injected AGENTS.md and developer text.

Writes one Markdown digest per session to <out>/codex/<id>.md and an index to
<out>/codex/index.md, and prints the index.

Usage:
  uv run scripts/codex_sessions.py --out DIR [--since 7d] [--until now]
--since/--until take "<n>d", "<n>h", an ISO date, or an ISO datetime.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from compression import zstd
from datetime import datetime, timedelta
from pathlib import Path

CODEX = Path.home() / ".codex"
SKILLS = Path.home() / ".agents" / "skills"
SKILL_PATH = re.compile(
    r"(?:~|" + re.escape(str(Path.home())) + r")/\.agents/skills/([\w.-]+)(?:/references/([\w.-]+))?"
)
USER_LIMIT, AGENT_LIMIT, CMD_LIMIT, OUTPUT_LIMIT = 4000, 400, 200, 400


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


def read_lines(path: Path):
    if path.suffix == ".zst":
        data = zstd.decompress(path.read_bytes()).decode()
        yield from data.splitlines()
    else:
        with path.open() as f:
            yield from f


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


class Session:
    def __init__(self, path: Path):
        self.path = path
        self.id = path.name
        self.cwd = ""
        self.parent = ""
        self.agent_path = ""
        self.first: datetime | None = None
        self.last: datetime | None = None
        self.entries: list[str] = []
        self.skills: set[str] = set()
        self.user_messages = 0
        self.interrupts = 0
        self.failures = 0

    def stamp(self, ts: str | None) -> None:
        if not ts:
            return
        t = datetime.fromisoformat(ts).astimezone()
        self.first = min(self.first or t, t)
        self.last = max(self.last or t, t)

    def interrupt(self, line: str) -> None:
        self.interrupts += 1
        self.entries.append(f"- ⚠ {line}")

    def failure(self, line: str) -> None:
        self.failures += 1
        self.entries.append(f"- ✗ {line}")


def load(path: Path) -> Session:
    s = Session(path)
    for raw in read_lines(path):
        try:
            o = json.loads(raw)
        except json.JSONDecodeError:
            continue
        s.stamp(o.get("timestamp"))
        p = o.get("payload")
        if not isinstance(p, dict):
            continue
        kind, sub = o.get("type"), p.get("type")
        if kind == "session_meta" and not s.cwd:
            s.id = p.get("id", s.id)
            s.cwd = p.get("cwd", "")
            s.parent = p.get("parent_thread_id", "")
            s.agent_path = p.get("agent_path", "")
        elif kind == "response_item" and p.get("role") == "user":
            text = "".join(c.get("text", "") for c in p.get("content", []))
            if m := re.match(r"\s*<skill>\s*<name>(.*?)</name>\s*<path>(.*?)</path>", text, re.S):
                s.entries.append(f"- skill invoked: `{m[1]}` ({m[2]})")
                skill_refs(m[2], s.skills)
        elif kind == "event_msg" and sub == "turn_aborted":
            s.interrupt("turn aborted by user")
        elif kind == "event_msg" and sub == "task_complete" and p.get("error"):
            s.interrupt(f"turn failed: {clip(p['error'].get('message', ''), OUTPUT_LIMIT)}")
        elif kind == "event_msg" and sub == "item_completed":
            item(s, p["item"], o.get("timestamp", ""))
    return s


def item(s: Session, it: dict, ts: str) -> None:
    t = it.get("type")
    if t == "UserMessage":
        text = "\n".join(c.get("text", "") for c in it.get("content", []) if c.get("type") == "text")
        skill_refs(text, s.skills)
        when = datetime.fromisoformat(ts).astimezone().strftime("%m-%d %H:%M") if ts else ""
        quoted = clip(text, USER_LIMIT).replace("\n", "\n> ")
        speaker = "Parent prompt" if s.parent else "User"
        s.user_messages += not s.parent
        s.entries.append(f"\n**{speaker}** {when}\n> {quoted}\n")
    elif t == "AgentMessage":
        text = "".join(c.get("text", "") for c in it.get("content", []))
        s.entries.append(f"- agent ({it.get('phase', '')}): {clip(text, AGENT_LIMIT)}")
    elif t == "CommandExecution":
        cmd = it.get("command") or []
        cmd = cmd[-1] if isinstance(cmd, list) and cmd else str(cmd)
        skill_refs(cmd, s.skills)
        line = f"- `$ {clip(cmd, CMD_LIMIT)}`".replace("\n", " ")
        code = it.get("exit_code")
        if code not in (0, None):
            tail = (it.get("aggregated_output") or "").strip()[-OUTPUT_LIMIT:].replace("\n", " ")
            s.failure(f"{line[2:]} → exit {code}: {tail}")
        else:
            s.entries.append(line)
    elif t == "FileChange":
        for path, change in (it.get("changes") or {}).items():
            skill_refs(path, s.skills)
            s.entries.append(f"- {change.get('type', 'change')} {path}")
    elif t == "McpToolCall":
        line = f"mcp {it.get('server')}.{it.get('tool')}"
        if (it.get("result") or {}).get("isError") or it.get("error"):
            s.failure(f"{line} failed")
        else:
            s.entries.append(f"- {line}")
    elif t == "Extension":
        s.entries.append(f"- {it.get('kind')}: {clip(str(it.get('query', '')), CMD_LIMIT)}")
    elif t == "SubAgentActivity" and it.get("kind") == "started":
        s.entries.append(f"- subagent started: {it.get('agent_path')} ({it.get('agent_thread_id')})")
    elif t == "ContextCompaction":
        s.entries.append("- context compacted")


def fmt(t: datetime | None) -> str:
    return t.strftime("%Y-%m-%d %H:%M") if t else "?"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--since", default="7d", type=parse_time)
    ap.add_argument("--until", default="now", type=parse_time)
    args = ap.parse_args()
    since, until = args.since, args.until

    paths = [
        *CODEX.glob("sessions/**/*.jsonl"),
        *CODEX.glob("archived_sessions/*.jsonl"),
        *CODEX.glob("archived_sessions/*.jsonl.zst"),
    ]
    # Archiving can leave one session in both sessions/ and archived_sessions/.
    by_id: dict[str, Session] = {}
    for path in paths:
        if datetime.fromtimestamp(path.stat().st_mtime).astimezone() < since:
            continue
        s = load(path)
        if not (s.last and s.first and s.last >= since and s.first <= until):
            continue
        if s.id not in by_id or s.last > by_id[s.id].last:
            by_id[s.id] = s
    sessions = sorted(by_id.values(), key=lambda s: s.first)

    out = args.out / "codex"
    out.mkdir(parents=True, exist_ok=True)
    rows = []
    for s in sessions:
        digest = out / f"{s.id}.md"
        kind = f"subagent {s.agent_path} of {s.parent}" if s.parent else "root"
        digest.write_text(
            f"# Codex session {s.id}\n\n"
            f"- source: {s.path}\n- cwd: {s.cwd}\n- kind: {kind}\n"
            f"- active: {fmt(s.first)} – {fmt(s.last)}\n"
            f"- user-level skills referenced: {', '.join(sorted(s.skills)) or 'none'}\n\n"
            + "\n".join(s.entries)
            + "\n"
        )
        first_user = next((e for e in s.entries if e.startswith("\n**")), "")
        first_user = clip(first_user.split("\n> ", 1)[-1].replace("\n", " "), 120) if first_user else ""
        rows.append(
            f"| {digest} | {'sub' if s.parent else 'root'} | {s.cwd} | {fmt(s.first)} | {fmt(s.last)} "
            f"| {s.user_messages} | {s.interrupts} | {s.failures} | {', '.join(sorted(s.skills))} | {first_user.replace('|', '/')} |"
        )
    index = (
        f"# Codex sessions {fmt(since)} – {fmt(until)}: {len(sessions)}\n\n"
        "| digest | kind | cwd | start | end | user msgs | interrupts | failed calls | skills | first user message |\n"
        "|---|---|---|---|---|---|---|---|---|---|\n" + "\n".join(rows) + "\n"
    )
    (out / "index.md").write_text(index)
    sys.stdout.write(index)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
