from pathlib import Path

import pymupdf

from paperboard.extract.pymupdf_layout import read_page_text, read_regions


def test_page_text_covers_every_page_in_order(paper_path):
    pages, _ = read_regions(paper_path)
    text = read_page_text(paper_path)
    assert [t.page for t in text] == list(range(len(pages)))


def test_page_text_is_not_empty_for_a_body_page(paper_path):
    assert len(read_page_text(paper_path)[1].text) > 200


def test_page_text_is_byte_identical_to_pymupdf_get_text(paper_path):
    """Page text must be byte-identical to pymupdf.Page.get_text().

    SPEC-ADDENDUM.md sections 3 and 5.2: the anchoring matcher in a later plan
    strips whitespace itself and uses the original text to map character offsets
    back to the PDF page. Any transformation here (strip, collapse, etc.) breaks
    offset calculation.
    """
    text = read_page_text(paper_path)
    with pymupdf.open(paper_path) as doc:
        for page_num in range(doc.page_count):
            expected = doc[page_num].get_text()
            actual = text[page_num].text
            assert actual == expected, f"Page {page_num} text mismatch"


def test_page_text_preserves_whitespace_structure(paper_path):
    """Body page text must contain newlines and not be whitespace-collapsed.

    SPEC-ADDENDUM.md sections 3 and 5.2: anchoring maps character offsets
    against the original text structure. Collapsing whitespace (e.g. joining
    split lines) silently breaks offset mapping in the anchoring plan. This test
    catches any future "normalisation" that would break re-anchoring.
    """
    text = read_page_text(paper_path)
    body_page_text = text[1].text  # page 1 is guaranteed body text by other tests

    # Must contain newlines (structure is preserved)
    assert "\n" in body_page_text, "Body page should contain newline characters"

    # Must not equal its own whitespace-collapsed form
    collapsed = " ".join(body_page_text.split())
    assert body_page_text != collapsed, "Page text should not be whitespace-collapsed"

    # Text from any page must not have been stripped from the raw extraction, since
    # the anchoring matcher needs the original whitespace structure including
    # leading/trailing whitespace to map character offsets correctly.
    with pymupdf.open(paper_path) as doc:
        for page_num in range(doc.page_count):
            extracted = text[page_num].text
            raw = doc[page_num].get_text()
            assert extracted == raw, f"Page {page_num}: text was modified (e.g. stripped) from raw extraction"
