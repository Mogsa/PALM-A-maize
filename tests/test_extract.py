import pymupdf

from paperboard.extract import extract
from paperboard.extract.pymupdf_layout import paper_id_for


def test_paper_id_is_slug_plus_arxiv_id_when_present(paper_path, paper_name):
    doc = extract(paper_path)
    if paper_name == "attention":
        assert doc.paper_id.endswith("1706.03762")
        assert "attention" in doc.paper_id


def test_paper_id_is_stable_across_runs(paper_path):
    assert extract(paper_path).paper_id == extract(paper_path).paper_id


def test_paper_id_is_filesystem_safe(paper_path):
    assert extract(paper_path).paper_id.replace("-", "").replace(".", "").isalnum()


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
    for page_rect in rects:
        assert page_rect.page in sizes
