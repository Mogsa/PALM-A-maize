import json
import shutil
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from paperboard.extract import extract

FIXTURE_DIR = Path(__file__).parent / "fixtures"
PAPER_DIR = FIXTURE_DIR / "papers"
GOLDEN_DIR = FIXTURE_DIR / "golden"
MANIFEST = json.loads((PAPER_DIR / "MANIFEST.json").read_text())

# A paper marked with a "suite" serves only that suite's tests; the rest run
# over every paper in the shared set, each with a golden file.
FIXTURES = {name: PAPER_DIR / f"{name}.pdf" for name, entry in MANIFEST.items() if "suite" not in entry}
SECTION_FIXTURES = {name: PAPER_DIR / f"{name}.pdf" for name, entry in MANIFEST.items()
                    if entry.get("suite") == "sections"}

# The server only answers requests addressed to localhost; test clients say so.
LOCAL = "http://127.0.0.1"
# And refuses a write without this header (addendum section 6); the web client sends it on every request.
APP_HEADERS = {"X-Paperboard": "1"}


def local_client(app, **kwargs) -> TestClient:
    """A test client as the web client is: addressed to localhost, sending the app's header."""
    return TestClient(app, base_url=LOCAL, headers=APP_HEADERS, **kwargs)

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
