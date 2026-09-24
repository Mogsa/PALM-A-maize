"""Words selected in a chunk's text on the board, found again in the paper
(SPEC-ADDENDUM.md section 4.10, D20). The browser sends the words, never a
position: the card's text is reflowed, so only the words say where they are.
One rule finds them, for a highlight and for Split here and Cut out."""

import pymupdf

from paperboard.anchoring import Match, PageIndex, build_index, find_quote, matched_lines
from paperboard.blocks import HYPHENATED_LINE_END, WORD
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


def _hyphens_joined(index: list[PageIndex]) -> list[PageIndex]:
    """The pages as the card reads them: every line-end hyphen `blocks.join_hyphens`
    joins is left out of the text matched against, so "de-\ntection" is found as the
    "detection" the card shows. Offsets still point into the page's own text, so a
    match here is a match in `index` too."""
    words = {w.lower() for page in index for w in WORD.findall(page.text)}   # as `blocks.paper_words`
    out = []
    for page in index:
        joined = {m.end(1) for m in HYPHENATED_LINE_END.finditer(page.text)
                  if (m.group(1) + m.group(2)).lower() in words}
        kept = [(c, o) for c, o in zip(page.stripped, page.offsets, strict=True) if o not in joined]
        out.append(PageIndex(page.page, page.text, "".join(c for c, _ in kept), [o for _, o in kept]))
    return out


def lines_in_region(pdf: pymupdf.Document, index: list[PageIndex], region: ChunkAnchor,
                    quote: QuoteSelector) -> list[PageRect]:
    """The printed lines of the words `quote` names, found by section 5.2's matcher
    and accepted only where the first and last of them lie inside `region`, so the
    same words elsewhere in the paper are never taken.

    Every span is searched and the best accepted match kept, a single page winning
    a tie: a selection across a page break also half-matches on one page, and
    taking that first would mark only half of it. Only the lines inside `region`
    are returned: a page number or a figure's labels that come between in the
    page text are not the chunk's words."""
    def accept(match: Match) -> bool:
        lines = matched_lines(pdf, index, match)
        return bool(lines) and _inside(lines[0], region.rects) and _inside(lines[-1], region.rects)

    card = _hyphens_joined(index)
    best: Match | None = None
    for span in SPANS:
        match = find_quote(card, quote, region.position, region.rects[0].page, span, accept=accept)
        if match is not None and (best is None or match.score > best.score):
            best = match
    if best is None:
        raise QuoteNotFound(f"the words {quote.exact[:40]!r} are not in this piece")
    return [line for line in matched_lines(pdf, index, best) or [] if _inside(line, region.rects)]


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
