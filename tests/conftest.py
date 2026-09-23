import json
import shutil
from pathlib import Path

import pytest

from paperboard.extract import extract

FIXTURE_DIR = Path(__file__).parent / "fixtures"
PAPER_DIR = FIXTURE_DIR / "papers"
GOLDEN_DIR = FIXTURE_DIR / "golden"
MANIFEST = json.loads((PAPER_DIR / "MANIFEST.json").read_text())

FIXTURES = {name: PAPER_DIR / f"{name}.pdf" for name in MANIFEST}

# The server only answers requests addressed to localhost; test clients say so.
LOCAL = "http://127.0.0.1"

MISSING_FIXTURE = (
    "fixture paper {path} is not present. The PDFs are not committed (see "
    "tests/fixtures/papers/SOURCES.md); fetch them once with:\n\n"
    "    python scripts/fetch_fixtures.py\n"
)


@pytest.fixture(params=sorted(FIXTURES))
def paper_name(request) -> str:
    return request.param


@pytest.fixture
def paper_path(paper_name: str) -> Path:
    path = FIXTURES[paper_name]
    if not path.exists():
        pytest.fail(MISSING_FIXTURE.format(path=path), pytrace=False)
    return path


@pytest.fixture(scope="session")
def extracted() -> dict:
    """Every fixture paper extracted once per session; about four seconds each."""
    docs = {}
    for name, path in FIXTURES.items():
        if not path.exists():
            pytest.fail(MISSING_FIXTURE.format(path=path), pytrace=False)
        docs[name] = extract(path)
    return docs


@pytest.fixture
def store_root(tmp_path, extracted) -> Path:
    """A store root with all three papers already in it, laid out per SPEC.md 7."""
    for name, doc in extracted.items():
        folder = tmp_path / "papers" / doc.paper_id
        folder.mkdir(parents=True)
        shutil.copy2(FIXTURES[name], folder / "paper.pdf")
        (folder / "source.json").write_text(doc.model_dump_json(by_alias=True, indent=2))
    return tmp_path
