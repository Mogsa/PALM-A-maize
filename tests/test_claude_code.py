"""ClaudeCodeClaude with a fake runner: no real subprocess, no network."""

import json
import subprocess
from pathlib import Path

import pytest

from paperboard.ai_client import ASK_MODEL, DEFINER_MODEL, READER_MODEL, AiError
from paperboard.claude_code import ASK_TIMEOUT, DEFINE_TIMEOUT, READ_TIMEOUT, ClaudeCodeClaude

SCHEMA = {"type": "object", "properties": {"x": {"type": "string"}}}
ENV = {"PATH": "/bin", "HOME": "/home/me", "ANTHROPIC_API_KEY": "sk-secret", "ANTHROPIC_AUTH_TOKEN": "tok",
       "ANTHROPIC_BASE_URL": "https://example.invalid"}


def envelope(**over) -> str:
    base = {"type": "result", "subtype": "success", "is_error": False, "stop_reason": "tool_use",
            "result": "", "structured_output": {"x": "ok"}}
    return json.dumps({**base, **over})


class FakeRun:
    def __init__(self, stdout="", returncode=0, stderr="", raises=None):
        self.stdout, self.returncode, self.stderr, self.raises = stdout, returncode, stderr, raises
        self.argv: list[str] = []
        self.kwargs: dict = {}

    def __call__(self, argv, **kwargs):
        self.argv, self.kwargs = argv, kwargs
        self.cwd_existed = Path(kwargs["cwd"]).is_dir()
        self.cwd_was_empty = self.cwd_existed and not any(Path(kwargs["cwd"]).iterdir())
        if self.raises:
            raise self.raises
        return subprocess.CompletedProcess(argv, self.returncode, self.stdout, self.stderr)


class FakeStdin:
    def __init__(self):
        self.text, self.closed = "", False

    def write(self, text):
        self.text += text

    def close(self):
        self.closed = True


class FakeProc:
    def __init__(self, lines, returncode=0, stderr=""):
        self.stdin = FakeStdin()
        self.stdout = iter(line + "\n" for line in lines)
        self.stderr = _Readable(stderr)
        self.returncode = returncode
        self.killed = False
        self.wait_calls = 0

    def wait(self, timeout=None):
        self.wait_calls += 1
        return self.returncode

    def kill(self):
        self.killed = True


class _Readable:
    def __init__(self, text):
        self.text = text

    def read(self):
        return self.text


class FakePopen:
    def __init__(self, proc):
        self.proc = proc
        self.argv: list[str] = []
        self.kwargs: dict = {}

    def __call__(self, argv, **kwargs):
        self.argv, self.kwargs = argv, kwargs
        self.cwd_existed = Path(kwargs["cwd"]).is_dir()
        return self.proc


def flag(argv, name):
    return argv[argv.index(name) + 1]


# -- the whole-paper read ------------------------------------------------------

def test_read_runs_claude_print_with_the_opus_model_schema_and_no_tools():
    run = FakeRun(envelope())
    ClaudeCodeClaude(run=run, env=ENV).read_paper("SYS", "the paper", SCHEMA)
    argv = run.argv
    assert argv[0] == "claude" and "-p" in argv
    assert flag(argv, "--model") == READER_MODEL
    assert flag(argv, "--effort") == "high"
    assert flag(argv, "--system-prompt").startswith("SYS")
    assert json.loads(flag(argv, "--json-schema")) == SCHEMA
    assert flag(argv, "--tools") == ""
    assert flag(argv, "--setting-sources") == ""
    assert flag(argv, "--output-format") == "json"
    assert "--strict-mcp-config" in argv and "--no-session-persistence" in argv


def test_read_sends_the_paper_on_stdin_never_through_a_shell():
    run = FakeRun(envelope())
    ClaudeCodeClaude(run=run, env=ENV).read_paper("SYS", "$(rm -rf ~) the paper", SCHEMA)
    assert run.kwargs["input"] == "$(rm -rf ~) the paper"
    assert "$(rm -rf ~) the paper" not in run.argv
    assert not run.kwargs.get("shell")
    assert isinstance(run.argv, list)


def test_read_strips_api_keys_runs_in_a_fresh_empty_dir_with_a_timeout():
    run = FakeRun(envelope())
    ClaudeCodeClaude(run=run, env=ENV).read_paper("SYS", "p", SCHEMA)
    env = run.kwargs["env"]
    assert "ANTHROPIC_API_KEY" not in env and "ANTHROPIC_AUTH_TOKEN" not in env
    assert "ANTHROPIC_BASE_URL" not in env
    assert env["PATH"] == "/bin" and env["HOME"] == "/home/me"
    assert run.cwd_existed and run.cwd_was_empty
    assert Path(run.kwargs["cwd"]).resolve() != Path.cwd().resolve()
    assert not Path(run.kwargs["cwd"]).exists()       # removed afterwards
    assert run.kwargs["timeout"] == READ_TIMEOUT == 600


def test_read_unwraps_the_structured_output_from_the_envelope():
    run = FakeRun(envelope(structured_output={"terms": [], "where_to_look": []}))
    read = ClaudeCodeClaude(run=run, env=ENV).read_paper("S", "p", SCHEMA)
    assert read.answer == {"terms": [], "where_to_look": []}


@pytest.mark.parametrize("run, code", [
    (FakeRun(envelope(is_error=True, subtype="success", result="Not logged in · Please run /login"), returncode=1),
     "not_logged_in"),
    (FakeRun("", returncode=1, stderr="Invalid API key · Please run /login"), "not_logged_in"),
    (FakeRun(envelope(is_error=True, result="Claude AI usage limit reached|1759000000"), returncode=1), "rate_limited"),
    (FakeRun(envelope(is_error=True, result="You've reached your rate limit · resets 5pm"), returncode=1),
     "rate_limited"),
    (FakeRun(envelope(stop_reason="refusal", structured_output=None)), "refused"),
    (FakeRun(envelope(subtype="error_max_structured_output_retries", is_error=True), returncode=1), "invalid_output"),
    (FakeRun(envelope(structured_output=None)), "invalid_output"),
    (FakeRun("not json at all"), "invalid_output"),
    (FakeRun("", returncode=2, stderr="something broke"), "api_error"),
    (FakeRun(envelope(is_error=True, subtype="error_during_execution", result="API Error: 500"), returncode=1),
     "api_error"),
    # A bare "limit" (no narrow phrase) is never mistaken for a rate limit.
    (FakeRun(envelope(is_error=True, result="You've hit your limit · resets 5pm"), returncode=1), "api_error"),
    # The subtype is checked before any text matching: the result text here even
    # says "limit", but the subtype alone decides this is invalid_output.
    (FakeRun(envelope(is_error=True, subtype="error_max_structured_output_retries",
                       result="reached the retry limit"), returncode=1), "invalid_output"),
    (FakeRun(raises=subprocess.TimeoutExpired("claude", 600)), "timeout"),
    (FakeRun(raises=FileNotFoundError("claude")), "no_claude"),
])
def test_read_failures_become_plain_ai_errors(run, code):
    with pytest.raises(AiError) as err:
        ClaudeCodeClaude(run=run, env=ENV).read_paper("S", "p", SCHEMA)
    assert err.value.code == code
    assert str(err.value)


def test_not_logged_in_says_how_to_log_in():
    run = FakeRun(envelope(is_error=True, result="Not logged in · Please run /login"), returncode=1)
    with pytest.raises(AiError) as err:
        ClaudeCodeClaude(run=run, env=ENV).read_paper("S", "p", SCHEMA)
    assert str(err.value) == "Log in to Claude Code first (run `claude` once)"


# -- Define, streamed ------------------------------------------------------------

def event(ev: dict, parent=None) -> str:
    return json.dumps({"type": "stream_event", "event": ev, "parent_tool_use_id": parent})


def tool_start(index, name="StructuredOutput"):
    return event({"type": "content_block_start", "index": index,
                  "content_block": {"type": "tool_use", "name": name, "input": {}}})


def json_delta(index, text):
    return event({"type": "content_block_delta", "index": index,
                  "delta": {"type": "input_json_delta", "partial_json": text}})


def text_delta(index, text):
    return event({"type": "content_block_delta", "index": index, "delta": {"type": "text_delta", "text": text}})


STREAM = [
    json.dumps({"type": "system", "subtype": "init"}),
    event({"type": "content_block_start", "index": 0, "content_block": {"type": "text", "text": ""}}),
    text_delta(0, "Some prose first."),
    tool_start(1),
    json_delta(1, '{"explanation": "a '),
    json_delta(1, 'thing"}'),
    json.dumps({"type": "assistant", "message": {}}),
    envelope(structured_output={"explanation": "a thing"}),
]


def test_define_streams_the_structured_output_json_as_it_comes():
    popen = FakePopen(FakeProc(STREAM))
    deltas = list(ClaudeCodeClaude(popen=popen, env=ENV).define("SYS", "Word: x", SCHEMA))
    assert deltas == ['{"explanation": "a ', 'thing"}']
    assert json.loads("".join(deltas)) == {"explanation": "a thing"}


def test_define_uses_sonnet_low_stream_json_stdin_stripped_env_and_a_fresh_dir():
    proc = FakeProc(STREAM)
    popen = FakePopen(proc)
    list(ClaudeCodeClaude(popen=popen, env=ENV).define("SYS", "Word: x", SCHEMA))
    argv = popen.argv
    assert flag(argv, "--model") == DEFINER_MODEL and flag(argv, "--effort") == "low"
    assert flag(argv, "--output-format") == "stream-json"
    assert "--include-partial-messages" in argv and "--verbose" in argv
    assert flag(argv, "--tools") == "" and flag(argv, "--setting-sources") == ""
    assert proc.stdin.text == "Word: x" and proc.stdin.closed
    assert "Word: x" not in argv and not popen.kwargs.get("shell")
    assert "ANTHROPIC_API_KEY" not in popen.kwargs["env"] and "ANTHROPIC_AUTH_TOKEN" not in popen.kwargs["env"]
    assert "ANTHROPIC_BASE_URL" not in popen.kwargs["env"]
    assert popen.cwd_existed and not Path(popen.kwargs["cwd"]).exists()
    assert DEFINE_TIMEOUT == 60


def test_read_returns_the_raw_text_it_received_alongside_the_answer():
    run = FakeRun(envelope(structured_output={"terms": [], "where_to_look": []}))
    read = ClaudeCodeClaude(run=run, env=ENV).read_paper("S", "p", SCHEMA)
    assert json.loads(read.raw) == json.loads(run.stdout)


def test_define_never_uses_a_pipe_for_stderr_so_the_child_cannot_block_on_it():
    """Streamed stderr=PIPE with nobody reading it can fill the pipe buffer and
    block the child. Define must hand the child a real file instead."""
    popen = FakePopen(FakeProc(STREAM))
    list(ClaudeCodeClaude(popen=popen, env=ENV).define("SYS", "Word: x", SCHEMA))
    assert popen.kwargs["stderr"] is not subprocess.PIPE
    assert hasattr(popen.kwargs["stderr"], "fileno")   # a real file, not a pipe


class _StderrCapture:
    """Test seam standing in for ClaudeCodeClaude's real tempfile: writes `text`
    into it up front, as if the child process had already written its stderr."""

    def __init__(self, text):
        self._text = text

    def __call__(self):
        import io
        f = io.StringIO()
        f.write(self._text)
        f.seek(0)
        return f


def test_define_reads_the_stderr_file_capped_for_the_failure_message():
    """No result line at all (the process died before Claude Code emitted one):
    the failure message comes from the child's stderr, capped at DETAIL_CHARS."""
    stderr = "x" * 500
    client = ClaudeCodeClaude(popen=FakePopen(FakeProc([], returncode=1)), env=ENV,
                              stderr_factory=_StderrCapture(stderr))
    with pytest.raises(AiError) as err:
        list(client.define("S", "w", SCHEMA))
    assert err.value.code == "api_error"
    assert "x" * 200 in str(err.value)
    assert "x" * 201 not in str(err.value)


def test_define_ignores_a_second_structured_output_block_from_a_retry():
    """Claude Code can retry a StructuredOutput call that failed its own schema
    check: a second tool_use block starts, with its own deltas. Only the first
    block's fragments are ever forwarded, so concatenating them never builds
    invalid JSON out of two separate attempts."""
    lines = [tool_start(0), json_delta(0, '{"explanation": "first'),
             tool_start(1), json_delta(1, '"nope"'),
             envelope(structured_output={"explanation": "first, complete"})]
    deltas = list(ClaudeCodeClaude(popen=FakePopen(FakeProc(lines)), env=ENV).define("S", "w", SCHEMA))
    assert deltas == ['{"explanation": "first']


def test_define_ignores_json_deltas_from_other_tools_and_subagents():
    lines = [tool_start(0, name="Other"), json_delta(0, "nope"),
             event({"type": "content_block_start", "index": 1,
                    "content_block": {"type": "tool_use", "name": "StructuredOutput"}}, parent="toolu_x"),
             event({"type": "content_block_delta", "index": 1,
                    "delta": {"type": "input_json_delta", "partial_json": "nope"}}, parent="toolu_x"),
             tool_start(2), json_delta(2, "{}"), envelope()]
    assert list(ClaudeCodeClaude(popen=FakePopen(FakeProc(lines)), env=ENV).define("S", "w", SCHEMA)) == ["{}"]


def test_define_error_result_after_the_stream_is_a_plain_error():
    lines = [envelope(is_error=True, result="Not logged in · Please run /login")]
    with pytest.raises(AiError) as err:
        list(ClaudeCodeClaude(popen=FakePopen(FakeProc(lines, returncode=1)), env=ENV).define("S", "w", SCHEMA))
    assert err.value.code == "not_logged_in"


def test_define_with_no_result_line_is_an_api_error():
    with pytest.raises(AiError) as err:
        list(ClaudeCodeClaude(popen=FakePopen(FakeProc([], returncode=3, stderr="boom")), env=ENV)
             .define("S", "w", SCHEMA))
    assert err.value.code == "api_error"


def test_define_bad_json_line_is_invalid_output_and_kills_the_process():
    proc = FakeProc(["{not json"])
    with pytest.raises(AiError) as err:
        list(ClaudeCodeClaude(popen=FakePopen(proc), env=ENV).define("S", "w", SCHEMA))
    assert err.value.code == "invalid_output"
    assert proc.killed


def test_define_that_runs_past_its_timeout_is_a_timeout_error():
    proc = FakeProc([])

    class Slow(FakePopen):
        def __call__(self, argv, **kwargs):
            super().__call__(argv, **kwargs)
            return proc

    client = ClaudeCodeClaude(popen=Slow(proc), env=ENV, define_timeout=0.05)

    def blocking_lines():
        import time
        deadline = time.monotonic() + 2
        while not proc.killed and time.monotonic() < deadline:
            time.sleep(0.01)
        return
        yield

    proc.stdout = blocking_lines()
    proc.returncode = -9
    with pytest.raises(AiError) as err:
        list(client.define("S", "w", SCHEMA))
    assert err.value.code == "timeout"


def test_define_missing_claude_is_no_claude():
    def popen(argv, **kwargs):
        raise FileNotFoundError("claude")
    with pytest.raises(AiError) as err:
        list(ClaudeCodeClaude(popen=popen, env=ENV).define("S", "w", SCHEMA))
    assert err.value.code == "no_claude"


# -- ask -------------------------------------------------------------------------

def test_ask_runs_sonnet_medium_with_no_tools_stream_json_stdin_stripped_env_and_a_fresh_dir():
    proc = FakeProc(STREAM)
    popen = FakePopen(proc)
    deltas = list(ClaudeCodeClaude(popen=popen, env=ENV).ask("SYS", "Question: why?", SCHEMA))
    assert deltas == ['{"explanation": "a ', 'thing"}']
    argv = popen.argv
    assert argv[0] == "claude" and "-p" in argv
    assert flag(argv, "--model") == ASK_MODEL and flag(argv, "--effort") == "medium"
    assert flag(argv, "--system-prompt").startswith("SYS")
    assert json.loads(flag(argv, "--json-schema")) == SCHEMA
    assert flag(argv, "--tools") == "" and flag(argv, "--setting-sources") == ""
    assert "--strict-mcp-config" in argv and "--no-session-persistence" in argv and "--disable-slash-commands" in argv
    assert flag(argv, "--output-format") == "stream-json"
    assert proc.stdin.text == "Question: why?" and "Question: why?" not in argv and not popen.kwargs.get("shell")
    assert not {"ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL"} & set(popen.kwargs["env"])
    assert popen.cwd_existed and not Path(popen.kwargs["cwd"]).exists()
    assert ASK_TIMEOUT > DEFINE_TIMEOUT


def test_ask_error_result_after_the_stream_is_a_plain_error():
    lines = [envelope(is_error=True, result="Not logged in · Please run /login")]
    with pytest.raises(AiError) as err:
        list(ClaudeCodeClaude(popen=FakePopen(FakeProc(lines, returncode=1)), env=ENV).ask("S", "q", SCHEMA))
    assert err.value.code == "not_logged_in"


def test_ask_that_runs_past_its_timeout_is_a_timeout_error():
    proc = FakeProc([])

    def blocking_lines():
        import time
        deadline = time.monotonic() + 2
        while not proc.killed and time.monotonic() < deadline:
            time.sleep(0.01)
        return
        yield

    proc.stdout = blocking_lines()
    client = ClaudeCodeClaude(popen=FakePopen(proc), env=ENV, ask_timeout=0.05)
    with pytest.raises(AiError) as err:
        list(client.ask("S", "q", SCHEMA))
    assert err.value.code == "timeout"
