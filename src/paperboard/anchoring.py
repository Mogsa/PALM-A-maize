"""Find a quoted passage again after the text under it has changed.

This is the one part of the tool that is specific to it. The design is
Hypothesis's text-quote anchoring (SPEC-ADDENDUM.md section 5): match on the
quote with whitespace stripped, use prefix and suffix to tell identical
sentences apart, use the stored offset only to break ties, and recover the
rectangle from the matched words on the page rather than trusting stored
geometry. Coordinates come out in PyMuPDF page space because PyMuPDF is the
only thing that produces them.
"""

import bisect
import hashlib
import json
from dataclasses import dataclass, field

import pymupdf
from rapidfuzz import fuzz

from paperboard.board_model import ChunkAnchor, HighlightAnchor, QuoteSelector
from paperboard.geometry import Rect, column_runs, contains_point, midpoint, normalise, union
from paperboard.source_model import PageRect, SourceDocument

MIN_SCORE = 0.5            # below this, a quote is orphaned
MIN_QUOTE_SCORE = 0.6      # the quote itself must match at least this well to be a candidate
FUZZY_MIN_CHARS = 8        # shorter quotes are matched exactly or not at all
WEIGHTS = {"quote": 50.0, "prefix": 20.0, "suffix": 20.0, "position": 2.0}
TOTAL_WEIGHT = sum(WEIGHTS.values())


@dataclass(frozen=True)
class PageIndex:
    page: int
    text: str
    stripped: str
    offsets: list[int]
    # Per-character boxes, filled on first use by `page_char_boxes`. An index is
    # built for one resolve pass over one open PDF, so this caches one rawdict
    # extraction per page for that pass and dies with it (ruling R14).
    cache: dict = field(default_factory=dict, compare=False, repr=False)


@dataclass(frozen=True)
class Match:
    page: int
    start: int
    end: int
    score: float


def anchor_basis(doc: SourceDocument) -> str:
    """Fingerprint of everything re-finding an anchor reads: the page text and the
    layout regions. Not the extraction timestamp, so re-extracting an unchanged paper
    keeps the same basis. When a board's stored basis matches, its anchors were made
    against this exact text and re-finding them can only add error, never fix any."""
    payload = json.dumps(
        {
            "page_text": [[p.page, p.text] for p in doc.page_text],
            "regions": [[r.page, list(r.rect), r.label] for r in doc.regions],
        },
        separators=(",", ":"),
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


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


def _flank_pad(needle: str) -> int:
    """How far past `partial_ratio_alignment`'s window to look for the real
    edge. Ruling R7: about half the needle's length each side."""
    return max(1, len(needle) // 2)


def _best_flank_start(needle: str, haystack: str, approx: int, pad: int) -> int:
    """The position near `approx` where `needle` and `haystack` agree for the
    longest *exact*, character-for-character run starting there.

    `partial_ratio_alignment` returns a window exactly as long as `needle`,
    which is the wrong length whenever the matched occurrence gained or lost
    a word relative to the needle (addendum 5.2's fuzzy step is meant for
    exactly that case). Re-aligning with another fuzzy comparison over a
    padded window re-introduces the same problem one level down: with
    edit-distance scoring, a short coincidental run just before the real
    match (for instance the "Le" that both "Learning" and "Let us..." start
    with) can score as well as the real, much longer run and win on a tie.
    Exact matching does not have that failure mode -- a coincidental run is
    almost always one or two characters, while the real, unedited flank of
    the needle matches for many characters before the edit point, so the
    longest exact run reliably identifies the true edge even when a repeated
    short substring sits right next to it.
    """
    best_len, best_at = -1, approx
    n = len(needle)
    lo, hi = max(0, approx - pad), min(len(haystack), approx + pad)
    for cand in range(lo, hi + 1):
        window = haystack[cand:cand + n]
        i = 0
        limit = min(n, len(window))
        while i < limit and needle[i] == window[i]:
            i += 1
        if i > best_len:
            best_len, best_at = i, cand
    return best_at


def _best_flank_end(needle: str, haystack: str, approx: int, pad: int) -> int:
    """The mirror of `_best_flank_start`: the position near `approx` where
    `needle` and `haystack` agree for the longest exact run ending there."""
    best_len, best_at = -1, approx
    n = len(needle)
    lo, hi = max(0, approx - pad), min(len(haystack), approx + pad)
    for cand in range(lo, hi + 1):
        start = max(0, cand - n)
        window = haystack[start:cand]
        i = 0
        limit = min(n, len(window))
        while i < limit and needle[n - 1 - i] == window[len(window) - 1 - i]:
            i += 1
        if i > best_len:
            best_len, best_at = i, cand
    return best_at


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
    pad = _flank_pad(quote)
    start = _best_flank_start(quote, page.stripped, alignment.dest_start, pad)
    end = _best_flank_end(quote, page.stripped, alignment.dest_end, pad)
    if end <= start:
        start, end = alignment.dest_start, alignment.dest_end
    return [(start, end, alignment.score / 100.0)]


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
    box spans between them.

    This unions *every* place `text` occurs on the page, so it is only correct
    when `text` occurs once. When a matched occurrence might repeat elsewhere
    on the page, use `rect_for_offsets` instead, which reads geometry off the
    specific characters that were matched and never touches another
    occurrence's rectangle (ruling R6). This function stays as the fallback
    for when that fails, and for callers, such as a fresh selection with no
    stored offsets yet, that have only text to search for."""
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


def _char_boxes(page: pymupdf.Page) -> list[tuple[str, Rect]]:
    """One (character, bounding box) pair per non-whitespace character, in the
    same reading order PyMuPDF's plain `get_text()` produces. Measured
    (scratch script, all pages of all three fixture papers): the
    whitespace-stripped character sequence from `rawdict` is identical, page
    for page, to `PageIndex.stripped` built from `get_text()`, so index `i`
    here is normally the box for `stripped[i]`. `rawdict` is a different
    extraction path than `get_text()`, though, and nothing guarantees they
    agree on every PDF (ligatures, dropped or substituted glyphs, unusual
    encodings) -- `rect_for_offsets` keeps the character alongside the box so
    it can check that assumption for the slice it actually uses, rather than
    trusting the index blindly."""
    chars: list[tuple[str, Rect]] = []
    raw = page.get_text("rawdict")
    for block in raw["blocks"]:
        if block.get("type") != 0:  # text blocks only; images carry no chars
            continue
        for line in block["lines"]:
            for span in line["spans"]:
                for ch in span["chars"]:
                    if not ch["c"].isspace():
                        chars.append((ch["c"], normalise(tuple(ch["bbox"]))))
    return chars


def page_char_boxes(page: pymupdf.Page, page_index: PageIndex) -> list[tuple[str, Rect]]:
    """`_char_boxes` for this page, read once per index (ruling R14: measured
    60 highlights resolving in about 1.1 s when every call re-read rawdict)."""
    if "chars" not in page_index.cache:
        page_index.cache["chars"] = _char_boxes(page)
    return page_index.cache["chars"]


def rect_for_stripped(page: pymupdf.Page, page_index: PageIndex, s: int, e: int) -> Rect | None:
    """The bounding box of the characters at `page_index.stripped[s:e]`, read
    off PyMuPDF's per-character boxes.

    Before trusting those boxes, the slice of the `rawdict` character sequence
    is checked against `page_index.stripped[s:e]` -- the same slice, not just
    the same length, since a same-length substitution would pass a length-only
    check. `get_text()` (what `page_index.stripped` is built from) and
    `rawdict` are two different extraction paths; this fixture set always
    agrees between them, but nothing enforces that in general, and a
    plausible-looking rect built from the wrong characters would be silently
    wrong. Returns `None` when the slice does not check out."""
    chars = page_char_boxes(page, page_index)
    e = min(e, len(chars))
    if s < 0 or s >= e:
        return None
    matched = chars[s:e]
    if "".join(c for c, _ in matched) != page_index.stripped[s:e]:
        return None
    rect = matched[0][1]
    for _, box in matched[1:]:
        rect = union(rect, box)
    return rect


def rect_for_offsets(page: pymupdf.Page, page_index: PageIndex, start: int, end: int) -> Rect | None:
    """The bounding box of exactly the characters at `page_index.text[start:end]`
    (unstripped offsets, the same convention as `Match.start`/`Match.end`).

    Ruling R6: `rects_for_text` unions every occurrence `search_for` finds, so
    a repeated phrase (measured: "shortcut connections" occurs 5 times on
    ResNet page 1) comes back as a box spanning every occurrence, not the one
    `find_quote` chose. Reading the boxes off the matched characters
    themselves cannot pick up another occurrence, because it never searches
    for text at all. Returns `None` when the character boxes do not line up
    with the page text (see `rect_for_stripped`), so the caller
    (`_recover_rect`) falls back to `rects_for_text`.
    """
    if end <= start:
        return None
    offsets = page_index.offsets
    s = bisect.bisect_left(offsets, start)
    e = bisect.bisect_left(offsets, end - 1) + 1
    return rect_for_stripped(page, page_index, s, e)


def _holds(found: tuple[int, Rect], stored: list[PageRect]) -> bool:
    """Ruling R12, the one "unchanged" rule: the recovered text box's midpoint
    lies inside a stored rect on the page it was found on. The same midpoint
    rule `highlights_in` and the frontend use to say a mark is under a region.
    A rect is paint geometry drawn by the reader, so it may be looser than the
    glyphs (a padded drag) or cut through a line; the text still being under
    it is what "unchanged" means."""
    page, rect = found
    point = midpoint(rect)
    return any(r.page == page and contains_point(r.rect, *point) for r in stored)


def _recover_rect(pdf: pymupdf.Document, index: list[PageIndex], match: Match) -> Rect | None:
    """The matched occurrence's own rectangle: character boxes first (exact to
    the occurrence, ruling R6), the old text-search as a fallback for the rare
    case a character box cannot be read (for instance a character PyMuPDF
    reports in the text stream but does not place, such as certain ligature
    or hyphenation artifacts)."""
    page_index = index[match.page]
    rect = rect_for_offsets(pdf[match.page], page_index, match.start, match.end)
    if rect is not None:
        return rect
    found_text = page_index.text[match.start:match.end]
    return rects_for_text(pdf[match.page], found_text)


def resolve_highlight(anchor: HighlightAnchor, index: list[PageIndex], pdf: pymupdf.Document) -> HighlightAnchor:
    match = find_quote(index, anchor.quote, anchor.position, anchor.page)
    if match is None:
        return anchor.model_copy(update={"state": "orphaned"})
    rect = _recover_rect(pdf, index, match)
    position = global_position(index, match.page, match.start)
    if rect is None:
        # The quote itself was found; only its geometry could not be rebuilt
        # (finding I-3). That is not the same as the quote being gone: on the
        # stored page the stored rect still means something, so keep it and
        # stay anchored. Only orphan when the match also moved to a different
        # page, where the stored rect no longer corresponds to anything.
        if match.page == anchor.page:
            return anchor.model_copy(update={"state": "anchored", "position": position})
        return anchor.model_copy(update={"state": "orphaned"})
    if _holds((match.page, rect), [PageRect(page=anchor.page, rect=anchor.rect)]):
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


def _quoted(selector: QuoteSelector) -> bool:
    return bool(strip_whitespace(selector.exact)[0])


def resolve_chunk(anchor: ChunkAnchor, index: list[PageIndex], pdf: pymupdf.Document, doc: SourceDocument) -> ChunkAnchor:
    """Anchor the two ends independently. If both hold where they were (ruling
    R12: each end's text box has its midpoint inside a stored rect on its
    page), keep the stored rects. If they moved, rebuild the region from the
    layout regions between them with the same column-run rule extraction uses.
    A chunk with no quotable text at either end (a figure with no text layer)
    has nothing to re-find and anchors on its geometry alone. An end with an
    empty quote (a split section ending on a picture) is no evidence either way:
    the chunk anchors on its other end plus the stored geometry."""
    start_quoted, end_quoted = _quoted(anchor.start), _quoted(anchor.end)
    if not start_quoted and not end_quoted:
        return anchor.model_copy(update={"state": "anchored"})
    first_page = anchor.rects[0].page
    start = find_quote(index, anchor.start, anchor.position, first_page)
    end = find_quote(index, anchor.end, anchor.position, anchor.rects[-1].page)
    if start is None and end is None:
        return anchor.model_copy(update={"state": "orphaned"})

    def located(match: Match | None, fallback: PageRect) -> tuple[int, Rect]:
        if match is None:
            return fallback.page, fallback.rect
        rect = _recover_rect(pdf, index, match)
        return (match.page, rect) if rect else (fallback.page, fallback.rect)

    def holds(match: Match | None, quoted: bool, at: tuple[int, Rect]) -> bool:
        return _holds(at, anchor.rects) if match else not quoted

    start_at = located(start, anchor.rects[0])
    end_at = located(end, anchor.rects[-1])
    if holds(start, start_quoted, start_at) and holds(end, end_quoted, end_at):
        position = global_position(index, start.page, start.start) if start else anchor.position
        return anchor.model_copy(update={"state": "anchored", "position": position})

    widths = {p.index: p.width for p in doc.pages}
    runs = column_runs(_regions_between(doc, start_at, end_at), widths)
    rects = [PageRect(page=page, rect=rect) for page, rect in runs]
    position = global_position(index, start.page, start.start) if start else anchor.position
    return anchor.model_copy(update={"rects": rects, "position": position, "state": "relocated"})

