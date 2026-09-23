"""A selection in the paper becomes text plus an anchor, snapped to a layout
region when the drag was rough. SPEC-ADDENDUM.md section 5.3, one implementation."""

from itertools import groupby

import pymupdf
from pydantic import BaseModel

from paperboard.anchoring import (
    PageIndex,
    build_index,
    global_position,
    rect_for_stripped,
    strip_whitespace,
)
from paperboard.board_model import CONTEXT_CHARS, ChunkAnchor, HighlightAnchor, QuoteSelector
from paperboard.geometry import Rect, area, contains_point, intersection, midpoint, normalise, union
from paperboard.source_model import PageRect, SourceDocument

SNAP_THRESHOLD = 0.6   # a rough drag covering this share of a region's characters takes the region
END_CHARS = 64         # a chunk's start and end selectors quote this many characters
LINE_INSIDE = 0.5      # a line is under the rect when at least this much of its ink box is inside vertically
WORD_INSIDE = 0.5      # a word on such a line is under it when at least this much of it is inside horizontally
WORD_FLAGS = pymupdf.TEXTFLAGS_WORDS | pymupdf.TEXT_ACCURATE_BBOXES   # ink boxes, not font-metric boxes


class Selection(BaseModel):
    text: str
    rects: list[PageRect]
    region_label: str | None
    highlight: HighlightAnchor | None
    chunk: ChunkAnchor


def _share(inner: tuple[float, float], outer: tuple[float, float]) -> float:
    """How much of the interval `inner` lies inside `outer`, 0.0 to 1.0."""
    a0, a1 = inner
    if a1 <= a0:
        return 0.0
    return max(0.0, min(a1, outer[1]) - max(a0, outer[0])) / (a1 - a0)


def text_under(page: pymupdf.Page, rect: Rect) -> str:
    """The words under a rectangle, one line per text line, in reading order.

    Whole words, and only those mostly inside the rect: character-level extraction
    with a clip keeps any glyph whose ink touches the clip (measured: a rect edge 1 pt
    into the next line took its 'T', 'h', 'i', 'f', 'l' and left the rest), which puts
    fragments of neighbouring lines at the start of a cut. A line is under the rect
    when at least LINE_INSIDE of its ink box is inside vertically, and each of its words
    when at least WORD_INSIDE of the word is inside horizontally. The decision is per
    line, not per word, so a cut through a line keeps or drops the line whole rather
    than the words with the taller ink; and it uses ink boxes rather than font-metric
    boxes because a math accent (the hat of v-hat in Adam) has a 36 pt metric box for
    2 pt of ink, which put the equation above a paragraph under a padded drag around
    it. The words are taken without a clip because a clipped "words" call splits words
    on the edge and reports the fragment's own box ('complicate' of 'complicated').
    Lines keep PyMuPDF's block order, the order the page index is built in, so a
    selection is still found there as a substring. Ends with a newline when non-empty,
    as PyMuPDF's text mode did, so Selection.text keeps its shape (ruling R8)."""
    x0, y0, x1, y1 = normalise(rect)
    words = page.get_text("words", flags=WORD_FLAGS)   # x0, y0, x1, y1, word, block, line, word_no
    lines: list[str] = []
    for _, group in groupby(words, key=lambda w: (w[5], w[6])):
        line = list(group)
        top, bottom = min(w[1] for w in line), max(w[3] for w in line)
        if _share((top, bottom), (y0, y1)) < LINE_INSIDE:
            continue
        kept = [w[4] for w in line if _share((w[0], w[2]), (x0, x1)) >= WORD_INSIDE]
        if kept:
            lines.append(" ".join(kept))
    return "\n".join(lines) + ("\n" if lines else "")


def _smallest_region_at(doc: SourceDocument, page: int, point: tuple[float, float]):
    x, y = point
    inside = [
        r for r in doc.regions
        if r.page == page and r.rect[0] <= x <= r.rect[2] and r.rect[1] <= y <= r.rect[3]
    ]
    return min(inside, key=lambda r: area(r.rect)) if inside else None


def _snap_rect(pdf: pymupdf.Document, rect: PageRect, region) -> PageRect:
    """Grown to take in the whole region if the selection covers enough of the
    region's characters, else exactly what was selected. Coverage counts only the
    region's characters inside the selection, and the result is the union of the
    two, so a drag that runs past the region is never cut back to it."""
    page = pdf[rect.page]
    inside = intersection(rect.rect, region.rect)
    covered, _ = strip_whitespace(text_under(page, inside)) if inside else ("", [])
    whole, _ = strip_whitespace(text_under(page, region.rect))
    if whole and len(covered) / len(whole) >= SNAP_THRESHOLD:
        return PageRect(page=rect.page, rect=union(rect.rect, region.rect))
    return rect


def _occurrence_under(page: pymupdf.Page, page_index: PageIndex, needle: str, rect: Rect) -> int:
    """Stripped offset of the occurrence of `needle` whose character boxes have
    their midpoint inside `rect` (ruling R13): a repeated phrase is quoted where
    the reader selected it, not where it first appears on the page. Falls back
    to the first occurrence when none lies under the rect, for instance when
    the character boxes do not line up with the page text; -1 when absent."""
    first = at = page_index.stripped.find(needle)
    while at != -1:
        box = rect_for_stripped(page, page_index, at, at + len(needle))
        if box is not None and contains_point(rect, *midpoint(box)):
            return at
        at = page_index.stripped.find(needle, at + 1)
    return first


def _selector(page: pymupdf.Page, page_index: PageIndex, exact: str, rect: Rect) -> tuple[QuoteSelector, int]:
    """Prefix and suffix from the page's own text around the occurrence under
    `rect`, matched with whitespace stripped so line breaks do not defeat it."""
    needle, _ = strip_whitespace(exact)
    at = _occurrence_under(page, page_index, needle, rect) if needle else -1
    if at == -1:
        return QuoteSelector(exact=exact), 0
    text, offsets = page_index.text, page_index.offsets
    start = offsets[at]
    end = offsets[at + len(needle) - 1] + 1
    return (
        QuoteSelector(exact=exact, prefix=text[max(0, start - CONTEXT_CHARS):start],
                      suffix=text[end:end + CONTEXT_CHARS]),
        start,
    )


def select(doc: SourceDocument, pdf: pymupdf.Document, rects: list[PageRect], snap: bool) -> Selection:
    if not rects:
        raise ValueError("a selection needs at least one rectangle")
    for r in rects:
        if not 0 <= r.page < len(doc.pages):
            raise ValueError(f"page {r.page} is outside the document")
    label: str | None = None
    if len(rects) == 1:
        region = _smallest_region_at(doc, rects[0].page, midpoint(rects[0].rect))
        label = region.label if region else None
        if snap and region is not None:
            rects = [_snap_rect(pdf, rects[0], region)]

    pieces = [text_under(pdf[r.page], r.rect) for r in rects]
    text = "\n".join(pieces)
    index = build_index(doc)
    first, last = rects[0], rects[-1]

    # Each end is quoted from the text under its own rect, so the quote lies
    # under that rect and R12's "unchanged" test can find it there. Quoting
    # the first characters of the whole selection spilled past a heading-only
    # first rect into the next one (measured: Attention 3.1's extent).
    start, start_at = _selector(pdf[first.page], index[first.page], pieces[0].strip()[:END_CHARS], first.rect)
    end, _ = _selector(pdf[last.page], index[last.page], pieces[-1].strip()[-END_CHARS:], last.rect)
    position = global_position(index, first.page, start_at)
    chunk = ChunkAnchor(rects=rects, start=start, end=end, position=position)

    highlight = None
    if len(rects) == 1:
        quote, at = _selector(pdf[first.page], index[first.page], text.strip(), first.rect)
        highlight = HighlightAnchor(page=rects[0].page, rect=rects[0].rect, quote=quote,
                                    position=global_position(index, rects[0].page, at))
    return Selection(text=text, rects=rects, region_label=label, highlight=highlight, chunk=chunk)
