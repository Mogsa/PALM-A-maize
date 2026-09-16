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
