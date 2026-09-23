import pymupdf
import pytest
from conftest import FIXTURES

from paperboard.snap import SNAP_THRESHOLD, select, text_under
from paperboard.source_model import PageRect


@pytest.fixture(scope="module")
def resnet(extracted):
    pdf = pymupdf.open(FIXTURES["resnet"])
    yield extracted["resnet"], pdf
    pdf.close()


def _first_text_region(doc, page):
    return next(r for r in doc.regions if r.page == page and r.label == "text")


def _slice(region, fraction):
    x0, y0, x1, y1 = region.rect
    return PageRect(page=region.page, rect=(x0, y0, x1, y0 + (y1 - y0) * fraction))


def test_threshold_is_the_named_constant():
    assert SNAP_THRESHOLD == 0.6


def test_text_under_reads_the_words_inside_the_rect(resnet):
    doc, pdf = resnet
    region = _first_text_region(doc, 2)
    text = text_under(pdf[2], region.rect)
    assert len(text) > 100 and "\n" in text


def test_a_rough_drag_over_most_of_a_paragraph_snaps_to_the_whole_region(resnet):
    doc, pdf = resnet
    region = _first_text_region(doc, 2)
    result = select(doc, pdf, [_slice(region, 0.85)], snap=True)
    assert result.region_label == "text"
    assert result.rects == [PageRect(page=2, rect=region.rect)]
    assert result.text == text_under(pdf[2], region.rect)


def test_a_small_selection_stays_exact(resnet):
    doc, pdf = resnet
    region = _first_text_region(doc, 2)
    small = _slice(region, 0.3)
    result = select(doc, pdf, [small], snap=True)
    assert result.rects == [small]
    assert result.region_label == "text"
    assert result.text == text_under(pdf[2], small.rect)


def test_snap_false_keeps_exactly_what_was_selected(resnet):
    doc, pdf = resnet
    region = _first_text_region(doc, 2)
    big = _slice(region, 0.85)
    result = select(doc, pdf, [big], snap=False)
    assert result.rects == [big]


def test_selection_carries_both_anchor_shapes(resnet):
    doc, pdf = resnet
    region = _first_text_region(doc, 2)
    result = select(doc, pdf, [_slice(region, 0.85)], snap=True)
    assert result.highlight is not None
    assert result.highlight.page == 2 and result.highlight.rect == region.rect
    assert result.highlight.quote.exact == result.text.strip()
    assert len(result.highlight.quote.prefix) <= 32 and len(result.highlight.quote.suffix) <= 32
    assert result.chunk.rects == result.rects
    assert result.text.strip().startswith(result.chunk.start.exact[:20])
    assert result.text.strip().endswith(result.chunk.end.exact[-20:])


def test_multi_page_selection_has_no_highlight_anchor_and_does_not_snap(resnet):
    doc, pdf = resnet
    a = _first_text_region(doc, 2)
    b = _first_text_region(doc, 3)
    result = select(doc, pdf, [_slice(a, 0.9), _slice(b, 0.9)], snap=True)
    assert result.highlight is None
    assert [r.page for r in result.rects] == [2, 3]
    assert result.rects[0] == _slice(a, 0.9)


def test_a_page_outside_the_document_is_rejected(resnet):
    doc, pdf = resnet
    with pytest.raises(ValueError):
        select(doc, pdf, [PageRect(page=999, rect=(0, 0, 10, 10))], snap=False)


def _text_regions(doc, page):
    """The page's text regions in reading order, so a test can take a paragraph and its neighbours."""
    return [r for r in doc.regions if r.page == page and r.label == "text"]


def test_text_under_ignores_glyphs_that_only_touch_the_rect(resnet):
    """A rect whose edges run through a neighbouring line's descenders must not pick up
    fragments of that line. Measured on an AAAI paper: a cut came back starting 'gi\\np\\np';
    on this page, character-level extraction gave nine junk lines ('Thi', 'f', 'l i', ...)."""
    doc, pdf = resnet
    above, region, below = _text_regions(doc, 2)[1:4]   # three adjacent paragraphs, 3 pt apart
    x0, y0, x1, y1 = region.rect
    exact = text_under(pdf[2], region.rect)
    # push the edges 1 pt into the paragraphs above and below; the words inside must not change
    # (the neighbours' line boxes are 8.9 pt tall here, so a 1 pt overlap is far below half)
    grown = text_under(pdf[2], (x0, above.rect[3] - 1.0, x1, below.rect[1] + 1.0))
    assert grown == exact
    # shrink it by 2 pt; the first and last lines lose at most their partially covered words,
    # and nothing that was not there before appears
    shrunk = text_under(pdf[2], (x0, y0 + 2.0, x1, y1 - 2.0))
    assert set(shrunk.split()) <= set(exact.split())


def test_text_under_keeps_line_breaks_and_reading_order(resnet):
    doc, pdf = resnet
    region = _text_regions(doc, 2)[2]
    lines = text_under(pdf[2], region.rect).strip().split("\n")
    assert len(lines) > 3
    assert all(line == line.strip() and "  " not in line for line in lines)


def test_snap_never_shrinks_a_drag_that_runs_into_the_next_paragraph(resnet):
    """A drag over all of one paragraph and the top half of the next, midpoint in the
    first: coverage is the first paragraph's characters inside the drag over its own,
    and the snapped rect is the union of paragraph and drag, so nothing dragged over
    is dropped (it used to come back as the first paragraph alone)."""
    doc, pdf = resnet
    first, second = _text_regions(doc, 2)[1:3]
    x0, y0, x1, _ = first.rect
    drag = PageRect(page=2, rect=(x0, y0, x1, (second.rect[1] + second.rect[3]) / 2))
    result = select(doc, pdf, [drag], snap=True)
    assert result.region_label == "text"
    assert result.rects == [PageRect(page=2, rect=drag.rect)]
    assert text_under(pdf[2], second.rect).split("\n")[0] in result.text
