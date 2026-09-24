"""Split here, Cut out and Join: a chunk cut again on the board (SPEC-ADDENDUM.md
section 4.10, D21). The paper's order lives inside a chunk; the reader's order
lives between chunks. Reads the source and the PDF; writes nothing."""

from typing import Literal

import pymupdf

from paperboard.anchoring import PageIndex, build_index
from paperboard.blocks import chunk_blocks
from paperboard.board_model import ChunkAnchor, ChunkData, QuoteSelector
from paperboard.chunk_text import lines_in_region
from paperboard.geometry import contains_point, midpoint
from paperboard.snap import chunk_anchor
from paperboard.source_model import PageRect, SourceDocument
from paperboard.words import text_under

RecutMode = Literal["split", "cut"]
Boundary = tuple[int, float]    # the region rect a boundary cuts, and the y it cuts at


class NotContiguous(ValueError):
    """Chunks that are not neighbours in the paper: `422 not_contiguous`."""


def _boundary(rects: list[PageRect], line: PageRect, top: bool) -> Boundary:
    """Where a matched line divides the region: its top or bottom edge, in the rect holding its midpoint."""
    point = midpoint(line.rect)
    at = next(i for i, r in enumerate(rects) if r.page == line.page and contains_point(r.rect, *point))
    return at, line.rect[1] if top else line.rect[3]


def _cut(rects: list[PageRect], boundaries: list[Boundary]) -> list[list[PageRect]]:
    """The region's rects cut across at each boundary, grouped into the pieces between them."""
    pieces: list[list[PageRect]] = [[]]
    for i, r in enumerate(rects):
        x0, y0, x1, y1 = r.rect
        top = y0
        for _, y in [b for b in boundaries if b[0] == i]:
            y = min(max(y, top), y1)
            if y > top:
                pieces[-1].append(PageRect(page=r.page, rect=(x0, top, x1, y)))
            pieces.append([])
            top = y
        if y1 > top:
            pieces[-1].append(PageRect(page=r.page, rect=(x0, top, x1, y1)))
    return pieces


def _piece(doc: SourceDocument, pdf: pymupdf.Document, index: list[PageIndex], rects: list[PageRect]) -> dict | None:
    """A chunk of these rects, as a cut makes one (addendum 5.1): a rect with no
    block under it is dropped, and no rect left is no piece."""
    kept = [(r, blocks) for r in rects if (blocks := chunk_blocks(doc, pdf, [r]))]
    if not kept:
        return None
    rects = [r for r, _ in kept]
    region = chunk_anchor(pdf, index, rects, [text_under(pdf[r.page], r.rect) for r in rects])
    data = ChunkData(region=region, blocks=[b for _, blocks in kept for b in blocks])
    return {"type": "chunk", "data": data.model_dump(mode="json")}


def recut(doc: SourceDocument, pdf: pymupdf.Document, region: ChunkAnchor, at: QuoteSelector,
          mode: RecutMode) -> list[dict]:
    """`POST /chunks/split`: the pieces of the chunk, in paper order, divided at the
    top of the line where `at` starts and, for `"cut"`, at the bottom of the line
    where it ends. Empty pieces are left out; fewer than two means nothing to divide."""
    index = build_index(doc)
    lines = lines_in_region(pdf, index, region, at)
    boundaries = [_boundary(region.rects, lines[0], top=True)]
    if mode == "cut":
        boundaries.append(_boundary(region.rects, lines[-1], top=False))
    pieces = [_piece(doc, pdf, index, rects) for rects in _cut(region.rects, boundaries)]
    return [p for p in pieces if p is not None]


def join(doc: SourceDocument, pdf: pymupdf.Document, regions: list[ChunkAnchor]) -> tuple[dict, list[int]]:
    """`POST /chunks/join`. Written in Task GS.3."""
    raise NotImplementedError("Task GS.3")
