import pymupdf
import pytest
from conftest import FIXTURES

from paperboard.anchoring import (
    build_index,
    find_quote,
    global_position,
    rects_for_text,
    resolve_chunk,
    resolve_highlight,
    strip_whitespace,
)
from paperboard.board_model import ChunkAnchor, HighlightAnchor, QuoteSelector
from paperboard.geometry import overlap_ratio


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


def test_resolve_highlight_states(resnet):
    doc, index, pdf = resnet
    text = doc.page_text[2].text
    quote, at = _selector(text, "Let us consider H(x) as an underlying mapping")
    true_rect = rects_for_text(pdf[2], quote.exact)

    anchored = resolve_highlight(HighlightAnchor(page=2, rect=true_rect, quote=quote, position=global_position(index, 2, at)), index, pdf)
    assert anchored.state == "anchored" and anchored.rect == true_rect

    moved = resolve_highlight(HighlightAnchor(page=2, rect=(50.0, 700.0, 286.0, 720.0), quote=quote, position=0), index, pdf)
    assert moved.state == "relocated"
    assert overlap_ratio(moved.rect, true_rect) > 0.9

    gone = resolve_highlight(HighlightAnchor(page=2, rect=true_rect, quote=QuoteSelector(exact="never in the paper, not once, not ever"), position=0), index, pdf)
    assert gone.state == "orphaned" and gone.rect == true_rect


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
