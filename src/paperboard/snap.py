"""A selection in the paper becomes text plus an anchor, snapped to a layout
region when the drag was rough. SPEC-ADDENDUM.md section 5.3, one implementation."""

from typing import Literal

import pymupdf
from pydantic import BaseModel

from paperboard.anchoring import (
    PageIndex,
    build_index,
    global_position,
    rect_for_stripped,
    strip_whitespace,
)
from paperboard.blocks import CLIP_LABELS, chunk_blocks
from paperboard.board_model import (
    CONTEXT_CHARS,
    Block,
    ChunkAnchor,
    ClipBlock,
    HighlightAnchor,
    QuoteSelector,
)
from paperboard.geometry import (
    Rect,
    area,
    contains_point,
    intersection,
    midpoint,
    overlap_ratio,
    union,
)
from paperboard.source_model import LayoutRegion, PageRect, SourceDocument
from paperboard.words import line_rects_under, text_under

SNAP_THRESHOLD = 0.6   # a rough drag covering this share of a region's characters, or of its area, takes it
END_CHARS = 64         # a chunk's start and end selectors quote this many characters
QUOTE_CHARS = 256      # an area highlight quotes at most this much of the text inside it


class Selection(BaseModel):
    text: str
    rects: list[PageRect]
    region_label: str | None
    highlight: HighlightAnchor
    chunk: ChunkAnchor
    blocks: list[Block]


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


def _chunk_anchor(pdf: pymupdf.Document, index: list[PageIndex], rects: list[PageRect], pieces: list[str]) -> ChunkAnchor:
    """Each end is quoted from the text under its own rect, so the quote lies
    under that rect and R12's "unchanged" test can find it there. Quoting the
    first characters of the whole selection spilled past a heading-only first
    rect into the next one (measured: Attention 3.1's extent)."""
    first, last = rects[0], rects[-1]
    start, start_at = _selector(pdf[first.page], index[first.page], pieces[0].strip()[:END_CHARS], first.rect)
    end, _ = _selector(pdf[last.page], index[last.page], pieces[-1].strip()[-END_CHARS:], last.rect)
    return ChunkAnchor(rects=rects, start=start, end=end, position=global_position(index, first.page, start_at))


def _select_text(doc: SourceDocument, pdf: pymupdf.Document, rects: list[PageRect], snap: bool) -> Selection:
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
    chunk = _chunk_anchor(pdf, index, rects, pieces)

    # The highlight's quote is the whole selection. Its prefix and position come
    # from where its first run starts, its suffix from where its last run ends, so
    # a quote that crosses columns or pages is placed from both ends (D1).
    head, head_at = _selector(pdf[first.page], index[first.page], pieces[0].strip(), first.rect)
    tail, _ = _selector(pdf[last.page], index[last.page], pieces[-1].strip(), last.rect)
    quote = QuoteSelector(exact=text.strip(), prefix=head.prefix, suffix=tail.suffix)
    lines = [PageRect(page=r.page, rect=line) for r in rects for line in line_rects_under(pdf[r.page], r.rect)]
    highlight = HighlightAnchor(rects=lines or rects, quote=quote, position=global_position(index, first.page, head_at))
    return Selection(text=text, rects=rects, region_label=label, highlight=highlight, chunk=chunk,
                     blocks=chunk_blocks(doc, pdf, rects))


def _caption_of(doc: SourceDocument, region: LayoutRegion) -> PageRect | None:
    """The caption `source.json` pairs with a picture or table region: the figure
    whose rect holds the region's midpoint, when its caption is on the same page."""
    for figure in doc.figures:
        if figure.rect.page == region.page and contains_point(figure.rect.rect, *midpoint(region.rect)):
            caption = figure.caption_rect
            return caption if caption is not None and caption.page == region.page else None
    return None


def _snap_area(doc: SourceDocument, drag: PageRect) -> tuple[PageRect, str | None]:
    """The rectangle rule (addendum 5.3): the smallest picture, table or formula
    region the drag covers by at least SNAP_THRESHOLD of the region's own area,
    with its caption when it has one; else exactly the drag, and no label."""
    covered = [r for r in doc.regions if r.page == drag.page and r.label in CLIP_LABELS
               and overlap_ratio(r.rect, drag.rect) >= SNAP_THRESHOLD]
    if not covered:
        return drag, None
    region = min(covered, key=lambda r: area(r.rect))
    caption = _caption_of(doc, region)
    rect = union(region.rect, caption.rect) if caption is not None else region.rect
    return PageRect(page=drag.page, rect=rect), region.label


def _select_area(doc: SourceDocument, pdf: pymupdf.Document, rects: list[PageRect], snap: bool) -> Selection:
    """A rectangle drag, for figures, tables and equations: one rect, snapped by
    area, shown as one clip. Its quote is up to QUOTE_CHARS of the text inside, a
    text fallback for what is mostly geometry (addendum 5.1)."""
    if len(rects) != 1:
        raise ValueError("an area selection is exactly one rectangle")
    target, label = _snap_area(doc, rects[0]) if snap else (rects[0], None)
    text = text_under(pdf[target.page], target.rect)
    index = build_index(doc)
    quote, at = _selector(pdf[target.page], index[target.page], text.strip()[:QUOTE_CHARS], target.rect)
    highlight = HighlightAnchor(rects=[target], quote=quote, position=global_position(index, target.page, at))
    return Selection(text=text, rects=[target], region_label=label, highlight=highlight,
                     chunk=_chunk_anchor(pdf, index, [target], [text]),
                     blocks=[ClipBlock(kind="clip", page=target.page, rect=target.rect, label=label)])


def select(doc: SourceDocument, pdf: pymupdf.Document, rects: list[PageRect], snap: bool,
           mode: Literal["text", "area"] = "text") -> Selection:
    """`POST /text`: the raw selection, one rect per column run for `"text"` or the
    dragged rectangle for `"area"`, becomes the snapped rects, both anchor shapes
    and the blocks a cut of it would show (addendum section 6)."""
    if not rects:
        raise ValueError("a selection needs at least one rectangle")
    for r in rects:
        if not 0 <= r.page < len(doc.pages):
            raise ValueError(f"page {r.page} is outside the document")
    if mode == "area":
        return _select_area(doc, pdf, rects, snap)
    return _select_text(doc, pdf, rects, snap)
