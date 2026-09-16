import hashlib

import pymupdf
import pymupdf4llm
import pymupdf.layout  # noqa: F401  -- import must not touch the network

from conftest import MANIFEST


def test_version_triplet_matches():
    assert pymupdf.__version__ == pymupdf4llm.__version__ == "1.28.2"


def test_every_fixture_opens_and_has_pages(paper_path):
    with pymupdf.open(paper_path) as doc:
        assert doc.page_count > 5


def test_every_fixture_matches_its_manifest_hash(paper_path, paper_name):
    """The suite is calibrated to these exact files. A different version of the
    same paper would pass every smoke test and fail the goldens for no visible reason."""
    digest = hashlib.sha256(paper_path.read_bytes()).hexdigest()
    assert digest == MANIFEST[paper_name]["sha256"]
    assert paper_path.stat().st_size == MANIFEST[paper_name]["bytes"]
