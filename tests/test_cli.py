import json

from conftest import FIXTURES
from fastapi.testclient import TestClient
from typer.testing import CliRunner

from paperboard.cli import app, build_app
from paperboard.source_model import SourceDocument

runner = CliRunner()


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


def test_missing_file_exits_nonzero_with_a_readable_message(tmp_path):
    result = runner.invoke(app, ["extract", str(tmp_path / "nope.pdf")])
    assert result.exit_code != 0
    # The CLI writes the error with err=True, so it may land on stderr rather than
    # stdout; read both, guarded since stderr is only separately populated when
    # the runner is asked to keep the streams apart.
    combined = result.output + (result.stderr or "")
    assert "not found" in combined.lower()


def test_build_app_serves_the_api_and_a_placeholder_root(tmp_path):
    client = TestClient(build_app(tmp_path / "data", tmp_path / "missing-web"))
    assert client.get("/api/papers").json() == []
    assert client.get("/").json()["message"].startswith("paperboard API")


def test_build_app_serves_the_frontend_when_built(tmp_path):
    dist = tmp_path / "dist"
    dist.mkdir(parents=True)
    (dist / "index.html").write_text("<!doctype html><title>board</title>")
    client = TestClient(build_app(tmp_path / "data", dist))
    assert client.get("/").status_code == 200
    assert "board" in client.get("/").text


def test_serve_command_exists():
    result = runner.invoke(app, ["serve", "--help"])
    assert result.exit_code == 0 and "--port" in result.output
