import json
from pathlib import Path

import pytest

FIXTURE_DIR = Path(__file__).parent / "fixtures"
PAPER_DIR = FIXTURE_DIR / "papers"
GOLDEN_DIR = FIXTURE_DIR / "golden"
MANIFEST = json.loads((PAPER_DIR / "MANIFEST.json").read_text())

FIXTURES = {name: PAPER_DIR / f"{name}.pdf" for name in MANIFEST}

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
