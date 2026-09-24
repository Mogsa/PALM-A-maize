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
from paperboard.words import line_rects, line_rects_under, lines_under, text_under

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


def _takes_region(pdf: pymupdf.Document, rect: PageRect, region) -> bool:
    """Whether the selection covers enough of the region's characters to take the
    whole region. Coverage counts only the region's characters inside the
    selection. A snapped selection is the union of the two, so a drag that runs
    past the region is never cut back to it."""
    page = pdf[rect.page]
    inside = intersection(rect.rect, region.rect)
    covered, _ = strip_whitespace(text_under(page, inside)) if inside else ("", [])
    whole, _ = strip_whitespace(text_under(page, region.rect))
    return bool(whole) and len(covered) / len(whole) >= SNAP_THRESHOLD


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


def quote_under(page: pymupdf.Page, page_index: PageIndex, exact: str, rect: Rect) -> tuple[QuoteSelector, int]:
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


def chunk_anchor(pdf: pymupdf.Document, index: list[PageIndex], rects: list[PageRect], pieces: list[str]) -> ChunkAnchor:
    """Each end is quoted from the text under its own rect, so the quote lies
    under that rect and R12's "unchanged" test can find it there. Quoting the
    first characters of the whole selection spilled past a heading-only first
    rect into the next one (measured: Attention 3.1's extent)."""
    first, last = rects[0], rects[-1]
    start, start_at = quote_under(pdf[first.page], index[first.page], pieces[0].strip()[:END_CHARS], first.rect)
    end, _ = quote_under(pdf[last.page], index[last.page], pieces[-1].strip()[-END_CHARS:], last.rect)
    return ChunkAnchor(rects=rects, start=start, end=end, position=global_position(index, first.page, start_at))


def _run_highlight(pdf: pymupdf.Document, index: list[PageIndex], rects: list[PageRect],
                   pieces: list[str]) -> HighlightAnchor:
    """The highlight of whole lines under the column runs. The quote is the whole
    selection. Its prefix and position come from where its first run starts, its
    suffix from where its last run ends, so a quote that crosses columns or pages
    is placed from both ends (D1)."""
    first, last = rects[0], rects[-1]
    head, head_at = quote_under(pdf[first.page], index[first.page], pieces[0].strip(), first.rect)
    tail, _ = quote_under(pdf[last.page], index[last.page], pieces[-1].strip(), last.rect)
    quote = QuoteSelector(exact="\n".join(pieces).strip(), prefix=head.prefix, suffix=tail.suffix)
    lines = [PageRect(page=r.page, rect=line) for r in rects for line in line_rects_under(pdf[r.page], r.rect)]
    return HighlightAnchor(rects=lines or rects, quote=quote, position=global_position(index, first.page, head_at))


def line_highlight(pdf: pymupdf.Document, index: list[PageIndex], lines: list[PageRect]) -> HighlightAnchor | None:
    """The highlight of exactly the words on the browser's own line rects, one
    rect per printed line, so a selection that starts or ends mid-line leaves the
    rest of that line unpainted (D1, addendum section 6). Each line is quoted
    under its own rect, the first for the prefix and position and the last for
    the suffix, as the runs are. None when no word lies under any line."""
    picked = [(line, lines_under(pdf[line.page], line.rect)) for line in lines]
    picked = [(line, words) for line, words in picked if words]
    if not picked:
        return None
    texts = [[" ".join(w[4] for w in text_line) for text_line in words] for _, words in picked]
    (first, _), (last, _) = picked[0], picked[-1]
    head, head_at = quote_under(pdf[first.page], index[first.page], " ".join(texts[0]), first.rect)
    tail, _ = quote_under(pdf[last.page], index[last.page], " ".join(texts[-1]), last.rect)
    exact = "\n".join(text for line_texts in texts for text in line_texts)
    rects = [PageRect(page=line.page, rect=r) for line, words in picked for r in line_rects(words)]
    return HighlightAnchor(rects=rects, quote=QuoteSelector(exact=exact, prefix=head.prefix, suffix=tail.suffix),
                           position=global_position(index, first.page, head_at))


def _select_text(doc: SourceDocument, pdf: pymupdf.Document, rects: list[PageRect], snap: bool,
                 lines: list[PageRect] | None) -> Selection:
    label: str | None = None
    took = False
    if len(rects) == 1:
        region = _smallest_region_at(doc, rects[0].page, midpoint(rects[0].rect))
        label = region.label if region else None
        took = snap and region is not None and _takes_region(pdf, rects[0], region)
        if took:
            rects = [PageRect(page=rects[0].page, rect=union(rects[0].rect, region.rect))]

    pieces = [text_under(pdf[r.page], r.rect) for r in rects]
    index = build_index(doc)
    # A snap that took the whole region highlights the whole region; otherwise the
    # browser's own lines, when it sent them, decide the first and last line.
    highlight = line_highlight(pdf, index, lines) if lines and not took else None
    return Selection(text="\n".join(pieces), rects=rects, region_label=label,
                     highlight=highlight or _run_highlight(pdf, index, rects, pieces),
                     chunk=chunk_anchor(pdf, index, rects, pieces), blocks=chunk_blocks(doc, pdf, rects))


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
    quote, at = quote_under(pdf[target.page], index[target.page], text.strip()[:QUOTE_CHARS], target.rect)
    highlight = HighlightAnchor(rects=[target], quote=quote, position=global_position(index, target.page, at))
    return Selection(text=text, rects=[target], region_label=label, highlight=highlight,
                     chunk=chunk_anchor(pdf, index, [target], [text]),
                     blocks=[ClipBlock(kind="clip", page=target.page, rect=target.rect, label=label)])


def select(doc: SourceDocument, pdf: pymupdf.Document, rects: list[PageRect], snap: bool,
           mode: Literal["text", "area"] = "text", lines: list[PageRect] | None = None) -> Selection:
    """`POST /text`: the raw selection, one rect per column run for `"text"` or the
    dragged rectangle for `"area"`, becomes the snapped rects, both anchor shapes
    and the blocks a cut of it would show (addendum section 6). `lines`, the
    browser's own rect per printed line, narrows a text highlight to the words on
    them; an area selection ignores it."""
    if not rects:
        raise ValueError("a selection needs at least one rectangle")
    for r in [*rects, *(lines or [])]:
        if not 0 <= r.page < len(doc.pages):
            raise ValueError(f"page {r.page} is outside the document")
    if mode == "area":
        return _select_area(doc, pdf, rects, snap)
    return _select_text(doc, pdf, rects, snap, lines)
