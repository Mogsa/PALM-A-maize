import json
import os
import re
from datetime import UTC, datetime

import pytest
from conftest import FIXTURES, local_client
from typer.testing import CliRunner

from paperboard.ai_client import AiError, AnthropicClaude
from paperboard.canned_claude import CannedClaude
from paperboard.claude_code import ClaudeCodeClaude
from paperboard.cli import FAKE_CLAUDE_ENV, app, build_app, choose_claude, claude_from_env
from paperboard.source_model import SourceDocument

runner = CliRunner()

_ANSI = re.compile(r"\x1b\[[0-9;]*m")


def _plain(output: str) -> str:
    """Strip ANSI colour codes: typer/rich style each option's leading dash
    separately (e.g. `--port` -> `-<code>-port`), which breaks a plain
    substring check even though the help text is correct."""
    return _ANSI.sub("", output)


def test_extract_writes_a_board_folder(tmp_path):
    result = runner.invoke(
        app, ["extract", str(FIXTURES["resnet"]), "--out", str(tmp_path)]
    )
    assert result.exit_code == 0, result.output
    folder = next(tmp_path.iterdir())
    assert (folder / "paper.pdf").exists()
    source_json = (folder / "source.json").read_text(encoding="utf-8")
    payload = json.loads(source_json)
    assert payload["schema"] == 1
    assert payload["sections"]
    SourceDocument.model_validate_json(source_json)


def test_extract_is_idempotent(tmp_path):
    for _ in range(2):
        result = runner.invoke(
            app, ["extract", str(FIXTURES["resnet"]), "--out", str(tmp_path)]
        )
        assert result.exit_code == 0
    assert len(list(tmp_path.iterdir())) == 1


def test_extract_writes_atomically_and_keeps_pdf_and_source_together(tmp_path, monkeypatch, extracted):
    """A crash mid-write leaves the previous source.json intact, and a re-run
    with a newer PDF of the same paper replaces the PDF along with the source."""
    import paperboard.cli as cli_module

    doc = extracted["resnet"]
    monkeypatch.setattr(cli_module, "extract", lambda _path: doc)
    v1 = tmp_path / "v1.pdf"
    v1.write_bytes(FIXTURES["resnet"].read_bytes())
    out = tmp_path / "papers"
    assert runner.invoke(app, ["extract", str(v1), "--out", str(out)]).exit_code == 0
    source = out / doc.paper_id / "source.json"
    before = source.read_bytes()

    later = doc.model_copy(update={"extracted_at": datetime(2030, 1, 1, tzinfo=UTC)})
    monkeypatch.setattr(cli_module, "extract", lambda _path: later)

    def crash(src, dst):
        raise OSError("simulated crash between tmp and replace")

    with monkeypatch.context() as crashing:
        crashing.setattr(os, "replace", crash)
        assert runner.invoke(app, ["extract", str(v1), "--out", str(out)]).exit_code != 0
    assert source.read_bytes() == before
    assert not list(source.parent.glob("*.tmp"))

    v2 = tmp_path / "v2.pdf"
    v2.write_bytes(v1.read_bytes() + b"\n% revised\n")
    assert runner.invoke(app, ["extract", str(v2), "--out", str(out)]).exit_code == 0
    assert (out / doc.paper_id / "paper.pdf").read_bytes() == v2.read_bytes()


def test_missing_file_exits_nonzero_with_a_readable_message(tmp_path):
    result = runner.invoke(app, ["extract", str(tmp_path / "nope.pdf")])
    assert result.exit_code != 0
    # The CLI writes the error with err=True, so it may land on stderr rather than
    # stdout; read both, guarded since stderr is only separately populated when
    # the runner is asked to keep the streams apart.
    combined = result.output + (result.stderr or "")
    assert "not found" in combined.lower()


def test_build_app_serves_the_api_and_a_placeholder_root(tmp_path):
    client = local_client(build_app(tmp_path / "data", tmp_path / "missing-web"))
    assert client.get("/api/papers").json() == []
    assert client.get("/").json()["message"].startswith("paperboard API")


def test_build_app_serves_the_frontend_when_built(tmp_path):
    dist = tmp_path / "dist"
    dist.mkdir(parents=True)
    (dist / "index.html").write_text("<!doctype html><title>board</title>")
    client = local_client(build_app(tmp_path / "data", dist))
    assert client.get("/").status_code == 200
    assert "board" in client.get("/").text


def test_serve_command_exists():
    result = runner.invoke(app, ["serve", "--help"])
    assert result.exit_code == 0 and "--port" in _plain(result.output)


def test_no_canned_claude_unless_the_test_env_names_one():
    assert claude_from_env({}) is None
    assert claude_from_env({FAKE_CLAUDE_ENV: ""}) is None


def test_the_test_env_gives_serve_a_canned_claude(tmp_path):
    answer = tmp_path / "answer.json"
    answer.write_text(json.dumps({"read_paper": {"terms": [], "where_to_look": []}, "define": ['{"a"', ": 1}"]}))
    claude = claude_from_env({FAKE_CLAUDE_ENV: str(answer)})
    assert claude.read_paper("s", "p", {}) == {"terms": [], "where_to_look": []}
    assert "".join(claude.define("s", "p", {})) == '{"a": 1}'


# -- which Claude serve uses ------------------------------------------------------

def _no_claude_cli(_name):
    return None


def _has_claude_cli(_name):
    return "/usr/local/bin/claude"


def test_the_canned_claude_comes_first(tmp_path):
    answer = tmp_path / "answer.json"
    answer.write_text("{}")
    key = tmp_path / "anthropic_key"
    key.write_text("sk-file")
    env = {FAKE_CLAUDE_ENV: str(answer), "ANTHROPIC_API_KEY": "sk-env"}
    claude, label = choose_claude(env, key_file=key, which=_has_claude_cli)
    assert isinstance(claude, CannedClaude) and "canned" in label


def test_an_env_api_key_uses_the_api(tmp_path):
    claude, label = choose_claude({"ANTHROPIC_API_KEY": "sk-env"}, key_file=tmp_path / "none", which=_has_claude_cli)
    assert isinstance(claude, AnthropicClaude) and label == "AI help: your API key"


def test_a_saved_key_file_uses_the_api_with_that_key_stripped(tmp_path):
    key = tmp_path / "anthropic_key"
    key.write_text("  sk-file\n")
    claude, label = choose_claude({}, key_file=key, which=_has_claude_cli)
    assert isinstance(claude, AnthropicClaude) and label == "AI help: your API key"
    assert "sk-file" not in label
    assert claude._client().api_key == "sk-file"


def test_an_empty_key_file_is_no_key(tmp_path):
    key = tmp_path / "anthropic_key"
    key.write_text("\n")
    claude, _ = choose_claude({}, key_file=key, which=_has_claude_cli)
    assert isinstance(claude, ClaudeCodeClaude)


def test_no_key_but_claude_on_path_uses_claude_code(tmp_path):
    claude, label = choose_claude({}, key_file=tmp_path / "none", which=_has_claude_cli)
    assert isinstance(claude, ClaudeCodeClaude) and label == "AI help: your Claude Code login"


def test_nothing_available_fails_plainly_on_each_call(tmp_path):
    claude, label = choose_claude({}, key_file=tmp_path / "none", which=_no_claude_cli)
    assert label == "AI help: none (log in to Claude Code, or save an API key)"
    for call in (lambda: claude.read_paper("s", "p", {}), lambda: list(claude.define("s", "p", {}))):
        with pytest.raises(AiError) as err:
            call()
        assert err.value.code == "no_claude"
        assert str(err.value) == "no Claude available: log in to Claude Code, or save an API key"
