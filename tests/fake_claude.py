"""A ClaudeClient that never touches the network: every test uses this."""

import json
from collections.abc import Iterator

from paperboard.ai_client import AiError


class FakeClaude:
    def __init__(self, paper: dict | None = None, deltas: list[str] | None = None, error: AiError | None = None,
                 route: str = "api"):
        self.paper = paper or {"terms": [], "where_to_look": []}
        self.deltas = deltas or []
        self.error = error
        self.route = route
        self.calls: list[tuple[str, str]] = []
        self.last_raw: str | None = None

    def read_paper(self, system: str, prompt: str, schema: dict) -> dict:
        self.calls.append(("read_paper", prompt))
        if self.error:
            raise self.error
        self.last_raw = json.dumps(self.paper)
        return self.paper

    def define(self, system: str, prompt: str, schema: dict) -> Iterator[str]:
        self.calls.append(("define", prompt))
        if self.error:
            raise self.error
        yield from self.deltas
