"""Split a paper into its section and figure pieces (SPEC-ADDENDUM.md section 6,
`POST /split`, D16). The one implementation, used by first open and by the
Split button. Reads the source, the board as saved and the PDF; writes nothing."""

import pymupdf

from paperboard.anchoring import PageIndex, build_index, global_position
from paperboard.blocks import chunk_blocks
from paperboard.board_model import (
    Board,
    ChunkAnchor,
    ChunkData,
    FigureData,
    QuoteSelector,
    TextBlock,
)
from paperboard.geometry import contains_point, midpoint, normalise, union
from paperboard.snap import END_CHARS, quote_under
from paperboard.source_model import Figure, PageRect, Section, SourceDocument
from paperboard.words import text_under

# The tray's rows, as the client lays them out (web/src/model/tray.ts, `trayRow`):
# one column, each piece at its own index in paper order, relative to the tray.
TRAY_PAD = 20
TRAY_TOP = 48
TRAY_STEP = 44
TOP_INSET_POINTS = 1.0   # how far below a rect's top edge its "top-centre" point sits


def _paper_key(doc: SourceDocument, first: PageRect) -> tuple[int, float, float, float]:
    """Section 6.1's paper order: page, the index in `regions` of the region the
    rect starts in, then (y0, x0). The region is found as export finds it (ruling
    R14): the one holding the rect's top-centre point, else the first region whose
    midpoint the rect holds. The top-left corner alone falls in no region for a
    centred heading's extent (ResNet's Abstract) or a padded figure rect."""
    x0, y0, x1, _y1 = normalise(first.rect)
    top_centre = ((x0 + x1) / 2, y0 + TOP_INSET_POINTS)
    on_page = [(i, r.rect) for i, r in enumerate(doc.regions) if r.page == first.page]
    holding = next((i for i, rect in on_page if contains_point(rect, *top_centre)), None)
    if holding is None:
        holding = next((i for i, rect in on_page if contains_point(first.rect, *midpoint(rect))), None)
    return first.page, float("inf") if holding is None else holding, y0, x0


def _in_paper_order(doc: SourceDocument) -> list[Section | Figure]:
    """Every section and figure, in paper order together (the tray's rows)."""
    pieces = [(s, _paper_key(doc, s.extent[0] if s.extent else s.heading_rect)) for s in doc.sections]
    pieces += [(f, _paper_key(doc, f.rect)) for f in doc.figures]
    return [piece for piece, _key in sorted(pieces, key=lambda p: p[1])]


def _quote(pdf: pymupdf.Document, index: list[PageIndex], where: PageRect, exact: str) -> tuple[QuoteSelector, int]:
    """A quote of `exact` placed where it lies under `where`, and its global position."""
    selector, at = quote_under(pdf[where.page], index[where.page], exact, where.rect)
    return selector, global_position(index, where.page, at)


def _section_data(doc: SourceDocument, pdf: pymupdf.Document, index: list[PageIndex], section: Section) -> ChunkData:
    """A chunk of the section's extent, quoted from its heading and from the end of
    its last text block, the same END_CHARS a cut quotes at its end (section 5.1)."""
    rects = section.extent or [section.heading_rect]
    blocks = chunk_blocks(doc, pdf, rects)
    heading = text_under(pdf[section.heading_rect.page], section.heading_rect.rect).strip() or section.title
    start, position = _quote(pdf, index, section.heading_rect, heading[:END_CHARS])
    texts = [b for b in blocks if isinstance(b, TextBlock)]
    if texts:
        last = PageRect(page=texts[-1].page, rect=texts[-1].rect)
        end, _ = _quote(pdf, index, last, text_under(pdf[last.page], last.rect).strip()[-END_CHARS:])
    else:
        end = QuoteSelector(exact="")
    region = ChunkAnchor(rects=rects, start=start, end=end, position=position)
    return ChunkData(collapsed=True, region=region, blocks=blocks, source_id=section.id)


def _figure_data(pdf: pymupdf.Document, index: list[PageIndex], figure: Figure) -> FigureData:
    """One rect holding the figure and its caption, as the rectangle snap takes a
    figure (section 5.3), with `start` quoting the caption; no clip yet."""
    caption = figure.caption_rect if figure.caption_rect and figure.caption_rect.page == figure.rect.page else None
    rect = union(figure.rect.rect, caption.rect) if caption else figure.rect.rect
    start, position = QuoteSelector(exact=""), 0
    if caption:
        words = text_under(pdf[caption.page], caption.rect).strip() or figure.caption
        start, position = _quote(pdf, index, caption, words[:END_CHARS])
    region = ChunkAnchor(rects=[PageRect(page=figure.rect.page, rect=rect)], start=start,
                         end=QuoteSelector(exact=""), position=position)
    return FigureData(collapsed=True, region=region, caption=figure.caption, source_id=figure.id)


def split(doc: SourceDocument, board: Board, pdf: pymupdf.Document) -> list[dict]:
    """A draft node, `{type, position, data}` with no `id` and no `parentId`, for
    every section and figure whose id is not the `data.source_id` of a node on
    the board, in paper order. `position` is relative to the tray: the piece's
    own row among all the paper's pieces, so one re-added after a delete goes
    back to its place."""
    on_board = {getattr(n.data, "source_id", None) for n in board.nodes}
    index = build_index(doc)
    drafts = []
    for row, piece in enumerate(_in_paper_order(doc)):
        if piece.id in on_board:
            continue
        position = {"x": TRAY_PAD, "y": TRAY_TOP + row * TRAY_STEP}
        if isinstance(piece, Section):
            drafts.append({"type": "chunk", "position": position,
                           "data": _section_data(doc, pdf, index, piece).model_dump(mode="json")})
        else:
            drafts.append({"type": "figure", "position": position,
                           "data": _figure_data(pdf, index, piece).model_dump(mode="json")})
    return drafts
