import pymupdf
import pytest
from conftest import FIXTURES

from paperboard.anchoring import build_index, global_position
from paperboard.geometry import contains_point, midpoint, union
from paperboard.snap import SNAP_THRESHOLD, select
from paperboard.source_model import PageRect
from paperboard.words import line_rects_under, lines_under, text_under


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
    assert result.highlight.rects == [PageRect(page=2, rect=r) for r in line_rects_under(pdf[2], region.rect)]
    assert result.highlight.quote.exact == result.text.strip()
    assert len(result.highlight.quote.prefix) <= 32 and len(result.highlight.quote.suffix) <= 32
    assert result.chunk.rects == result.rects
    assert result.text.strip().startswith(result.chunk.start.exact[:20])
    assert result.text.strip().endswith(result.chunk.end.exact[-20:])


def test_multi_page_selection_has_a_highlight_across_its_pages_and_does_not_snap(resnet):
    doc, pdf = resnet
    a = _first_text_region(doc, 2)
    b = _first_text_region(doc, 3)
    result = select(doc, pdf, [_slice(a, 0.9), _slice(b, 0.9)], snap=True)
    assert [r.page for r in result.rects] == [2, 3]
    assert result.rects[0] == _slice(a, 0.9)
    lines = [PageRect(page=r.page, rect=line) for r in result.rects for line in line_rects_under(pdf[r.page], r.rect)]
    assert result.highlight.rects == lines


def test_a_highlight_across_a_page_break_is_quoted_from_both_pages(resnet):
    """Per-line (D1): the quote's prefix comes from the page it starts on, its suffix
    from the page it ends on, and `position` points at its start on the first page."""
    doc, pdf = resnet
    a, b = _text_regions(doc, 2)[-1], _first_text_region(doc, 3)
    result = select(doc, pdf, [_slice(a, 0.9), _slice(b, 0.9)], snap=False)
    quote = result.highlight.quote
    first_words = text_under(pdf[2], _slice(a, 0.9).rect).split()[:4]
    last_words = text_under(pdf[3], _slice(b, 0.9).rect).split()[-4:]
    assert quote.exact.split()[:4] == first_words and quote.exact.split()[-4:] == last_words
    assert quote.prefix and quote.suffix
    assert " ".join(doc.page_text[3].text.split()).count(" ".join(quote.suffix.split())) >= 1
    index = build_index(doc)
    at = result.highlight.position - global_position(index, 2, 0)
    assert 0 <= at < len(doc.page_text[2].text)
    assert "".join(doc.page_text[2].text[at:].split()).startswith("".join(first_words))


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


def test_a_selection_across_columns_gives_a_highlight_one_rect_per_line(resnet):
    """Schema 2: `highlight` is never null, and holds one rect per line of every run,
    each inside its own column (D1)."""
    doc, pdf = resnet
    left, right = _text_regions(doc, 2)[1], next(r for r in _text_regions(doc, 2) if r.rect[0] > 300)
    runs = [PageRect(page=2, rect=left.rect), PageRect(page=2, rect=right.rect)]
    result = select(doc, pdf, runs, snap=True)
    lefts = line_rects_under(pdf[2], left.rect)
    rights = line_rects_under(pdf[2], right.rect)
    assert [r.rect for r in result.highlight.rects] == lefts + rights
    assert all(contains_point(left.rect, *midpoint(r)) for r in lefts)
    assert all(contains_point(right.rect, *midpoint(r)) for r in rights)
    assert result.highlight.quote.exact and result.highlight.quote.prefix


def test_a_highlight_paints_only_the_words_selected_on_its_first_line(resnet):
    """A drag from halfway along a line: the first line rect starts where the words do."""
    doc, pdf = resnet
    region = _text_regions(doc, 2)[2]
    x0, y0, x1, y1 = region.rect
    half = (x0 + x1) / 2
    first_line = line_rects_under(pdf[2], region.rect)[0]
    drag = [PageRect(page=2, rect=(half, y0, x1, first_line[3])), PageRect(page=2, rect=(x0, first_line[3], x1, y1))]
    rects = select(doc, pdf, drag, snap=False).highlight.rects
    assert rects[0].rect[0] >= half - 30
    assert rects[1].rect[0] == pytest.approx(x0, abs=2)


def _mid_line_selection(pdf, region):
    """What the browser sends for a selection from the third word of a paragraph's
    first line to the third-last word of its last: the column run, and its own
    per-line rects (shared contract 1). Returns those and the first and last
    words selected."""
    printed = line_rects_under(pdf[2], region.rect)
    first_words = [w for line in lines_under(pdf[2], printed[0]) for w in line]
    last_words = [w for line in lines_under(pdf[2], printed[-1]) for w in line]
    start, end = first_words[2], last_words[-3]
    lines = [PageRect(page=2, rect=(start[0], *printed[0][1:]))]
    lines += [PageRect(page=2, rect=r) for r in printed[1:-1]]
    lines.append(PageRect(page=2, rect=(*printed[-1][:2], end[2], printed[-1][3])))
    return [PageRect(page=2, rect=region.rect)], lines, start, end


def test_a_selection_with_its_lines_paints_only_the_words_selected(resnet):
    """D1: the browser's own line rects decide the first and last line, so a
    selection that starts and ends mid-line leaves both unselected ends unpainted."""
    doc, pdf = resnet
    region = _text_regions(doc, 2)[2]
    runs, lines, start, end = _mid_line_selection(pdf, region)
    highlight = select(doc, pdf, runs, snap=False, lines=lines).highlight
    assert highlight.rects[0].rect[0] == pytest.approx(start[0])
    assert highlight.rects[-1].rect[2] == pytest.approx(end[2])
    assert len(highlight.rects) == len(lines)
    assert highlight.quote.exact.startswith(start[4])
    assert highlight.quote.exact.endswith(end[4])
    assert highlight.quote.prefix.strip() and highlight.quote.suffix.strip()
    index = build_index(doc)
    assert highlight.position > global_position(index, 2, 0)


def test_a_selection_without_lines_paints_whole_first_and_last_lines(resnet):
    doc, pdf = resnet
    region = _text_regions(doc, 2)[2]
    runs, _lines, start, _end = _mid_line_selection(pdf, region)
    highlight = select(doc, pdf, runs, snap=False).highlight
    assert [r.rect for r in highlight.rects] == line_rects_under(pdf[2], region.rect)
    assert highlight.rects[0].rect[0] < start[0]


def test_lines_do_not_stop_a_snap_to_the_whole_region(resnet):
    doc, pdf = resnet
    region = _first_text_region(doc, 2)
    _runs, lines, _start, _end = _mid_line_selection(pdf, region)
    result = select(doc, pdf, [_slice(region, 0.85)], snap=True, lines=lines)
    assert result.rects == [PageRect(page=2, rect=region.rect)]
    assert [r.rect for r in result.highlight.rects] == line_rects_under(pdf[2], region.rect)


def test_a_selection_carries_the_blocks_a_cut_of_it_would_show(resnet):
    doc, pdf = resnet
    region = _first_text_region(doc, 2)
    result = select(doc, pdf, [PageRect(page=2, rect=region.rect)], snap=False)
    assert [(b.kind, b.page, b.rect) for b in result.blocks] == [("text", 2, region.rect)]
    assert result.blocks[0].text == text_under(pdf[2], region.rect)


# -- the forgiving rectangle (D3, addendum 5.3) --------------------------------


@pytest.fixture(scope="module")
def adam(extracted):
    pdf = pymupdf.open(FIXTURES["adam"])
    yield extracted["adam"], pdf
    pdf.close()


def _covering(region, coverage: float, margin: float = 12.0) -> PageRect:
    """A loose rectangle that covers the top `coverage` of a region's area and runs
    `margin` points past it on the other three sides."""
    x0, y0, x1, y1 = region.rect
    return PageRect(page=region.page, rect=(x0 - margin, y0 - margin, x1 + margin, y0 + (y1 - y0) * coverage))


def _figure_of(doc, region):
    return next(f for f in doc.figures if f.rect.page == region.page and contains_point(f.rect.rect, *midpoint(region.rect)))


def test_a_rectangle_over_most_of_a_picture_snaps_to_it_and_its_caption(resnet):
    doc, pdf = resnet
    picture = next(r for r in doc.regions if r.page == 3 and r.label == "picture")
    caption = _figure_of(doc, picture).caption_rect
    result = select(doc, pdf, [_covering(picture, 0.7)], snap=True, mode="area")
    snapped = PageRect(page=3, rect=union(picture.rect, caption.rect))
    assert result.rects == [snapped] and result.region_label == "picture"
    assert result.highlight.rects == [snapped] and result.chunk.rects == [snapped]
    assert [(b.kind, b.page, b.rect, b.label) for b in result.blocks] == [("clip", 3, snapped.rect, "picture")]
    assert 0 < len(result.highlight.quote.exact) <= 256


def test_a_rectangle_over_half_a_picture_stays_exact(resnet):
    doc, pdf = resnet
    picture = next(r for r in doc.regions if r.page == 3 and r.label == "picture")
    drag = _covering(picture, 0.5)
    result = select(doc, pdf, [drag], snap=True, mode="area")
    assert result.rects == [drag] and result.highlight.rects == [drag]
    assert result.region_label is None
    assert [(b.kind, b.rect, b.label) for b in result.blocks] == [("clip", drag.rect, None)]


def test_a_rectangle_over_most_of_a_formula_snaps_to_the_formula_alone(adam):
    doc, pdf = adam
    formula = next(r for r in doc.regions if r.page == 2 and r.label == "formula")
    result = select(doc, pdf, [_covering(formula, 0.7, margin=3.0)], snap=True, mode="area")
    assert result.rects == [PageRect(page=2, rect=formula.rect)]
    assert [(b.kind, b.label) for b in result.blocks] == [("clip", "formula")]


def test_a_rectangle_over_half_a_formula_stays_exact(adam):
    doc, pdf = adam
    formula = next(r for r in doc.regions if r.page == 2 and r.label == "formula")
    drag = _covering(formula, 0.5, margin=3.0)
    result = select(doc, pdf, [drag], snap=True, mode="area")
    assert result.rects == [drag] and result.blocks[0].label is None


def test_snap_false_keeps_the_exact_rectangle_over_a_whole_picture(resnet):
    doc, pdf = resnet
    picture = next(r for r in doc.regions if r.page == 3 and r.label == "picture")
    drag = _covering(picture, 0.9)
    result = select(doc, pdf, [drag], snap=False, mode="area")
    assert result.rects == [drag] and result.region_label is None


def test_a_rectangle_around_two_figures_snaps_to_the_smaller(resnet):
    doc, pdf = resnet
    table, picture = (next(r for r in doc.regions if r.page == 4 and r.label == label) for label in ("table", "picture"))
    drag = PageRect(page=4, rect=union(table.rect, picture.rect))
    result = select(doc, pdf, [drag], snap=True, mode="area")
    smaller = min((table, picture), key=lambda r: (r.rect[2] - r.rect[0]) * (r.rect[3] - r.rect[1]))
    caption = _figure_of(doc, smaller).caption_rect
    assert result.rects == [PageRect(page=4, rect=union(smaller.rect, caption.rect))]
    assert result.region_label == smaller.label


def test_an_area_selection_is_exactly_one_rectangle(resnet):
    doc, pdf = resnet
    picture = next(r for r in doc.regions if r.page == 3 and r.label == "picture")
    with pytest.raises(ValueError):
        select(doc, pdf, [_covering(picture, 0.7), _covering(picture, 0.7)], snap=True, mode="area")
