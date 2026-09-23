"""The words under a rectangle of a page, by the whole-word rule of
SPEC-ADDENDUM.md section 5.1. One implementation, read by the selection rules
(snap), a chunk's blocks (blocks) and anything else that needs the text a
rectangle covers."""

from itertools import groupby

import pymupdf

from paperboard.geometry import Rect, normalise

LINE_INSIDE = 0.5      # a line is under the rect when at least this much of its ink box is inside vertically
WORD_INSIDE = 0.5      # a word on such a line is under it when at least this much of it is inside horizontally
WORD_FLAGS = pymupdf.TEXTFLAGS_WORDS | pymupdf.TEXT_ACCURATE_BBOXES   # ink boxes, not font-metric boxes


def _share(inner: tuple[float, float], outer: tuple[float, float]) -> float:
    """How much of the interval `inner` lies inside `outer`, 0.0 to 1.0."""
    a0, a1 = inner
    if a1 <= a0:
        return 0.0
    return max(0.0, min(a1, outer[1]) - max(a0, outer[0])) / (a1 - a0)


def text_under(page: pymupdf.Page, rect: Rect) -> str:
    """The words under a rectangle, one line per text line, in reading order.

    Whole words, and only those mostly inside the rect: character-level extraction
    with a clip keeps any glyph whose ink touches the clip (measured: a rect edge 1 pt
    into the next line took its 'T', 'h', 'i', 'f', 'l' and left the rest), which puts
    fragments of neighbouring lines at the start of a cut. A line is under the rect
    when at least LINE_INSIDE of its ink box is inside vertically, and each of its words
    when at least WORD_INSIDE of the word is inside horizontally. The decision is per
    line, not per word, so a cut through a line keeps or drops the line whole rather
    than the words with the taller ink; and it uses ink boxes rather than font-metric
    boxes because a math accent (the hat of v-hat in Adam) has a 36 pt metric box for
    2 pt of ink, which put the equation above a paragraph under a padded drag around
    it. The words are taken without a clip because a clipped "words" call splits words
    on the edge and reports the fragment's own box ('complicate' of 'complicated').
    Lines keep PyMuPDF's block order, the order the page index is built in, so a
    selection is still found there as a substring. Ends with a newline when non-empty,
    as PyMuPDF's text mode did, so Selection.text keeps its shape (ruling R8)."""
    x0, y0, x1, y1 = normalise(rect)
    words = page.get_text("words", flags=WORD_FLAGS)   # x0, y0, x1, y1, word, block, line, word_no
    lines: list[str] = []
    for _, group in groupby(words, key=lambda w: (w[5], w[6])):
        line = list(group)
        top, bottom = min(w[1] for w in line), max(w[3] for w in line)
        if _share((top, bottom), (y0, y1)) < LINE_INSIDE:
            continue
        kept = [w[4] for w in line if _share((w[0], w[2]), (x0, x1)) >= WORD_INSIDE]
        if kept:
            lines.append(" ".join(kept))
    return "\n".join(lines) + ("\n" if lines else "")
