"""Words selected in a chunk on the board, found again inside its region, and the
highlight made from them (addendum 4.10, D20)."""

import pymupdf
import pytest
from conftest import FIXTURES

from paperboard.anchoring import build_index
from paperboard.board_model import Board, ChunkData, QuoteSelector
from paperboard.chunk_text import QuoteNotFound, highlight_in_chunk, lines_in_region
from paperboard.geometry import contains_point, midpoint
from paperboard.snap import select
from paperboard.split import split

SHORTCUTS = "The shortcut connections in Eqn.(1) introduce neither extra parameter nor computation complexity."


@pytest.fixture(scope="module")
def resnet(extracted):
    doc = extracted["resnet"]
    pdf = pymupdf.open(FIXTURES["resnet"])
    yield doc, pdf
    pdf.close()


def _section(doc, pdf, number: str) -> ChunkData:
    """The chunk split makes for a section: §3.2 of ResNet runs down both columns of page 2."""
    section = next(s for s in doc.sections if s.number == number)
    draft = next(d for d in split(doc, Board(paper_id=doc.paper_id), pdf) if d["data"]["source_id"] == section.id)
    return ChunkData.model_validate(draft["data"])


def _inside(line, rects) -> bool:
    return any(r.page == line.page and contains_point(r.rect, *midpoint(line.rect)) for r in rects)


def test_a_sentence_on_a_card_becomes_a_highlight_of_its_own_lines(resnet):
    doc, pdf = resnet
    region = _section(doc, pdf, "3.2").region
    anchor = highlight_in_chunk(doc, pdf, region, QuoteSelector(exact=SHORTCUTS, prefix="for simplifying notations. "))
    assert anchor.quote.exact.split()[:3] == ["The", "shortcut", "connections"]
    assert anchor.quote.exact.split()[-1] == "complexity."
    assert len(anchor.rects) == 2                              # two printed lines, one rect each (D1)
    assert all(_inside(line, region.rects) for line in anchor.rects)
    assert anchor.quote.prefix and anchor.quote.suffix       # the page's own text either side


def test_the_highlight_is_the_one_the_paper_would_make_from_the_same_lines(resnet):
    doc, pdf = resnet
    region = _section(doc, pdf, "3.2").region
    anchor = highlight_in_chunk(doc, pdf, region, QuoteSelector(exact=SHORTCUTS))
    paper = select(doc, pdf, anchor.rects, snap=False, lines=anchor.rects).highlight
    assert anchor == paper


def test_a_phrase_twice_in_the_chunk_is_marked_where_it_was_selected(resnet):
    """Review Focus 1: "Eqn.(1)" is in §3.2 four times; prefix and suffix pick the one selected."""
    doc, pdf = resnet
    region = _section(doc, pdf, "3.2").region
    first = highlight_in_chunk(doc, pdf, region, QuoteSelector(exact="Eqn.(1)", prefix="The shortcut connections in ", suffix=" introduce neither"))
    second = highlight_in_chunk(doc, pdf, region, QuoteSelector(exact="Eqn.(1)", prefix="dimensions of x and F must be equal in ", suffix=".\nIf this"))
    assert first.rects != second.rects
    assert first.rects[0].rect[1] < second.rects[0].rect[1]   # the first is higher in the right column


def test_words_across_a_displayed_equation_take_the_lines_on_both_sides(resnet):
    """Review Focus 2: the card joins its text blocks with a line break and shows the equation as an image."""
    doc, pdf = resnet
    region = _section(doc, pdf, "3.2").region
    quote = QuoteSelector(exact="we consider a building block defined as:\nHere x and y are the input")
    anchor = highlight_in_chunk(doc, pdf, region, quote)
    assert anchor.quote.exact.startswith("we consider") and anchor.quote.exact.endswith("the input")
    assert anchor.rects[0].rect[1] < 626 < anchor.rects[-1].rect[1]   # equation (1) sits at y 626 on page 2


def test_words_outside_the_chunk_are_not_found_even_when_they_are_in_the_paper(resnet):
    doc, pdf = resnet
    region = _section(doc, pdf, "3.2").region
    with pytest.raises(QuoteNotFound):
        highlight_in_chunk(doc, pdf, region, QuoteSelector(exact="Let us consider H(x) as an underlying mapping"))


def test_the_lines_found_are_inside_the_region_in_reading_order(resnet):
    doc, pdf = resnet
    region = _section(doc, pdf, "3.2").region
    lines = lines_in_region(pdf, build_index(doc), region, QuoteSelector(exact=SHORTCUTS))
    assert [line.page for line in lines] == [2, 2]
    assert lines[0].rect[1] < lines[1].rect[1]


@pytest.fixture(scope="module")
def attention(extracted):
    doc = extracted["attention"]
    pdf = pymupdf.open(FIXTURES["attention"])
    yield doc, pdf
    pdf.close()


def test_words_across_a_page_break_take_the_lines_on_both_pages_and_nothing_between(attention):
    """Attention §3 runs from page 1 onto page 2; the page number "2" lies between in the page text."""
    doc, pdf = attention
    region = _section(doc, pdf, "3").region
    quote = QuoteSelector(exact="symbols as additional input when generating the next.\nFigure 1: The Transformer - model architecture.")
    anchor = highlight_in_chunk(doc, pdf, region, quote)
    assert {line.page for line in anchor.rects} == {1, 2}
    assert all(_inside(line, region.rects) for line in anchor.rects)
    assert "\n2\n" not in anchor.quote.exact


def test_a_word_joined_across_a_line_end_is_marked_where_it_was_selected(resnet):
    """The card shows "de-\\ntection" as "detection", which is also printed whole elsewhere in §4.3."""
    doc, pdf = resnet
    region = _section(doc, pdf, "4.3").region
    quote = QuoteSelector(exact="detection", prefix="We adopt Faster R-CNN [32] as the ", suffix=" method. Here we are interested")
    anchor = highlight_in_chunk(doc, pdf, region, quote)
    assert anchor.quote.exact.split()[0] == "de-"
    assert anchor.quote.prefix.endswith("as the ")
