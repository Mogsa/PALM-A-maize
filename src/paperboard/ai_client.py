"""The only module that talks to Claude (spec B3). Everything else takes a
`ClaudeClient`, so tests pass a fake and no test touches the network."""

import json
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Protocol

import anthropic

READER_MODEL = "claude-opus-5-5"
DEFINER_MODEL = "claude-sonnet-5"
ASK_MODEL = "claude-sonnet-5"
READER_EFFORT = "high"     # Opus 5.5's default is medium; the pass reads the whole argument
DEFINER_EFFORT = "low"     # hover speed
ASK_EFFORT = "medium"      # a question about the whole paper, answered while the reader waits
READER_MAX_TOKENS = 64000
DEFINER_MAX_TOKENS = 1024
ASK_MAX_TOKENS = 8192


class AiError(Exception):
    def __init__(self, code: str, reason: str):
        super().__init__(reason)
        self.code = code


@dataclass(frozen=True)
class ReadResult:
    """A read_paper call's answer together with the raw text it came from, for
    the AI log (spec B3). Bundled in one return value, never on the client
    instance: the client is shared and calls can run concurrently (a Define
    alongside a pass), so nothing about one call may be read off shared state
    after another call has started."""

    answer: dict
    raw: str | None


class ClaudeClient(Protocol):
    # Which route answered, for the AI log (spec B3): "api", "claude-code" or "canned".
    route: str

    def read_paper(self, system: str, prompt: str, schema: dict) -> ReadResult: ...

    def define(self, system: str, prompt: str, schema: dict) -> Iterator[str]: ...

    def ask(self, system: str, prompt: str, schema: dict) -> Iterator[str]: ...


class NoClaude:
    """What serve uses when there is neither an API key nor Claude Code: every call fails plainly."""

    route = "api"

    def _fail(self):
        raise AiError("no_claude", "no Claude available: log in to Claude Code, or save an API key")

    def read_paper(self, system: str, prompt: str, schema: dict) -> ReadResult:
        self._fail()

    def define(self, system: str, prompt: str, schema: dict) -> Iterator[str]:
        self._fail()
        yield ""

    def ask(self, system: str, prompt: str, schema: dict) -> Iterator[str]:
        self._fail()
        yield ""


def _output_config(effort: str, schema: dict) -> dict:
    return {"effort": effort, "format": {"type": "json_schema", "schema": schema}}


@contextmanager
def _plain_errors():
    """SDK exceptions, most specific first, as one plain AiError."""
    try:
        yield
    except anthropic.AuthenticationError as exc:
        raise AiError("no_key", "no valid API key (set ANTHROPIC_API_KEY or run `ant auth login`)") from exc
    except anthropic.RateLimitError as exc:
        raise AiError("rate_limited", "the API is rate limiting this key; try again later") from exc
    except anthropic.APIStatusError as exc:
        raise AiError("api_error", f"the API answered {exc.status_code}") from exc
    except anthropic.APIConnectionError as exc:
        raise AiError("network", "could not reach the API") from exc
    except TypeError as exc:   # _NO_CREDENTIALS: the SDK found no key at all (Step 1)
        if "auth" not in str(exc).lower():
            raise
        raise AiError("no_key", "no API key (set ANTHROPIC_API_KEY or run `ant auth login`)") from exc


def _final_text(message) -> str:
    if message.stop_reason == "refusal":
        raise AiError("refused", "the model declined to answer")
    if message.stop_reason == "max_tokens":
        raise AiError("too_long", "the answer was cut off before it finished")
    return "".join(block.text for block in message.content if block.type == "text")


def _json(text: str) -> dict:
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        raise AiError("invalid_output", "the answer was not valid JSON") from exc


class AnthropicClaude:
    route = "api"

    def __init__(self, sdk: anthropic.Anthropic | None = None):
        self._sdk = sdk

    def _client(self) -> anthropic.Anthropic:
        if self._sdk is None:
            self._sdk = anthropic.Anthropic()   # the SDK's own credential chain; nothing stored here
        return self._sdk

    def _stream(self, model: str, max_tokens: int, effort: str, system: str, prompt: str, schema: dict):
        return self._client().messages.stream(
            model=model, max_tokens=max_tokens, system=system,
            messages=[{"role": "user", "content": prompt}],
            output_config=_output_config(effort, schema),
        )

    def read_paper(self, system: str, prompt: str, schema: dict) -> ReadResult:
        with _plain_errors():  # noqa: SIM117 -- kept separate: one guards SDK errors, the other is the stream
            with self._stream(READER_MODEL, READER_MAX_TOKENS, READER_EFFORT, system, prompt, schema) as stream:
                message = stream.get_final_message()
        text = _final_text(message)
        return ReadResult(_json(text), text)

    def define(self, system: str, prompt: str, schema: dict) -> Iterator[str]:
        yield from self._streamed(DEFINER_MODEL, DEFINER_MAX_TOKENS, DEFINER_EFFORT, system, prompt, schema)

    def ask(self, system: str, prompt: str, schema: dict) -> Iterator[str]:
        yield from self._streamed(ASK_MODEL, ASK_MAX_TOKENS, ASK_EFFORT, system, prompt, schema)

    def _streamed(self, model: str, max_tokens: int, effort: str, system: str, prompt: str,
                  schema: dict) -> Iterator[str]:
        """The model's JSON text as it is written; a refusal or a cut-off answer fails after it."""
        with _plain_errors():  # noqa: SIM117 -- kept separate: one guards SDK errors, the other is the stream
            with self._stream(model, max_tokens, effort, system, prompt, schema) as stream:
                yield from stream.text_stream
                message = stream.get_final_message()
        _final_text(message)
