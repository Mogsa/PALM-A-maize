import json
import os
import re
from datetime import UTC, datetime

from conftest import FIXTURES, local_client
from typer.testing import CliRunner

from paperboard.cli import app, build_app
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
