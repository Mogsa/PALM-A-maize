"""The words under a rectangle of a page, by the whole-word rule of
SPEC-ADDENDUM.md section 5.1. One implementation, read by the selection rules
(snap), a chunk's blocks (blocks), a highlight's line rects (snap and
anchoring) and anything else that needs the text a rectangle covers."""

from itertools import groupby

import pymupdf

from paperboard.geometry import Rect, normalise, union

LINE_INSIDE = 0.5      # a line is under the rect when at least this much of its ink box is inside vertically
WORD_INSIDE = 0.5      # a word on such a line is under it when at least this much of it is inside horizontally
WORD_FLAGS = pymupdf.TEXTFLAGS_WORDS | pymupdf.TEXT_ACCURATE_BBOXES   # ink boxes, not font-metric boxes

# One word as PyMuPDF reports it: x0, y0, x1, y1, text, block, line, word number.
Word = tuple[float, float, float, float, str, int, int, int]


def _share(inner: tuple[float, float], outer: tuple[float, float]) -> float:
    """How much of the interval `inner` lies inside `outer`, 0.0 to 1.0."""
    a0, a1 = inner
    if a1 <= a0:
        return 0.0
    return max(0.0, min(a1, outer[1]) - max(a0, outer[0])) / (a1 - a0)


def page_words(page: pymupdf.Page) -> list[Word]:
    """Every word on the page, with its ink box, in PyMuPDF's block order."""
    return page.get_text("words", flags=WORD_FLAGS)


def page_lines(words: list[Word]) -> list[list[Word]]:
    """Words grouped into PyMuPDF's text lines, keeping their order."""
    return [list(group) for _, group in groupby(words, key=lambda w: (w[5], w[6]))]


def lines_under(page: pymupdf.Page, rect: Rect) -> list[list[Word]]:
    """The words under a rectangle, grouped by text line, in reading order.

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
    selection is still found there as a substring. A line with no word inside is
    left out."""
    x0, y0, x1, y1 = normalise(rect)
    out: list[list[Word]] = []
    for line in page_lines(page_words(page)):
        top, bottom = min(w[1] for w in line), max(w[3] for w in line)
        if _share((top, bottom), (y0, y1)) < LINE_INSIDE:
            continue
        kept = [w for w in line if _share((w[0], w[2]), (x0, x1)) >= WORD_INSIDE]
        if kept:
            out.append(kept)
    return out


def text_under(page: pymupdf.Page, rect: Rect) -> str:
    """The words under a rectangle (`lines_under`), one line per text line. Ends with
    a newline when non-empty, as PyMuPDF's text mode did, so Selection.text keeps
    its shape (ruling R8)."""
    lines = [" ".join(w[4] for w in line) for line in lines_under(page, rect)]
    return "\n".join(lines) + ("\n" if lines else "")


def line_rect(words: list[Word]) -> Rect:
    """The bounding box of some words, ink boxes."""
    rect = normalise(words[0][:4])
    for word in words[1:]:
        rect = union(rect, word[:4])
    return rect


def _same_row(a: Rect, b: Rect) -> bool:
    """Two text lines sit on one printed line when they share most of their height."""
    overlap = min(a[3], b[3]) - max(a[1], b[1])
    return overlap >= LINE_INSIDE * min(a[3] - a[1], b[3] - b[1])


def line_rects(lines: list[list[Word]]) -> list[Rect]:
    """A highlight's rects: one per printed line, the bounding box of the words
    selected on it, so it paints exactly those words (addendum 5.1). PyMuPDF
    splits a printed line where a wide gap sits inside it (measured: "part." and
    the next sentence on ResNet page 2), so consecutive lines of one block on the
    same row are one rect; lines of different blocks, such as two columns, never
    merge."""
    rects: list[Rect] = []
    last_block: int | None = None
    for line in lines:
        rect, block = line_rect(line), line[0][5]
        if rects and block == last_block and _same_row(rects[-1], rect):
            rects[-1] = union(rects[-1], rect)
        else:
            rects.append(rect)
        last_block = block
    return rects


def line_rects_under(page: pymupdf.Page, rect: Rect) -> list[Rect]:
    """One rect per printed line of the words under `rect`, in reading order."""
    return line_rects(lines_under(page, rect))
