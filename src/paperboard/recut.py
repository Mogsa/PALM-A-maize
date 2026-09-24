"""Split here, Cut out and Join: a chunk cut again on the board (SPEC-ADDENDUM.md
section 4.10, D21). The paper's order lives inside a chunk; the reader's order
lives between chunks. Reads the source and the PDF; writes nothing."""

from typing import Literal

import pymupdf

from paperboard.board_model import ChunkAnchor, QuoteSelector
from paperboard.source_model import SourceDocument

RecutMode = Literal["split", "cut"]


class NotContiguous(ValueError):
    """Chunks that are not neighbours in the paper: `422 not_contiguous`."""


def recut(doc: SourceDocument, pdf: pymupdf.Document, region: ChunkAnchor, at: QuoteSelector,
          mode: RecutMode) -> list[dict]:
    """`POST /chunks/split`. Written in Task GS.2."""
    raise NotImplementedError("Task GS.2")


def join(doc: SourceDocument, pdf: pymupdf.Document, regions: list[ChunkAnchor]) -> tuple[dict, list[int]]:
    """`POST /chunks/join`. Written in Task GS.3."""
    raise NotImplementedError("Task GS.3")
