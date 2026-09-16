from paperboard.extract.pymupdf_layout import read_regions

LABELS = {
    "title", "section-header", "text", "list-item", "caption",
    "picture", "table", "formula", "footnote", "page-header", "page-footer",
}


def test_pages_are_zero_indexed_and_sized(paper_path):
    pages, _ = read_regions(paper_path)
    assert pages[0].index == 0
    assert [p.index for p in pages] == list(range(len(pages)))
    assert all(p.width > 0 and p.height > 0 for p in pages)


def test_every_region_uses_a_known_label(paper_path):
    _, regions = read_regions(paper_path)
    assert regions
    assert {r.label for r in regions} <= LABELS


def test_every_region_lies_inside_its_page(paper_path):
    pages, regions = read_regions(paper_path)
    for region in regions:
        page = pages[region.page]
        x0, y0, x1, y1 = region.rect
        assert x0 < x1 and y0 < y1
        # A one-point slop: layout boxes occasionally touch the trim edge.
        assert -1 <= x0 and x1 <= page.width + 1
        assert -1 <= y0 and y1 <= page.height + 1


def test_resnet_has_section_headers_without_a_pdf_outline(paper_path, paper_name):
    if paper_name != "resnet":
        return
    _, regions = read_regions(paper_path)
    headers = [r for r in regions if r.label == "section-header"]
    assert len(headers) >= 10
    assert any("Residual Learning" in r.text for r in headers)


def test_page_zero_title_box_holds_the_paper_title(paper_path, paper_name):
    """parse_document numbers pages from 1. Off by one, and every box reads the
    text of the following page. This is the test that catches it.

    The label is deliberately not asserted: the model labels the title box
    `section-header` on two of the three fixtures (attention, adam) and `title`
    only on resnet. What matters for the off-by-one is that the paper title's
    text shows up somewhere on page 0, regardless of which label it got."""
    _, regions = read_regions(paper_path)
    page_zero_text = " ".join(r.text for r in regions if r.page == 0)
    expected = {
        "attention": "Attention Is All You Need",
        "resnet": "Deep Residual Learning",
        "adam": "ADAM",
    }[paper_name]
    assert expected.lower() in page_zero_text.lower()
