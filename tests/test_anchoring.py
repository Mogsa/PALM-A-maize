import pymupdf
import pytest
from conftest import FIXTURES

from paperboard.anchoring import (
    PageIndex,
    build_index,
    find_quote,
    global_position,
    rect_for_offsets,
    rects_for_text,
    resolve_chunk,
    resolve_highlight,
    strip_whitespace,
)
from paperboard.board_model import ChunkAnchor, HighlightAnchor, QuoteSelector
from paperboard.geometry import contains_point, midpoint, overlap_ratio
from paperboard.snap import select
from paperboard.source_model import FURNITURE, PageRect


def test_strip_whitespace_maps_offsets_back():
    stripped, offsets = strip_whitespace("a b\n c")
    assert stripped == "abc"
    assert offsets == [0, 2, 5]


@pytest.fixture(scope="module")
def resnet(extracted):
    doc = extracted["resnet"]
    pdf = pymupdf.open(FIXTURES["resnet"])
    yield doc, build_index(doc), pdf
    pdf.close()


def _selector(text: str, exact: str) -> tuple[QuoteSelector, int]:
    at = text.index(exact)
    return QuoteSelector(exact=exact, prefix=text[max(0, at - 32):at], suffix=text[at + len(exact):at + len(exact) + 32]), at


def _end_quote(doc, section) -> str:
    """The last 60 characters of a section, taken from the page's own text just
    before the next heading, so `text.index` finds them verbatim."""
    ordinal = int(section.id.split("-")[1])
    following = next(s for s in doc.sections if s.id == f"sec-{ordinal + 1}")
    page_text = doc.page_text[following.heading_rect.page].text
    stop = page_text.index(" ".join(following.title.split()[:2]))
    return page_text[stop - 60:stop].strip()


def test_exact_quote_is_found_on_its_page_with_full_score(resnet):
    doc, index, _ = resnet
    text = doc.page_text[2].text
    quote, at = _selector(text, "Let us consider H(x) as an underlying mapping")
    match = find_quote(index, quote, global_position(index, 2, at), page_hint=2)
    assert match is not None and match.page == 2
    assert text[match.start:match.end] == quote.exact
    assert match.score == pytest.approx(1.0, abs=0.02)


def test_quote_survives_whitespace_and_line_break_changes(resnet):
    doc, index, _ = resnet
    text = doc.page_text[2].text
    quote, at = _selector(text, "Let us consider H(x) as an underlying mapping")
    quote.exact = "Let  us\nconsider H(x)   as an underlying\nmapping"
    match = find_quote(index, quote, global_position(index, 2, at), page_hint=2)
    assert match is not None and match.page == 2
    assert match.score > 0.95


def test_quote_survives_an_inserted_word_with_a_lower_score(resnet):
    doc, index, _ = resnet
    text = doc.page_text[2].text
    quote, at = _selector(text, "Let us consider H(x) as an underlying mapping")
    quote.exact = "Let us consider carefully H(x) as an underlying mapping"
    match = find_quote(index, quote, global_position(index, 2, at), page_hint=2)
    assert match is not None and match.page == 2
    assert 0.5 <= match.score < 0.98


def test_quote_is_found_on_the_right_page_without_a_hint(resnet):
    doc, index, _ = resnet
    text = doc.page_text[2].text
    quote, _at = _selector(text, "Let us consider H(x) as an underlying mapping")
    match = find_quote(index, quote, position=0, page_hint=0)
    assert match is not None and match.page == 2


def test_context_disambiguates_a_repeated_phrase(resnet):
    doc, index, _ = resnet
    # "shortcut connections" occurs on several pages; the prefix picks page 1's.
    text = doc.page_text[1].text
    quote, at = _selector(text, "shortcut connections")
    match = find_quote(index, quote, global_position(index, 1, at), page_hint=5)
    assert match is not None and match.page == 1


def test_deleted_sentence_is_not_found(resnet):
    _doc, index, _ = resnet
    quote = QuoteSelector(exact="This sentence was never in the paper at all, honestly.")
    assert find_quote(index, quote, position=0, page_hint=2) is None


def test_rects_for_text_returns_the_lines_bounding_box(resnet):
    _doc, _, pdf = resnet
    rect = rects_for_text(pdf[2], "Let us consider H(x) as an underlying mapping")
    assert rect is not None
    x0, y0, x1, y1 = rect
    assert 0 < x0 < x1 < 612 and 0 < y0 < y1 < 792


def test_rect_for_offsets_falls_back_when_char_boxes_do_not_line_up(resnet):
    """rect_for_offsets reads geometry from PyMuPDF's rawdict character boxes,
    a different extraction path than the get_text() page.stripped/offsets it
    is indexed against. Measured (task-4-report.md fix round 1) that the two
    agree on all three fixture papers, but nothing enforces that in general --
    a PDF where they diverge (ligatures, dropped or substituted glyphs,
    unusual encodings) must not silently return a plausible-looking rect built
    from the wrong characters. Doctor a PageIndex, no PDF editing: keep the
    real page's offsets (so the position math is unchanged) but corrupt the
    stripped text at the matched slice to a same-length string the real page
    does not contain. rect_for_offsets must refuse to trust the character
    boxes at that position and return None rather than the "plausible" real
    rect that sits there."""
    doc, index, pdf = resnet
    page_index = index[2]
    text = doc.page_text[2].text
    quote = "Let us consider H(x) as an underlying mapping"
    stripped_quote, _ = strip_whitespace(quote)
    s = page_index.stripped.index(stripped_quote)
    e = s + len(stripped_quote)

    # Same length as the real text at [s:e) -- a length-only check would miss
    # this -- but different content, so it cannot really be what the rawdict
    # characters at those positions spell out.
    doctored_stripped = page_index.stripped[:s] + ("x" * (e - s)) + page_index.stripped[e:]
    doctored = PageIndex(page=page_index.page, text=page_index.text, stripped=doctored_stripped, offsets=page_index.offsets)

    start = page_index.offsets[s]
    end = page_index.offsets[e - 1] + 1
    assert text[start:end] == quote  # sanity: these offsets really do point at the quote

    assert rect_for_offsets(pdf[2], doctored, start, end) is None


def test_resolve_highlight_states(resnet):
    doc, index, pdf = resnet
    text = doc.page_text[2].text
    quote, at = _selector(text, "Let us consider H(x) as an underlying mapping")
    true_rect = rects_for_text(pdf[2], quote.exact)

    anchored = resolve_highlight(HighlightAnchor(rects=[PageRect(page=2, rect=true_rect)], quote=quote, position=global_position(index, 2, at)), index, pdf)
    assert anchored.state == "anchored" and anchored.rects == [PageRect(page=2, rect=true_rect)]

    moved = resolve_highlight(HighlightAnchor(rects=[PageRect(page=2, rect=(50.0, 700.0, 286.0, 720.0))], quote=quote, position=0), index, pdf)
    assert moved.state == "relocated"
    assert all(r.page == 2 and overlap_ratio(r.rect, true_rect) > 0.9 for r in moved.rects)

    gone = resolve_highlight(HighlightAnchor(rects=[PageRect(page=2, rect=true_rect)], quote=QuoteSelector(exact="never in the paper, not once, not ever"), position=0), index, pdf)
    assert gone.state == "orphaned" and gone.rects == [PageRect(page=2, rect=true_rect)]


def test_fuzzy_match_edges_cover_only_the_matched_text(resnet):
    doc, index, _ = resnet
    text = doc.page_text[2].text

    inserted, at = _selector(text, "Let us consider H(x) as an underlying mapping")
    inserted.exact = "Let us consider carefully H(x) as an underlying mapping"
    match = find_quote(index, inserted, global_position(index, 2, at), page_hint=2)
    assert match is not None
    found, _ = strip_whitespace(index[match.page].text[match.start:match.end])
    assert found.startswith("Letus") and found.endswith("mapping")

    deleted, at2 = _selector(text, "Let us consider H(x) as an underlying mapping")
    deleted.exact = "Let us consider H(x) as an mapping"
    match2 = find_quote(index, deleted, global_position(index, 2, at2), page_hint=2)
    assert match2 is not None
    found2, _ = strip_whitespace(index[match2.page].text[match2.start:match2.end])
    assert found2.startswith("Letus") and found2.endswith("mapping")


def test_repeated_phrase_on_an_unchanged_page_stays_anchored(resnet):
    doc, index, pdf = resnet
    text = doc.page_text[1].text
    # confirmed by measurement: "shortcut connections" occurs 5 times,
    # stripped, on ResNet page 1.
    assert index[1].stripped.count("shortcutconnections") == 5

    quote, at = _selector(text, "shortcut connections")
    position = global_position(index, 1, at)
    match = find_quote(index, quote, position, page_hint=1)
    assert match is not None and match.page == 1

    true_rect = rect_for_offsets(pdf[1], index[1], match.start, match.end)
    assert true_rect is not None

    anchor = HighlightAnchor(rects=[PageRect(page=1, rect=true_rect)], quote=quote, position=position)
    resolved = resolve_highlight(anchor, index, pdf)
    assert resolved.state == "anchored"
    assert resolved.rects == [PageRect(page=1, rect=true_rect)]
    x0, _y0, x1, _y1 = resolved.rects[0].rect
    assert (x1 - x0) < 300


def test_resolve_chunk_keeps_rects_when_both_ends_hold(resnet):
    doc, index, pdf = resnet
    section = next(s for s in doc.sections if s.number == "3.1")
    text = doc.page_text[section.heading_rect.page].text
    start, s_at = _selector(text, section.title)
    end, _ = _selector(doc.page_text[section.extent[-1].page].text, _end_quote(doc, section))
    anchor = ChunkAnchor(rects=section.extent, start=start, end=end, position=global_position(index, section.heading_rect.page, s_at))
    resolved = resolve_chunk(anchor, index, pdf, doc)
    assert resolved.state == "anchored"
    assert resolved.rects == section.extent


def test_resolve_chunk_rebuilds_rects_from_regions_when_moved(resnet):
    doc, index, pdf = resnet
    section = next(s for s in doc.sections if s.number == "3.1")
    page = section.heading_rect.page
    text = doc.page_text[page].text
    start, _s_at = _selector(text, section.title)
    end, _ = _selector(doc.page_text[section.extent[-1].page].text, _end_quote(doc, section))
    stale = [{"page": page, "rect": (50.0, 700.0, 286.0, 720.0)}]
    resolved = resolve_chunk(ChunkAnchor(rects=stale, start=start, end=end, position=0), index, pdf, doc)
    assert resolved.state == "relocated"
    assert resolved.rects[0].page == page
    # the rebuilt region covers the heading and stays in one column
    hx0, _hy0, _hx1, hy1 = section.heading_rect.rect
    assert any(r.rect[0] <= hx0 and r.rect[3] >= hy1 for r in resolved.rects)
    assert all((r.rect[2] - r.rect[0]) < 300 for r in resolved.rects)


def test_anchor_basis_ignores_the_timestamp_and_follows_page_text_and_regions(extracted):
    from datetime import UTC, datetime

    from paperboard.anchoring import anchor_basis

    doc = extracted["resnet"]
    same_text_later = doc.model_copy(update={"extracted_at": datetime(2030, 1, 1, tzinfo=UTC)})
    assert anchor_basis(same_text_later) == anchor_basis(doc)

    pages = [p.model_copy() for p in doc.page_text]
    pages[2] = pages[2].model_copy(update={"text": pages[2].text + " "})
    assert anchor_basis(doc.model_copy(update={"page_text": pages})) != anchor_basis(doc)

    regions = list(doc.regions[1:])
    assert anchor_basis(doc.model_copy(update={"regions": regions})) != anchor_basis(doc)


def test_a_chunk_with_an_empty_end_quote_anchors_on_its_start_and_geometry(resnet):
    """A split section that ends on a picture has no end quote. An empty quote is
    no evidence either way, not a miss: the start holding inside the stored rects
    is enough to stay anchored (it used to come back relocated)."""
    doc, index, pdf = resnet
    section = next(s for s in doc.sections if s.number == "3.1")
    text = doc.page_text[section.heading_rect.page].text
    start, s_at = _selector(text, section.title)
    anchor = ChunkAnchor(rects=section.extent, start=start, end=QuoteSelector(exact=""),
                         position=global_position(index, section.heading_rect.page, s_at))
    resolved = resolve_chunk(anchor, index, pdf, doc)
    assert resolved.state == "anchored"
    assert resolved.rects == section.extent

    end, _ = _selector(doc.page_text[section.extent[-1].page].text, _end_quote(doc, section))
    no_start = anchor.model_copy(update={"start": QuoteSelector(exact=" "), "end": end})
    assert resolve_chunk(no_start, index, pdf, doc).state == "anchored"


def test_a_relocated_chunk_across_a_page_break_leaves_out_page_furniture(resnet):
    """Rebuilding a moved chunk from the regions between its ends must skip the
    running heads, page numbers, footnotes and captions extraction leaves out of
    section extents; ResNet page 2 ends on a page-number footer."""
    doc, index, pdf = resnet
    last = [r for r in doc.regions if r.page == 2 and r.label == "text"][-1]
    first = next(r for r in doc.regions if r.page == 3 and r.label == "text")
    between = doc.regions[doc.regions.index(last):doc.regions.index(first) + 1]
    furniture = [r for r in between if r.label in FURNITURE]
    assert furniture, "the fixture must have furniture between the two ends"

    chunk = select(doc, pdf, [PageRect(page=2, rect=last.rect), PageRect(page=3, rect=first.rect)], snap=False).chunk
    stale = chunk.model_copy(update={"rects": [PageRect(page=2, rect=(50.0, 700.0, 286.0, 720.0))]})
    resolved = resolve_chunk(stale, index, pdf, doc)
    assert resolved.state == "relocated"
    for region in furniture:
        assert not any(r.page == region.page and contains_point(r.rect, *midpoint(region.rect)) for r in resolved.rects)


# -- per-line highlights (D1) --------------------------------------------------


def _stale(anchor: HighlightAnchor) -> HighlightAnchor:
    """The same quote with its lines drawn somewhere the text is not, on the same pages."""
    pages = sorted({r.page for r in anchor.rects})
    rects = [PageRect(page=p, rect=(300.0, 740.0 - 12 * i, 540.0, 750.0 - 12 * i)) for i, p in enumerate(pages)]
    return anchor.model_copy(update={"rects": rects})


def test_a_highlight_whose_lines_hold_keeps_them_as_drawn(resnet):
    doc, index, pdf = resnet
    region = [r for r in doc.regions if r.page == 2 and r.label == "text"][2]
    anchor = select(doc, pdf, [PageRect(page=2, rect=region.rect)], snap=False).highlight
    assert len(anchor.rects) > 3
    resolved = resolve_highlight(anchor, index, pdf)
    assert resolved.state == "anchored" and resolved.rects == anchor.rects


def test_a_relocated_highlight_gets_its_lines_back_from_the_matched_words(resnet):
    """Re-anchoring recomputes one rect per line from the matched words by the same
    rule as a fresh selection, never a bounding box and never shifted copies."""
    doc, index, pdf = resnet
    region = [r for r in doc.regions if r.page == 2 and r.label == "text"][2]
    anchor = select(doc, pdf, [PageRect(page=2, rect=region.rect)], snap=False).highlight
    resolved = resolve_highlight(_stale(anchor), index, pdf)
    assert resolved.state == "relocated"
    assert resolved.rects == anchor.rects


def test_a_highlight_across_a_page_break_is_matched_on_the_joined_pages(resnet):
    """One quote across a page break (addendum 5.2 [CHOICE]): matched against the
    text of the pages it spans, joined, then split back into each page's lines."""
    doc, index, pdf = resnet
    last = [r for r in doc.regions if r.page == 2 and r.label == "text"][-1]
    first = next(r for r in doc.regions if r.page == 3 and r.label == "text")
    anchor = select(doc, pdf, [PageRect(page=2, rect=last.rect), PageRect(page=3, rect=first.rect)], snap=False).highlight
    assert {r.page for r in anchor.rects} == {2, 3}
    assert resolve_highlight(anchor, index, pdf).state == "anchored"
    resolved = resolve_highlight(_stale(anchor), index, pdf)
    assert resolved.state == "relocated"
    assert resolved.rects == anchor.rects


def test_a_highlight_on_two_columns_relocates_to_each_columns_lines(resnet):
    doc, index, pdf = resnet
    texts = [r for r in doc.regions if r.page == 2 and r.label == "text"]
    left = next(r for r in reversed(texts) if r.rect[2] < 300)
    right = next(r for r in texts if r.rect[0] > 300)
    anchor = select(doc, pdf, [PageRect(page=2, rect=left.rect), PageRect(page=2, rect=right.rect)], snap=False).highlight
    resolved = resolve_highlight(_stale(anchor), index, pdf)
    assert resolved.state == "relocated"
    assert resolved.rects == anchor.rects
