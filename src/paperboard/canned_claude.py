"""TEST ONLY: a ClaudeClient that answers from a JSON file and never touches the network.

`paperboard serve` uses it only when PAPERBOARD_FAKE_CLAUDE names such a file (the e2e suite does);
unset, this module is never used. The file is
{"read_paper": <the pass's answer>, "define": [<text deltas>], "ask": [<text deltas>]}.
It lives in src, not tests/, because the installed `paperboard` command cannot import tests/fake_claude.py.
"""

import json
from collections.abc import Iterator
from pathlib import Path

from paperboard.ai_client import ReadResult


class CannedClaude:
    route = "canned"

    def __init__(self, answer_file: Path):
        answer = json.loads(answer_file.read_text(encoding="utf-8"))
        self.paper: dict = answer.get("read_paper", {"terms": [], "where_to_look": []})
        self.deltas: list[str] = answer.get("define", [])
        self.ask_deltas: list[str] = answer.get("ask", [])

    def read_paper(self, system: str, prompt: str, schema: dict) -> ReadResult:
        return ReadResult(self.paper, json.dumps(self.paper))

    def define(self, system: str, prompt: str, schema: dict) -> Iterator[str]:
        yield from self.deltas

    def ask(self, system: str, prompt: str, schema: dict) -> Iterator[str]:
        yield from self.ask_deltas
