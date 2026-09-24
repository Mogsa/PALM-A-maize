"""Words selected in a chunk's text on the board, found again in the paper
(SPEC-ADDENDUM.md section 4.10, D20). The browser sends the words, never a
position: the card's text is reflowed, so only the words say where they are.
One rule finds them, for a highlight and for Split here and Cut out."""

import pymupdf

from paperboard.anchoring import Match, PageIndex, build_index, find_quote, matched_lines
from paperboard.board_model import ChunkAnchor, HighlightAnchor, QuoteSelector
from paperboard.geometry import contains_point, midpoint
from paperboard.snap import line_highlight
from paperboard.source_model import PageRect, SourceDocument

SPANS = (1, 2)   # a selection is looked for on one page, then across a page break (addendum 5.2)


class QuoteNotFound(ValueError):
    """The words are not inside the chunk's region: `422 quote_not_found`."""


def _inside(line: PageRect, rects: list[PageRect]) -> bool:
    """Section 4.0's containment test: the line's midpoint in a region rect on its page."""
    return any(r.page == line.page and contains_point(r.rect, *midpoint(line.rect)) for r in rects)


def lines_in_region(pdf: pymupdf.Document, index: list[PageIndex], region: ChunkAnchor,
                    quote: QuoteSelector) -> list[PageRect]:
    """The printed lines of the words `quote` names, found by section 5.2's matcher
    and accepted only where the first and last of them lie inside `region`, so the
    same words elsewhere in the paper are never taken."""
    def accept(match: Match) -> bool:
        lines = matched_lines(pdf, index, match)
        return bool(lines) and _inside(lines[0], region.rects) and _inside(lines[-1], region.rects)

    for span in SPANS:
        match = find_quote(index, quote, region.position, region.rects[0].page, span, accept=accept)
        if match is not None:
            return matched_lines(pdf, index, match) or []
    raise QuoteNotFound(f"the words {quote.exact[:40]!r} are not in this piece")


def highlight_in_chunk(doc: SourceDocument, pdf: pymupdf.Document, region: ChunkAnchor,
                       quote: QuoteSelector) -> HighlightAnchor:
    """`POST /chunks/highlight`: a highlight anchor for words selected on a card,
    built from their lines as `POST /text` builds one from the browser's `lines`,
    so it is the same shape as a highlight made on the paper over the same words."""
    index = build_index(doc)
    anchor = line_highlight(pdf, index, lines_in_region(pdf, index, region, quote))
    if anchor is None:
        raise QuoteNotFound(f"no word of {quote.exact[:40]!r} is on the page")
    return anchor
