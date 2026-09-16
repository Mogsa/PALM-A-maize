"""Find a quoted passage again after the text under it has changed.

This is the one part of the tool that is specific to it. The design is
Hypothesis's text-quote anchoring (SPEC-ADDENDUM.md section 5): match on the
quote with whitespace stripped, use prefix and suffix to tell identical
sentences apart, use the stored offset only to break ties, and recover the
rectangle from the matched words on the page rather than trusting stored
geometry. Coordinates come out in PyMuPDF page space because PyMuPDF is the
only thing that produces them.
"""

from dataclasses import dataclass

import pymupdf
from rapidfuzz import fuzz

from paperboard.board_model import ChunkAnchor, HighlightAnchor, QuoteSelector
from paperboard.geometry import Rect, column_runs, midpoint, normalise, union
from paperboard.source_model import PageRect, SourceDocument

MIN_SCORE = 0.5            # below this, a quote is orphaned
MIN_QUOTE_SCORE = 0.6      # the quote itself must match at least this well to be a candidate
SAME_PLACE_POINTS = 3.0    # a recovered rect within this many points of the stored one is "anchored"
FUZZY_MIN_CHARS = 8        # shorter quotes are matched exactly or not at all
WEIGHTS = {"quote": 50.0, "prefix": 20.0, "suffix": 20.0, "position": 2.0}
TOTAL_WEIGHT = sum(WEIGHTS.values())


@dataclass(frozen=True)
class PageIndex:
    page: int
    text: str
    stripped: str
    offsets: list[int]


@dataclass(frozen=True)
class Match:
    page: int
    start: int
    end: int
    score: float


def strip_whitespace(text: str) -> tuple[str, list[int]]:
    """Whitespace out, and for every kept character the offset it came from.
    PDF extraction paths disagree about spacing more than about anything else,
    so all matching happens on the stripped text (addendum 5.2 step 2)."""
    kept: list[str] = []
    offsets: list[int] = []
    for i, char in enumerate(text):
        if not char.isspace():
            kept.append(char)
            offsets.append(i)
    return "".join(kept), offsets


def build_index(doc: SourceDocument) -> list[PageIndex]:
    out = []
    for page_text in doc.page_text:
        stripped, offsets = strip_whitespace(page_text.text)
        out.append(PageIndex(page_text.page, page_text.text, stripped, offsets))
    return out


def global_position(index: list[PageIndex], page: int, offset: int) -> int:
    """Offset into the concatenation of every page's original text."""
    return sum(len(p.text) for p in index[:page]) + offset


def _similarity(a: str, b: str) -> float:
    if not a and not b:
        return 1.0
    if not a or not b:
        return 0.0
    return fuzz.ratio(a, b) / 100.0


def _candidates_on_page(page: PageIndex, quote: str) -> list[tuple[int, int, float]]:
    """(stripped start, stripped end, quote score) for every plausible hit."""
    hits: list[tuple[int, int, float]] = []
    at = page.stripped.find(quote)
    while at != -1:
        hits.append((at, at + len(quote), 1.0))
        at = page.stripped.find(quote, at + 1)
    if hits or len(quote) < FUZZY_MIN_CHARS:
        return hits
    alignment = fuzz.partial_ratio_alignment(quote, page.stripped, score_cutoff=MIN_QUOTE_SCORE * 100)
    if alignment is None:
        return hits
    return [(alignment.dest_start, alignment.dest_end, alignment.score / 100.0)]


def find_quote(index: list[PageIndex], quote: QuoteSelector, position: int, page_hint: int) -> Match | None:
    """Best match across pages, nearest page to the hint searched first only so
    that ties resolve toward it; every page is scored, since scoring all twelve
    pages of a paper costs a few milliseconds."""
    needle, _ = strip_whitespace(quote.exact)
    if not needle:
        return None
    prefix, _ = strip_whitespace(quote.prefix)
    suffix, _ = strip_whitespace(quote.suffix)
    total_len = max(1, sum(len(p.text) for p in index))

    best: Match | None = None
    for page in sorted(index, key=lambda p: abs(p.page - page_hint)):
        for s, e, quote_score in _candidates_on_page(page, needle):
            before = page.stripped[max(0, s - len(prefix)):s] if prefix else ""
            after = page.stripped[e:e + len(suffix)] if suffix else ""
            start = page.offsets[s]
            end = page.offsets[e - 1] + 1
            distance = abs(global_position(index, page.page, start) - position)
            score = (
                WEIGHTS["quote"] * quote_score
                + WEIGHTS["prefix"] * _similarity(prefix, before)
                + WEIGHTS["suffix"] * _similarity(suffix, after)
                + WEIGHTS["position"] * (1.0 - min(1.0, distance / total_len))
            ) / TOTAL_WEIGHT
            if score >= MIN_SCORE and (best is None or score > best.score):
                best = Match(page.page, start, end, score)
    return best


def rects_for_text(page: pymupdf.Page, text: str) -> Rect | None:
    """Bounding box of the lines that carry `text`, via PyMuPDF's own search.
    A long passage may straddle a hyphenated line break that search_for cannot
    cross; then the first and last few words are searched separately and the
    box spans between them."""
    hits = page.search_for(text)
    if hits:
        rect = None
        for hit in hits:
            rect = union(rect, tuple(hit)) if rect else normalise(tuple(hit))
        return rect
    words = text.split()
    if len(words) < 4:
        return None
    head = page.search_for(" ".join(words[:3]))
    tail = page.search_for(" ".join(words[-3:]))
    if not head or not tail:
        return None
    return union(tuple(head[0]), tuple(tail[-1]))


def _same_place(a: Rect, b: Rect) -> bool:
    return all(abs(x - y) <= SAME_PLACE_POINTS for x, y in zip(normalise(a), normalise(b)))


def resolve_highlight(anchor: HighlightAnchor, index: list[PageIndex], pdf: pymupdf.Document) -> HighlightAnchor:
    match = find_quote(index, anchor.quote, anchor.position, anchor.page)
    if match is None:
        return anchor.model_copy(update={"state": "orphaned"})
    found_text = index[match.page].text[match.start:match.end]
    rect = rects_for_text(pdf[match.page], found_text)
    if rect is None:
        return anchor.model_copy(update={"state": "orphaned"})
    position = global_position(index, match.page, match.start)
    if match.page == anchor.page and _same_place(rect, anchor.rect):
        return anchor.model_copy(update={"state": "anchored", "position": position})
    return anchor.model_copy(update={"page": match.page, "rect": rect, "position": position, "state": "relocated"})


def _regions_between(doc: SourceDocument, start: tuple[int, Rect], end: tuple[int, Rect]) -> list[tuple[int, Rect]]:
    """Layout regions in reading order from the one holding `start` to the one
    holding `end`, inclusive. Regions are stored in extraction order, which is
    reading order, so this is a slice."""
    regions = [(r.page, r.rect) for r in doc.regions]

    def holding(target: tuple[int, Rect]) -> int | None:
        page, rect = target
        mx, my = midpoint(rect)
        for i, (rp, rr) in enumerate(regions):
            x0, y0, x1, y1 = rr
            if rp == page and x0 <= mx <= x1 and y0 <= my <= y1:
                return i
        return None

    first, last = holding(start), holding(end)
    if first is None or last is None or last < first:
        return [start, end] if start != end else [start]
    return regions[first:last + 1]


def resolve_chunk(anchor: ChunkAnchor, index: list[PageIndex], pdf: pymupdf.Document, doc: SourceDocument) -> ChunkAnchor:
    """Anchor the two ends independently. If both hold where they were, keep the
    stored rects. If they moved, rebuild the region from the layout regions
    between them with the same column-run rule extraction uses."""
    first_page = anchor.rects[0].page
    start = find_quote(index, anchor.start, anchor.position, first_page)
    end = find_quote(index, anchor.end, anchor.position, anchor.rects[-1].page)
    if start is None and end is None:
        return anchor.model_copy(update={"state": "orphaned"})

    def located(match: Match | None, fallback: PageRect) -> tuple[int, Rect]:
        if match is None:
            return fallback.page, fallback.rect
        rect = rects_for_text(pdf[match.page], index[match.page].text[match.start:match.end])
        return (match.page, rect) if rect else (fallback.page, fallback.rect)

    start_at = located(start, anchor.rects[0])
    end_at = located(end, anchor.rects[-1])
    if start and end and _still_inside(start_at, anchor.rects[0]) and _still_inside(end_at, anchor.rects[-1]):
        position = global_position(index, start.page, start.start)
        return anchor.model_copy(update={"state": "anchored", "position": position})

    widths = {p.index: p.width for p in doc.pages}
    runs = column_runs(_regions_between(doc, start_at, end_at), widths)
    rects = [PageRect(page=page, rect=rect) for page, rect in runs]
    position = global_position(index, start.page, start.start) if start else anchor.position
    return anchor.model_copy(update={"rects": rects, "position": position, "state": "relocated"})


def _still_inside(found: tuple[int, Rect], stored: PageRect) -> bool:
    """The recovered end sits on the stored page and inside the stored rect,
    give or take a few points."""
    page, rect = found
    if page != stored.page:
        return False
    bx0, by0, bx1, by1 = normalise(stored.rect)
    x0, y0, x1, y1 = normalise(rect)
    slack = SAME_PLACE_POINTS
    return bx0 - slack <= x0 and by0 - slack <= y0 and x1 <= bx1 + slack and y1 <= by1 + slack
