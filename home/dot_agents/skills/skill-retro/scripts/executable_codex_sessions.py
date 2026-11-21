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
PASEO_SYSTEM_RE = re.compile(r"^\s*<paseo-system\b([^>]*)>(.*)</paseo-system>\s*$", re.S)
PASEO_KIND_RE = re.compile(r'\bkind="([^"]+)"')
HISTORY_TAG_RE = re.compile(r"<(/?)chat-history-summary>")
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


def split_history(text: str) -> tuple[int, str]:
    """Strip leading <chat-history-summary> blocks (including nested ones).

    Returns (omitted_chars, current_text).
    """
    omitted = 0
    rest = text.lstrip()
    while rest.startswith("<chat-history-summary>"):
        depth = 0
        end_pos = -1
        for m in HISTORY_TAG_RE.finditer(rest):
            if m.group(1) == "":
                depth += 1
            else:
                depth -= 1
                if depth == 0:
                    end_pos = m.end()
                    break
        if end_pos == -1:
            last_close = rest.rfind("</chat-history-summary>")
            if last_close == -1:
                break
            end_pos = last_close + len("</chat-history-summary>")
        omitted += end_pos
        rest = rest[end_pos:].lstrip()
    return omitted, rest


def unwrap_paseo(text: str) -> tuple[str | None, str]:
    """Unwrap an outer <paseo-system kind="..."> wrapper, returning (kind, body)."""
    m = PASEO_SYSTEM_RE.match(text)
    if not m:
        return None, text
    km = PASEO_KIND_RE.search(m.group(1))
    return (km.group(1) if km else "unknown"), m.group(2).strip()


def normalized_stem(path: Path) -> str:
    name = path.name
    if name.endswith(".zst"):
        name = name[:-4]
    if name.endswith(".jsonl"):
        name = name[:-6]
    return name


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
        self.sources: list[Path] = [path]
        self.id = path.name
        self.cwd = ""
        self.parent = ""
        self.agent_path = ""
        self.forked_from = ""
        self.forked_ordinal: int | None = None
        self.first: datetime | None = None
        self.last: datetime | None = None
        self.entries: list[str] = []
        self.skills: set[str] = set()
        self.user_messages = 0
        self.interrupts = 0
        self.failures = 0
        self.first_user = ""
        self.first_fallback = ""

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
            hb = p.get("history_base") if isinstance(p.get("history_base"), dict) else {}
            s.forked_from = p.get("forked_from_id") or hb.get("thread_id") or ""
            ordinal = p.get("forked_from_ordinal_exclusive")
            if ordinal is None:
                ordinal = hb.get("end_ordinal_exclusive")
            s.forked_ordinal = ordinal
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
        raw_text = "\n".join(c.get("text", "") for c in it.get("content", []) if c.get("type") == "text")
        paseo_kind, body = unwrap_paseo(raw_text)
        omitted, current = split_history(body)
        if paseo_kind is not None and paseo_kind != "user-message":
            speaker = f"Paseo {paseo_kind}"
            is_human = False
        else:
            speaker = "Parent prompt" if s.parent else "User"
            is_human = not s.parent
        # Only extract skill references from the current turn, never from omitted history fragments.
        if is_human or s.parent:
            skill_refs(current, s.skills)
        when = datetime.fromisoformat(ts).astimezone().strftime("%m-%d %H:%M") if ts else ""
        parts = []
        if omitted:
            parts.append(f"[inherited history: {omitted} chars omitted]")
        if current:
            parts.append(clip(current, USER_LIMIT))
        quoted = ("\n".join(parts) or "(empty)").replace("\n", "\n> ")
        if is_human:
            s.user_messages += 1
            if not s.first_user and current:
                s.first_user = clip(current.replace("\n", " "), 120)
        elif not s.first_fallback and current:
            prefix = f"[{speaker}] " if paseo_kind else ""
            s.first_fallback = clip((prefix + current).replace("\n", " "), 120)
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


def merge_segments(segments: list[Session]) -> Session:
    """Merge complementary rollout files that share a session ID, deduplicating archive copies."""
    by_stem: dict[str, Session] = {}
    for seg in segments:
        stem = normalized_stem(seg.path)
        prev = by_stem.get(stem)
        if prev is None or (seg.last or datetime.min.astimezone(), len(seg.entries)) > (
            prev.last or datetime.min.astimezone(),
            len(prev.entries),
        ):
            by_stem[stem] = seg
    ordered = sorted(by_stem.values(), key=lambda s: (s.first or datetime.min.astimezone(), s.path.name))
    if len(ordered) == 1:
        return ordered[0]
    merged = Session(ordered[0].path)
    merged.sources = [seg.path for seg in ordered]
    merged.id = ordered[0].id
    for i, seg in enumerate(ordered):
        merged.cwd = merged.cwd or seg.cwd
        merged.parent = merged.parent or seg.parent
        merged.agent_path = merged.agent_path or seg.agent_path
        merged.forked_from = merged.forked_from or seg.forked_from
        if merged.forked_ordinal is None:
            merged.forked_ordinal = seg.forked_ordinal
        if seg.first:
            merged.first = min(merged.first or seg.first, seg.first)
        if seg.last:
            merged.last = max(merged.last or seg.last, seg.last)
        merged.skills |= seg.skills
        merged.user_messages += seg.user_messages
        merged.interrupts += seg.interrupts
        merged.failures += seg.failures
        merged.first_user = merged.first_user or seg.first_user
        merged.first_fallback = merged.first_fallback or seg.first_fallback
        if i > 0:
            merged.entries.append(f"\n- [segment: {seg.path.name}]")
        merged.entries.extend(seg.entries)
    return merged


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
    # Archiving can leave one session in both sessions/ and archived_sessions/,
    # and resumed sessions can split across multiple files with the same ID.
    grouped: dict[str, list[Session]] = {}
    for path in paths:
        if datetime.fromtimestamp(path.stat().st_mtime).astimezone() < since:
            continue
        s = load(path)
        if not (s.last and s.first and s.last >= since and s.first <= until):
            continue
        grouped.setdefault(s.id, []).append(s)
    sessions = sorted((merge_segments(segs) for segs in grouped.values()), key=lambda s: s.first)

    out = args.out / "codex"
    out.mkdir(parents=True, exist_ok=True)
    rows = []
    for s in sessions:
        digest = out / f"{s.id}.md"
        kind = f"subagent {s.agent_path} of {s.parent}" if s.parent else "root"
        header = [f"# Codex session {s.id}", ""]
        if len(s.sources) == 1:
            header.append(f"- source: {s.sources[0]}")
        else:
            header.append(f"- sources ({len(s.sources)}): {', '.join(str(p) for p in s.sources)}")
        header.append(f"- cwd: {s.cwd}")
        header.append(f"- kind: {kind}")
        if s.forked_from:
            ord_suffix = f" (ordinal {s.forked_ordinal})" if s.forked_ordinal is not None else ""
            header.append(f"- forked from: {s.forked_from}{ord_suffix}")
        header.append(f"- active: {fmt(s.first)} – {fmt(s.last)}")
        header.append(f"- user-level skills referenced: {', '.join(sorted(s.skills)) or 'none'}")
        digest.write_text("\n".join(header) + "\n\n" + "\n".join(s.entries) + "\n")
        first_user = s.first_user or s.first_fallback
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
