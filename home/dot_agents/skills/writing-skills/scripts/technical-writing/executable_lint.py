#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# ///
"""Flag defensive and AI-sounding phrasing in Chinese and English prose.

Usage:
  uv run lint.py FILE...      lint files
  uv run lint.py < text       lint stdin

Prints one line per hit as path:line: rule: matched text. Fenced code blocks
and inline code spans are skipped. Exit codes: 0 no hits, 1 hits, 2 error.
A hit is a signal to reread the sentence, not a verdict.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

I = re.IGNORECASE

RULES: list[tuple[str, re.Pattern[str], str]] = [
    (
        "non-conclusion",
        re.compile(r"(不能|无法|不应|不宜)(据此|直接|简单地?|全部)?(当作|当成|视为|归为|归给|归因|说明|证明|宣称|描述为|得出|推断|认定)"),
        "state what the result is",
    ),
    (
        "non-conclusion",
        re.compile(r"(不能|无法|不应|不)(把|将)[^。！？\n]{1,30}?(当作|当成|当|视为|归为|归给|描述为)|[，,]不是[^，,。；\n]{1,25}[。；]"),
        "state what the result is",
    ),
    (
        "non-conclusion",
        re.compile(r"(没有|未|尚未|并未)(证明|证实|证据表明|进行)"),
        "state what was measured and found",
    ),
    (
        "untouched-list",
        re.compile(r"(未|没有|并未)(修改|删除|改动|变更|触碰)(任何|这些|其他|其它|既有|已有)"),
        "report what changed",
    ),
    (
        "not-x-but-y",
        re.compile(r"不是[^。！？；\n]{1,30}?[，,]?\s*而是|与其[^。！？\n]{1,30}不如"),
        "state the claim directly",
    ),
    (
        "signpost",
        re.compile(r"值得(注意|一提|关注)的是|需要(注意|指出|强调)的是|不难(发现|看出)|显而易见|综上所述|总而言之|总的来说|简而言之"),
        "start with the point",
    ),
    (
        "inflation",
        re.compile(r"至关重要|举足轻重|里程碑|深远(的)?影响|赋能|抓手|闭环|全方位|一站式|无缝|痛点|底层逻辑"),
        "use the plain fact",
    ),
    (
        "chat-residue",
        re.compile(r"希望(这|以上|本文)?(对你|能)有(所)?帮助|如上所述|如前所述|前面提到|上一轮|之前(讨论|提到|说过)|我们的对话|(根据|按照)你的要求"),
        "write for a reader without the conversation",
    ),
    (
        "vague-verb",
        re.compile(r"(进行|做出|加以|予以)了?(优化|调整|处理|分析|修改|操作|配置|改进|完善)"),
        "use the specific verb",
    ),
    (
        "hedge",
        re.compile(r"(在)?(一定|某种)程度上|视情况而定|在某些情况下|可能会?存在"),
        "qualify with a precise word, once",
    ),
    (
        "self-praise",
        re.compile(r"(确保|保证|提升)了?[^。\n]{0,8}(正确性|健壮性|稳定性|可靠性|鲁棒性)"),
        "state the behavior",
    ),
    (
        "en-hedge",
        re.compile(r"\b(it'?s worth (noting|mentioning)|it is (important|worth) (to note|noting)|note that|please note|keep in mind)\b", I),
        "start with the point",
    ),
    (
        "en-not-x-but-y",
        re.compile(r"\bnot (just|only|merely|simply)\b[^.\n]{1,60}\bbut\b|\bisn'?t (just |only )?[^.\n]{1,40}[;,—]\s*it'?s\b", I),
        "state the claim directly",
    ),
    (
        "en-inflation",
        re.compile(r"\b(robust(ly|ness)?|seamless(ly)?|comprehensive|cutting-edge|pivotal|crucial|leverag(e|es|ed|ing)|delve|empower(s|ing)?|holistic|streamline[sd]?|game-?changer)\b", I),
        "use the plain fact",
    ),
    (
        "en-chat-residue",
        re.compile(r"\b(as (mentioned|discussed|noted) (above|earlier|before|previously)|I hope this helps|let me know if|great question|as you requested)\b", I),
        "write for a reader without the conversation",
    ),
    (
        "en-self-praise",
        re.compile(r"\bensur(e|es|ing) (correctness|robustness|reliability|that everything)\b", I),
        "state the behavior",
    ),
    (
        "en-filler",
        re.compile(r"\b(in order to|due to the fact that|at this point in time|basically|essentially)\b", I),
        "cut it",
    ),
    (
        "restating-comment",
        re.compile(r"^\s*(//|#|\*)\s*(this|the following) (function|method|code|line|block|loop)\b", I),
        "comment on what the code cannot show",
    ),
    (
        "bold-density",
        re.compile(r"(?:\*\*[^*\n]+\*\*[^*\n]*){3,}"),
        "bold at most one thing",
    ),
]

FENCE = re.compile(r"^\s*(```|~~~)")
INLINE_CODE = re.compile(r"`[^`\n]*`")


def lint(name: str, text: str) -> int:
    hits = 0
    in_fence = False
    for lineno, line in enumerate(text.splitlines(), 1):
        if FENCE.match(line):
            in_fence = not in_fence
            continue
        if in_fence:
            continue
        prose = INLINE_CODE.sub(lambda m: " " * len(m.group()), line)
        for rule, pattern, hint in RULES:
            for m in pattern.finditer(prose):
                print(f"{name}:{lineno}: {rule}: {m.group().strip()[:60]} ({hint})")
                hits += 1
    return hits


def main() -> int:
    paths = sys.argv[1:]
    if any(p in ("-h", "--help") for p in paths):
        print(__doc__.strip())
        return 0
    try:
        sources = [(p, Path(p).read_text()) for p in paths] or [("<stdin>", sys.stdin.read())]
    except OSError as e:
        print(f"error: {e}", file=sys.stderr)
        return 2
    return 1 if sum(lint(name, text) for name, text in sources) else 0


if __name__ == "__main__":
    sys.exit(main())
