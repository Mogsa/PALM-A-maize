import json

from typer.testing import CliRunner

from paperboard.cli import app
from paperboard.source_model import SourceDocument
from conftest import FIXTURES

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
