"""TEST ONLY: a ClaudeClient that answers from a JSON file and never touches the network.

`paperboard serve` uses it only when PAPERBOARD_FAKE_CLAUDE names such a file (the e2e suite does);
unset, this module is never used. The file is {"read_paper": <the pass's answer>, "define": [<text deltas>]}.
It lives in src, not tests/, because the installed `paperboard` command cannot import tests/fake_claude.py.
"""

import json
from collections.abc import Iterator
from pathlib import Path


class CannedClaude:
    route = "canned"

    def __init__(self, answer_file: Path):
        answer = json.loads(answer_file.read_text(encoding="utf-8"))
        self.paper: dict = answer.get("read_paper", {"terms": [], "where_to_look": []})
        self.deltas: list[str] = answer.get("define", [])
        self.last_raw: str | None = None

    def read_paper(self, system: str, prompt: str, schema: dict) -> dict:
        self.last_raw = json.dumps(self.paper)
        return self.paper

    def define(self, system: str, prompt: str, schema: dict) -> Iterator[str]:
        yield from self.deltas
