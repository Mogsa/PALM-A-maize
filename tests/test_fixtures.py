import pymupdf
import pymupdf4llm
import pymupdf.layout  # noqa: F401  -- import must not touch the network

from conftest import FIXTURES


def test_version_triplet_matches():
    assert pymupdf.__version__ == pymupdf4llm.__version__ == "1.28.2"


def test_every_fixture_opens_and_has_pages(paper_path):
    with pymupdf.open(paper_path) as doc:
        assert doc.page_count > 5


def test_fixtures_are_small_enough_to_commit():
    assert sum(p.stat().st_size for p in FIXTURES.values()) < 5_000_000
