"""Words selected in a chunk's text on the board, found again in the paper
(SPEC-ADDENDUM.md section 4.10, D20). The browser sends the words, never a
position: the card's text is reflowed, so only the words say where they are.
One rule finds them, for a highlight and for Split here and Cut out."""

import pymupdf

from paperboard.board_model import ChunkAnchor, HighlightAnchor, QuoteSelector
from paperboard.source_model import SourceDocument


class QuoteNotFound(ValueError):
    """The words are not inside the chunk's region: `422 quote_not_found`."""


def highlight_in_chunk(doc: SourceDocument, pdf: pymupdf.Document, region: ChunkAnchor,
                       quote: QuoteSelector) -> HighlightAnchor:
    """`POST /chunks/highlight`. Written in Task GS.1."""
    raise NotImplementedError("Task GS.1")
