"""A ClaudeClient that never touches the network: every test uses this."""

import json
from collections.abc import Iterator

from paperboard.ai_client import AiError, ReadResult


class FakeClaude:
    def __init__(self, paper: dict | None = None, deltas: list[str] | None = None, error: AiError | None = None,
                 route: str = "api", ask_deltas: list[str] | None = None):
        self.paper = paper or {"terms": [], "where_to_look": []}
        self.deltas = deltas or []
        self.ask_deltas = ask_deltas or []
        self.error = error
        self.route = route
        self.calls: list[tuple[str, str]] = []

    def read_paper(self, system: str, prompt: str, schema: dict) -> ReadResult:
        self.calls.append(("read_paper", prompt))
        if self.error:
            raise self.error
        return ReadResult(self.paper, json.dumps(self.paper))

    def define(self, system: str, prompt: str, schema: dict) -> Iterator[str]:
        self.calls.append(("define", prompt))
        if self.error:
            raise self.error
        yield from self.deltas

    def ask(self, system: str, prompt: str, schema: dict) -> Iterator[str]:
        self.calls.append(("ask", prompt))
        if self.error:
            raise self.error
        yield from self.ask_deltas
