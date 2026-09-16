from pathlib import Path

import pytest

FIXTURE_DIR = Path(__file__).parent / "fixtures"
PAPER_DIR = FIXTURE_DIR / "papers"
GOLDEN_DIR = FIXTURE_DIR / "golden"

FIXTURES = {
    "attention": PAPER_DIR / "attention.pdf",
    "resnet": PAPER_DIR / "resnet.pdf",
    "adam": PAPER_DIR / "adam.pdf",
}


@pytest.fixture(params=sorted(FIXTURES))
def paper_name(request) -> str:
    return request.param


@pytest.fixture
def paper_path(paper_name: str) -> Path:
    return FIXTURES[paper_name]
