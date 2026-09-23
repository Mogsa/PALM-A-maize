"""What a chunk shows: its blocks, in reading order (SPEC-ADDENDUM.md section 4.0).

The server computes them, in `POST /text` and in migration, and the chunk stores
them so the board renders without the source.
"""

import pymupdf

from paperboard.board_model import Block, TextBlock
from paperboard.source_model import PageRect, SourceDocument
from paperboard.words import text_under


def chunk_blocks(doc: SourceDocument, pdf: pymupdf.Document, rects: list[PageRect]) -> list[Block]:
    """One text block per chunk rect, holding the words under it by the
    whole-word rule; a rect with no whole line inside contributes nothing.

    The simplest correct version. Section 4.0's full rule -- per layout region
    in `doc.regions`, text blocks by overlap and clip blocks for formulas,
    pictures and tables by midpoint -- is the mixed-blocks task, which replaces
    this body and keeps the signature."""
    blocks: list[Block] = []
    for target in rects:
        text = text_under(pdf[target.page], target.rect)
        if text.strip():
            blocks.append(TextBlock(kind="text", page=target.page, rect=target.rect, text=text))
    return blocks
