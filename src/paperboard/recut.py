"""Split here, Cut out and Join: a chunk cut again on the board (SPEC-ADDENDUM.md
section 4.10, D21). The paper's order lives inside a chunk; the reader's order
lives between chunks. Reads the source and the PDF; writes nothing."""

from itertools import pairwise
from typing import Literal

import pymupdf

from paperboard.anchoring import PageIndex, build_index
from paperboard.blocks import chunk_blocks
from paperboard.board_model import ChunkAnchor, ChunkData, QuoteSelector
from paperboard.chunk_text import lines_in_region
from paperboard.geometry import column_runs, contains_point, midpoint
from paperboard.snap import chunk_anchor
from paperboard.source_model import FURNITURE, PageRect, SourceDocument
from paperboard.words import Word, lines_under, page_words, text_under

RecutMode = Literal["split", "cut"]
Boundary = tuple[int, float]    # the region rect a boundary cuts, and the y it cuts at
WordKey = tuple[int, int]       # a word's place in reading order: page, index in page_words


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


def _word_order(pdf: pymupdf.Document, page: int, cache: dict[int, dict[Word, int]]) -> dict[Word, int]:
    """Each word of the page and its index in `page_words`, the reading order `page_text` is built in."""
    if page not in cache:
        cache[page] = {w: i for i, w in enumerate(page_words(pdf[page]))}
    return cache[page]


def _span(pdf: pymupdf.Document, rects: list[PageRect], cache: dict) -> tuple[WordKey, WordKey] | None:
    """A chunk's first and last word in reading order, by the whole-word rule; None with no word."""
    keys = [(r.page, _word_order(pdf, r.page, cache)[w])
            for r in rects for line in lines_under(pdf[r.page], r.rect) for w in line]
    return (min(keys), max(keys)) if keys else None


def _furniture(doc: SourceDocument, page: int, word: Word) -> bool:
    x, y = midpoint(word[:4])
    return any(r.page == page and r.label in FURNITURE and contains_point(r.rect, x, y) for r in doc.regions)


def _neighbours(doc: SourceDocument, pdf: pymupdf.Document, last: WordKey, first: WordKey, cache: dict) -> bool:
    """The next chunk begins at or before the last word of this one, or only furniture lies between."""
    if first <= last:
        return True
    return all(_furniture(doc, page, w) for page in range(last[0], first[0] + 1)
               for w, i in _word_order(pdf, page, cache).items() if last < (page, i) < first)


def join(doc: SourceDocument, pdf: pymupdf.Document, regions: list[ChunkAnchor]) -> tuple[dict, list[int]]:
    """`POST /chunks/join`: one chunk of neighbours' regions, and their indices in
    paper order. Their rects are collapsed by the column-run rule, so the pieces
    of a split join back into the original rects exactly."""
    cache: dict[int, dict[Word, int]] = {}
    spans = [_span(pdf, r.rects, cache) for r in regions]
    if any(s is None for s in spans):
        raise NotContiguous("a piece with no words has no neighbours")
    order = sorted(range(len(regions)), key=lambda i: spans[i])
    for a, b in pairwise(order):
        if not _neighbours(doc, pdf, spans[a][1], spans[b][0], cache):
            raise NotContiguous("these pieces are not neighbours in the paper")
    widths = {p.index: p.width for p in doc.pages}
    runs = column_runs([(r.page, r.rect) for i in order for r in regions[i].rects], widths)
    piece = _piece(doc, pdf, build_index(doc), [PageRect(page=page, rect=rect) for page, rect in runs])
    if piece is None:
        raise NotContiguous("the joined region holds nothing")
    return piece, order
