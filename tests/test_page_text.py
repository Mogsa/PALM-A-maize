from paperboard.extract.pymupdf_layout import read_page_text, read_regions


def test_page_text_covers_every_page_in_order(paper_path):
    pages, _ = read_regions(paper_path)
    text = read_page_text(paper_path)
    assert [t.page for t in text] == list(range(len(pages)))


def test_page_text_is_not_empty_for_a_body_page(paper_path):
    assert len(read_page_text(paper_path)[1].text) > 200
