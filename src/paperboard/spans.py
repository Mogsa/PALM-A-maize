"""Spans: the paper as the AI layer sees it (spec B3a). A span is one
non-furniture layout region, in reading order, with the id `p{page}-r{n}`:
the page as printed (1-based) and the region's place on that page (1-based).
Computed from source.json each time, never stored in it; a re-extraction may
change them, which is why ai.json records the extraction it was built from."""

import re
from dataclasses import dataclass
from functools import reduce

import pymupdf

from paperboard.geometry import Rect, union
from paperboard.source_model import FURNITURE, LayoutRegion, PageRect, SourceDocument
from paperboard.words import Word, page_words, text_under

_EDGE_PUNCTUATION = re.compile(r"^\W+|\W+$")


@dataclass(frozen=True)
class Span:
    id: str
    page: int   # 0-indexed, as everywhere else in the code
    rect: Rect
    text: str


def span_ids(doc: SourceDocument) -> list[tuple[str, LayoutRegion]]:
    """Every non-furniture region with its span id, in stored (reading) order."""
    counts: dict[int, int] = {}
    out = []
    for region in doc.regions:
        if region.label in FURNITURE:
            continue
        counts[region.page] = counts.get(region.page, 0) + 1
        out.append((f"p{region.page + 1}-r{counts[region.page]}", region))
    return out


def paper_spans(doc: SourceDocument, pdf: pymupdf.Document) -> list[Span]:
    """Each span with its text. A region with no words (a picture) is left out;
    the ids of the others do not change."""
    spans = []
    for span_id, region in span_ids(doc):
        text = text_under(pdf[region.page], region.rect).strip()
        if text:
            spans.append(Span(span_id, region.page, region.rect, text))
    return spans


def words_by_page(pdf: pymupdf.Document) -> dict[int, list[Word]]:
    return {page.number: page_words(page) for page in pdf}


def _bare(word: str) -> str:
    return _EDGE_PUNCTUATION.sub("", word).lower()


def term_occurrences(term: str, pages: dict[int, list[Word]]) -> list[PageRect]:
    """Every place the term's words appear in a row, whole words, any case; one
    rect per occurrence. Punctuation at a word's edges is ignored."""
    wanted = [_bare(w) for w in term.split() if _bare(w)]
    if not wanted:
        return []
    found = []
    for page, words in pages.items():
        bare = [_bare(w[4]) for w in words]
        for i in range(len(words) - len(wanted) + 1):
            if bare[i:i + len(wanted)] == wanted:
                boxes = [w[:4] for w in words[i:i + len(wanted)]]
                found.append(PageRect(page=page, rect=reduce(union, boxes)))
    return found
