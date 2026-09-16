"""A selection in the paper becomes text plus an anchor, snapped to a layout
region when the drag was rough. SPEC-ADDENDUM.md section 5.3, one implementation."""

import pymupdf
from pydantic import BaseModel

from paperboard.anchoring import build_index, global_position, strip_whitespace
from paperboard.board_model import CONTEXT_CHARS, ChunkAnchor, HighlightAnchor, QuoteSelector
from paperboard.geometry import Rect, area, midpoint, normalise
from paperboard.source_model import PageRect, SourceDocument

SNAP_THRESHOLD = 0.6   # a rough drag covering this share of a region's characters takes the region
END_CHARS = 64         # a chunk's start and end selectors quote this many characters


class Selection(BaseModel):
    text: str
    rects: list[PageRect]
    region_label: str | None
    highlight: HighlightAnchor | None
    chunk: ChunkAnchor


def text_under(page: pymupdf.Page, rect: Rect) -> str:
    return page.get_text("text", clip=pymupdf.Rect(*normalise(rect)))


def _smallest_region_at(doc: SourceDocument, page: int, point: tuple[float, float]):
    x, y = point
    inside = [
        r for r in doc.regions
        if r.page == page and r.rect[0] <= x <= r.rect[2] and r.rect[1] <= y <= r.rect[3]
    ]
    return min(inside, key=lambda r: area(r.rect)) if inside else None


def _snap_rect(pdf: pymupdf.Document, rect: PageRect, region) -> PageRect:
    """The whole region if the selection covers enough of its characters, else
    exactly what was selected."""
    page = pdf[rect.page]
    selected, _ = strip_whitespace(text_under(page, rect.rect))
    whole, _ = strip_whitespace(text_under(page, region.rect))
    if whole and len(selected) / len(whole) >= SNAP_THRESHOLD:
        return PageRect(page=rect.page, rect=normalise(region.rect))
    return rect


def _selector(page_text: str, exact: str) -> tuple[QuoteSelector, int]:
    """Prefix and suffix from the page's own text around the first occurrence,
    matched with whitespace stripped so line breaks do not defeat it."""
    stripped_page, offsets = strip_whitespace(page_text)
    needle, _ = strip_whitespace(exact)
    at = stripped_page.find(needle) if needle else -1
    if at == -1:
        return QuoteSelector(exact=exact), 0
    start = offsets[at]
    end = offsets[at + len(needle) - 1] + 1
    return (
        QuoteSelector(exact=exact, prefix=page_text[max(0, start - CONTEXT_CHARS):start],
                      suffix=page_text[end:end + CONTEXT_CHARS]),
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
    stripped_text = text.strip()
    index = build_index(doc)
    first_page_text = doc.page_text[rects[0].page].text
    last_page_text = doc.page_text[rects[-1].page].text

    start, start_at = _selector(first_page_text, stripped_text[:END_CHARS])
    end, _ = _selector(last_page_text, stripped_text[-END_CHARS:])
    position = global_position(index, rects[0].page, start_at)
    chunk = ChunkAnchor(rects=rects, start=start, end=end, position=position)

    highlight = None
    if len(rects) == 1:
        quote, at = _selector(first_page_text, stripped_text)
        highlight = HighlightAnchor(page=rects[0].page, rect=rects[0].rect, quote=quote,
                                    position=global_position(index, rects[0].page, at))
    return Selection(text=text, rects=rects, region_label=label, highlight=highlight, chunk=chunk)
