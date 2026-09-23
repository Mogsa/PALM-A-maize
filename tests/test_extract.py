import re
from pathlib import Path

from paperboard.extract import extract
from paperboard.extract.pymupdf_layout import paper_id_for

_PAPER_ID = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*-[0-9a-f.]+$")


def test_paper_id_is_slug_plus_arxiv_id_when_present(paper_path, paper_name):
    doc = extract(paper_path)
    if paper_name == "attention":
        assert doc.paper_id.endswith("1706.03762")
        assert "attention" in doc.paper_id


def test_paper_id_is_stable_across_runs(paper_path):
    assert extract(paper_path).paper_id == extract(paper_path).paper_id


def test_paper_id_for_strips_non_slug_characters(paper_path):
    assert _PAPER_ID.match(paper_id_for(paper_path, "Adam's Method", "arXiv:1234.5678"))
    assert _PAPER_ID.match(
        paper_id_for(paper_path, "Über Attention: Einführung", "arXiv:1234.5678")
    )
    assert _PAPER_ID.match(
        paper_id_for(paper_path, "Punctuation,  and   Spaces!!", "arXiv:1234.5678")
    )
    non_ascii = paper_id_for(paper_path, "Über Attention: Einführung", "arXiv:1234.5678")
    assert "ü" not in non_ascii
    assert "über" not in non_ascii


def test_paper_id_for_empty_slug_returns_just_the_suffix(paper_path):
    paper_id = paper_id_for(paper_path, "!!! *** ???", "arXiv:1234.5678")
    assert paper_id == "1234.5678"


def test_paper_id_for_falls_back_to_a_content_hash_when_no_arxiv_id(paper_path):
    paper_id = paper_id_for(paper_path, "A Title With No ArXiv Id", "no id on this page")
    suffix = paper_id.rsplit("-", 1)[-1]
    assert re.fullmatch(r"[0-9a-f]{10}", suffix)


def test_paper_id_for_content_hash_is_stable(paper_path):
    first = paper_id_for(paper_path, "Same Title", "no id here")
    second = paper_id_for(paper_path, "Same Title", "no id here")
    assert first == second


def test_paper_id_for_different_pdfs_same_title_get_different_hash_ids():
    fixtures = Path(__file__).parent / "fixtures" / "papers"
    id_a = paper_id_for(fixtures / "attention.pdf", "Identical Title", "no id here")
    id_b = paper_id_for(fixtures / "adam.pdf", "Identical Title", "no id here")
    assert id_a != id_b


def test_extracted_document_is_populated(paper_path):
    doc = extract(paper_path)
    assert doc.schema_version == 1
    assert doc.extractor.startswith("pymupdf-layout/")
    assert doc.pages and doc.sections and doc.regions and doc.page_text


def test_extraction_never_modifies_the_pdf(paper_path):
    before = paper_path.read_bytes()
    extract(paper_path)
    assert paper_path.read_bytes() == before


def test_every_rect_in_the_document_lies_on_a_real_page(paper_path):
    doc = extract(paper_path)
    sizes = {p.index: (p.width, p.height) for p in doc.pages}
    rects = (
        [s.heading_rect for s in doc.sections]
        + [r for s in doc.sections for r in s.extent]
        + [f.rect for f in doc.figures]
    )
    tolerance = 8.0  # points: figure rects are padded by 4, and layout boxes
    # occasionally touch the trim edge.
    for page_rect in rects:
        assert page_rect.page in sizes
        width, height = sizes[page_rect.page]
        x0, y0, x1, y1 = page_rect.rect
        assert -tolerance <= x0 and x1 <= width + tolerance
        assert -tolerance <= y0 and y1 <= height + tolerance
