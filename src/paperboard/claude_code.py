"""The second route to Claude: the user's own Claude Code login, run headless (`claude -p`).

Same ClaudeClient protocol as AnthropicClaude. Each call runs the `claude` CLI once:
- in a fresh empty temporary folder, so no CLAUDE.md or project context loads;
- with ANTHROPIC_API_KEY and ANTHROPIC_AUTH_TOKEN removed, so it uses the plan login;
- with no tools, no settings files, no MCP servers, and nothing saved;
- with the prompt on stdin and a list argv, never through a shell.

Claude Code answers a --json-schema by calling its StructuredOutput tool. The whole read takes
`structured_output` from the result envelope; Define streams that tool's JSON as it is written.
"""

import json
import os
import subprocess
import tempfile
import threading
from collections.abc import Callable, Iterator, Mapping

from paperboard.ai_client import (
    DEFINER_EFFORT,
    DEFINER_MODEL,
    READER_EFFORT,
    READER_MODEL,
    AiError,
    ReadResult,
)

CLAUDE_EXE = "claude"
READ_TIMEOUT = 600      # seconds: the whole-paper read
DEFINE_TIMEOUT = 60     # seconds: one quick definition
STRUCTURED_TOOL = "StructuredOutput"
STRIPPED_ENV = ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL")
# Without this, Claude Code tends to write prose first and only then call the tool.
ANSWER_NUDGE = f"\n\nGive your answer only by calling the {STRUCTURED_TOOL} tool, with no text before it."
DETAIL_CHARS = 200
NOT_LOGGED_IN = "Log in to Claude Code first (run `claude` once)"


def _default_stderr_file():
    return tempfile.TemporaryFile(mode="w+", prefix="paperboard-claude-stderr-")


def _argv(model: str, effort: str, system: str, schema: dict, stream: bool) -> list[str]:
    argv = [
        CLAUDE_EXE, "-p",
        "--model", model,
        "--effort", effort,
        "--system-prompt", system + ANSWER_NUDGE,
        "--json-schema", json.dumps(schema),
        "--tools", "",
        "--setting-sources", "",
        "--strict-mcp-config",
        "--disable-slash-commands",
        "--no-session-persistence",
    ]
    if stream:
        return [*argv, "--output-format", "stream-json", "--verbose", "--include-partial-messages"]
    return [*argv, "--output-format", "json"]


_LIMIT_PHRASES = ("usage limit", "rate limit", "limit reached")


def _failure(text: str, subtype: str = "") -> AiError:
    """One plain AiError for whatever Claude Code said when it failed.

    The result subtype is checked first: it is Claude Code's own classification
    and is exact, where the text below is prose meant for a person and can say
    almost anything. Only once the subtype gives no answer do we fall back to
    matching narrow phrases in it, never a bare "limit" (which also appears in,
    say, "the answer did not fit the expected shape" style messages that are
    not about rate limiting at all)."""
    if subtype == "error_max_structured_output_retries":
        return AiError("invalid_output", "the answer did not fit the expected shape")
    lowered = text.lower()
    if "not logged in" in lowered or "/login" in lowered:
        return AiError("not_logged_in", NOT_LOGGED_IN)
    if any(phrase in lowered for phrase in _LIMIT_PHRASES):
        return AiError("rate_limited", "your Claude plan's usage limit is reached; try again later")
    detail = " ".join(text.split())[:DETAIL_CHARS] or "no details"
    return AiError("api_error", f"Claude Code failed: {detail}")


def _structured(result: dict) -> dict:
    """The answer inside a successful result envelope, or a plain AiError."""
    if result.get("is_error") or result.get("subtype") != "success":
        raise _failure(str(result.get("result", "")), str(result.get("subtype", "")))
    if result.get("stop_reason") == "refusal":
        raise AiError("refused", "the model declined to answer")
    answer = result.get("structured_output")
    if not isinstance(answer, dict):
        raise AiError("invalid_output", "the answer was not valid JSON")
    return answer


def _load(line: str) -> dict:
    try:
        return json.loads(line)
    except json.JSONDecodeError as exc:
        raise AiError("invalid_output", "Claude Code's output was not valid JSON") from exc


def _structured_delta(message: dict, tool_blocks: set[int]) -> str | None:
    """The StructuredOutput JSON fragment in one stream-json line, if it holds one.

    Only the top-level turn counts (no parent tool use); `tool_blocks` remembers which content
    block index is the StructuredOutput call. Only ever the first one: on a retry (a first
    StructuredOutput call whose output Claude Code itself rejects, followed by a second), a
    second block's fragments are never tracked, so they are never forwarded and never get
    concatenated onto the first attempt's, which would otherwise build invalid JSON."""
    if message.get("type") != "stream_event" or message.get("parent_tool_use_id") is not None:
        return None
    event = message.get("event", {})
    if event.get("type") == "content_block_start":
        block = event.get("content_block", {})
        if block.get("type") == "tool_use" and block.get("name") == STRUCTURED_TOOL and not tool_blocks:
            tool_blocks.add(event.get("index"))
        return None
    delta = event.get("delta", {})
    if event.get("type") == "content_block_delta" and delta.get("type") == "input_json_delta" \
            and event.get("index") in tool_blocks:
        return delta.get("partial_json", "")
    return None


class ClaudeCodeClaude:
    route = "claude-code"

    def __init__(self, run: Callable = subprocess.run, popen: Callable = subprocess.Popen,
                 env: Mapping[str, str] | None = None, define_timeout: float = DEFINE_TIMEOUT,
                 stderr_factory: Callable = _default_stderr_file):
        self._run = run            # seams: tests pass fakes, so no test starts a real process
        self._popen = popen
        self._env = env
        self._define_timeout = define_timeout
        self._stderr_factory = stderr_factory   # a real file, never a pipe: see define()

    def _child_env(self) -> dict[str, str]:
        env = os.environ if self._env is None else self._env
        return {k: v for k, v in env.items() if k not in STRIPPED_ENV}

    def read_paper(self, system: str, prompt: str, schema: dict) -> ReadResult:
        argv = _argv(READER_MODEL, READER_EFFORT, system, schema, stream=False)
        with tempfile.TemporaryDirectory(prefix="paperboard-claude-") as cwd:
            try:
                done = self._run(argv, input=prompt, capture_output=True, text=True,
                                 cwd=cwd, env=self._child_env(), timeout=READ_TIMEOUT)
            except subprocess.TimeoutExpired as exc:
                raise AiError("timeout", "Claude Code took longer than 10 minutes") from exc
            except FileNotFoundError as exc:
                raise AiError("no_claude", "the `claude` command was not found") from exc
        try:
            result = json.loads(done.stdout)
        except json.JSONDecodeError as exc:
            if done.returncode != 0:
                raise _failure(done.stderr or done.stdout) from exc
            raise AiError("invalid_output", "Claude Code's output was not valid JSON") from exc
        return ReadResult(_structured(result), done.stdout)

    def define(self, system: str, prompt: str, schema: dict) -> Iterator[str]:
        argv = _argv(DEFINER_MODEL, DEFINER_EFFORT, system, schema, stream=True)
        # stderr goes to a real file, never a pipe: a pipe nobody reads fills up and blocks
        # the child once it writes enough to it, and we do want the child's stderr for the
        # failure message below, just not by continuously reading a pipe while streaming.
        with tempfile.TemporaryDirectory(prefix="paperboard-claude-") as cwd, self._stderr_factory() as stderr_file:
            try:
                proc = self._popen(argv, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                   stderr=stderr_file, text=True, cwd=cwd, env=self._child_env())
            except FileNotFoundError as exc:
                raise AiError("no_claude", "the `claude` command was not found") from exc
            expired = threading.Event()
            timer = threading.Timer(self._define_timeout, lambda: (expired.set(), proc.kill()))
            timer.start()
            try:
                result = yield from self._stream(proc, prompt)
            finally:
                timer.cancel()
                proc.kill()
                proc.wait()
            stderr_file.seek(0)
            stderr_text = stderr_file.read(DETAIL_CHARS)
        if expired.is_set():
            raise AiError("timeout", "Claude Code took longer than a minute")
        if result is None:
            raise _failure(stderr_text)
        _structured(result)

    def _stream(self, proc, prompt: str):
        """Yields the StructuredOutput fragments; returns the final result envelope, if any."""
        proc.stdin.write(prompt)
        proc.stdin.close()
        tool_blocks: set[int] = set()
        result = None
        for line in proc.stdout:
            if not line.strip():
                continue
            message = _load(line)
            if message.get("type") == "result":
                result = message
                continue
            fragment = _structured_delta(message, tool_blocks)
            if fragment:
                yield fragment
        return result

