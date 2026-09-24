"""A chunk's blocks (addendum 4.0): for each chunk rect, the layout regions under
it in reading order; text regions by overlap, showing the words inside, and
formulas, pictures and tables by midpoint, whole."""

import pymupdf
import pytest
from conftest import FIXTURES

from paperboard.blocks import chunk_blocks, join_hyphens, paper_words
from paperboard.geometry import intersection
from paperboard.source_model import PageRect
from paperboard.words import text_under


@pytest.fixture(scope="module")
def resnet(extracted):
    pdf = pymupdf.open(FIXTURES["resnet"])
    yield extracted["resnet"], pdf
    pdf.close()


@pytest.fixture(scope="module")
def adam(extracted):
    pdf = pymupdf.open(FIXTURES["adam"])
    yield extracted["adam"], pdf
    pdf.close()


def _column_around(doc, formula, above: float, below: float) -> PageRect:
    """A column-wide chunk rect from `above` points over a formula to `below` points under it."""
    x0 = min(r.rect[0] for r in doc.regions if r.page == formula.page and r.label == "text")
    x1 = max(r.rect[2] for r in doc.regions if r.page == formula.page and r.label == "text")
    return PageRect(page=formula.page, rect=(x0, formula.rect[1] - above, x1, formula.rect[3] + below))


def _first_formula(doc, page):
    return next(r for r in doc.regions if r.page == page and r.label == "formula")


def test_a_paragraph_is_one_text_block_of_the_overlap_holding_its_words(resnet):
    doc, pdf = resnet
    region = [r for r in doc.regions if r.page == 2 and r.label == "text"][2]
    x0, y0, x1, y1 = region.rect
    loose = PageRect(page=2, rect=(x0 - 10, y0 - 1, x1 + 10, y1 + 1))
    [block] = chunk_blocks(doc, pdf, [loose])
    assert (block.kind, block.page, block.rect) == ("text", 2, region.rect)
    assert block.text.split()[:5] == text_under(pdf[2], region.rect).split()[:5]
    assert "\n" in block.text   # keeps the paper's line breaks for the card to reflow


def test_a_cut_starting_mid_paragraph_shows_exactly_its_words(resnet):
    doc, pdf = resnet
    region = [r for r in doc.regions if r.page == 2 and r.label == "text"][2]
    x0, y0, x1, y1 = region.rect
    lower = PageRect(page=2, rect=(x0, (y0 + y1) / 2, x1, y1 + 30))
    first = chunk_blocks(doc, pdf, [lower])[0]
    assert first.rect == intersection(region.rect, lower.rect)
    assert first.text.split("\n")[0] == text_under(pdf[2], first.rect).split("\n")[0]


def test_a_formula_inside_the_chunk_is_a_whole_clip_between_its_paragraphs(adam):
    doc, pdf = adam
    formula = _first_formula(doc, 2)
    blocks = chunk_blocks(doc, pdf, [_column_around(doc, formula, 30, 30)])
    kinds = [b.kind for b in blocks]
    assert "clip" in kinds and kinds[0] == "text" and kinds[-1] == "text"
    clip = next(b for b in blocks if b.kind == "clip")
    assert (clip.page, clip.rect, clip.label) == (2, formula.rect, "formula")


def test_a_formula_cut_in_half_is_left_out(adam):
    doc, pdf = adam
    formula = _first_formula(doc, 2)
    height = formula.rect[3] - formula.rect[1]
    half = _column_around(doc, formula, 30, -0.7 * height)   # ends above the formula's midpoint
    assert all(b.kind == "text" for b in chunk_blocks(doc, pdf, [half]))


def test_a_picture_whose_midpoint_is_inside_is_a_clip_labelled_picture(resnet):
    doc, pdf = resnet
    picture = next(r for r in doc.regions if r.page == 3 and r.label == "picture")
    x0, y0, x1, y1 = picture.rect
    blocks = chunk_blocks(doc, pdf, [PageRect(page=3, rect=(x0 + 20, y0 + 20, x1 - 20, y1 - 20))])
    assert [(b.kind, b.rect, b.label) for b in blocks if b.kind == "clip"] == [("clip", picture.rect, "picture")]


def test_page_furniture_never_contributes(resnet):
    doc, pdf = resnet
    page = pdf[2].rect
    blocks = chunk_blocks(doc, pdf, [PageRect(page=2, rect=(0.0, 0.0, page.width, page.height))])
    furniture = [r.rect for r in doc.regions if r.page == 2 and r.label in ("page-header", "page-footer")]
    assert furniture, "the fixture page must have furniture"
    assert not any(b.rect == rect for b in blocks for rect in furniture)
    regions = [r for r in doc.regions if r.page == 2 and r.label not in ("page-header", "page-footer")]
    assert [b.rect for b in blocks] == [r.rect for r in regions if r.label in ("formula", "picture", "table")
                                        or text_under(pdf[2], r.rect).strip()]


def test_blocks_follow_the_chunk_rects_in_turn(resnet):
    doc, pdf = resnet
    texts = [r for r in doc.regions if r.page == 2 and r.label == "text"]
    second, first = texts[3], texts[1]
    blocks = chunk_blocks(doc, pdf, [PageRect(page=2, rect=second.rect), PageRect(page=2, rect=first.rect)])
    assert [b.rect for b in blocks] == [second.rect, first.rect]


def test_a_rect_with_no_whole_line_inside_contributes_nothing(resnet):
    doc, pdf = resnet
    assert chunk_blocks(doc, pdf, [PageRect(page=2, rect=(0.0, 0.0, 5.0, 5.0))]) == []


def test_a_line_end_hyphen_is_joined_only_when_the_joined_word_is_in_the_paper():
    words = {"representation", "algorithms"}
    text = "a rep-\nresentation of algo-\nrithms, state-of-the-\nart and equiv-\nalent\n"
    assert join_hyphens(text, words) == "a representation of algorithms, state-of-the-\nart and equiv-\nalent\n"


def test_paper_words_are_every_word_of_every_page_in_lower_case(resnet):
    doc, _pdf = resnet
    words = paper_words(doc)
    assert "residual" in words and "Residual" not in words
    assert "asymptotically" in words
