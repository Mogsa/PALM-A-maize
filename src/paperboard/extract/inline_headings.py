"""Numbered headings the layout model buried inside another region.

On ross11a page 6 "5 EXPERIMENTS" and "5.1 Super Tux Kart" sit mid-way inside a
region labelled "picture" that spans both columns. No region-level rule can see
them, so this reads the region's lines and accepts a line as a heading only when
every test below holds; then the region is cut at it. The tests are strict on
purpose: a false heading splits a paper's text wrongly, which is worse than a
missed one.
"""

import re
from collections import Counter
from collections.abc import Callable
from dataclasses import dataclass

import pymupdf

from paperboard.geometry import Rect

BOLD_FLAG = 16              # PyMuPDF span flag bit for a bold font
LARGER_THAN_BODY = 0.5      # points; a heading set just above body size counts
MAX_INLINE_HEADING_CHARS = 80
SAME_ROW_GAP = 2.0          # a gap in font sizes; "5" and "EXPERIMENTS" are separate spans
MIN_REMAINDER_WIDTH = 20.0  # points; narrower leftovers beside a column are dropped

# Number, then a title starting with a letter: "5 0.12 0.34" is a table row.
_HEADING = re.compile(r"^(\d+(?:\.\d+)*)\.?\s+([^\W\d_]\S*.*)$")
_NUMBERED = re.compile(r"^\s*\d+(?:\.\d+)*[.)]?\s")
_EQUATION_NUMBER = re.compile(r"\(\d+[a-z]?\)\s*$")


@dataclass(frozen=True)
class Line:
    """One visual row of text: its spans merged, bold if most of its characters are."""

    rect: Rect
    text: str
    bold: bool
    size: float


def allowed_next(last: str | None) -> set[str]:
    """Numbers that may follow `last`: its first child, or the next sibling of it
    or of any ancestor ("3.3" after "3.2.1", "4" after "3.2")."""
    if last is None:
        return {"1"}
    parts = [int(p) for p in last.split(".")]
    allowed = {f"{last}.1"}
    for depth in range(1, len(parts) + 1):
        prefix = parts[: depth - 1] + [parts[depth - 1] + 1]
        allowed.add(".".join(str(p) for p in prefix))
    return allowed


def _heading_number(line: Line, body_size: float) -> str | None:
    """The number of a line that looks like a heading on its own, else None."""
    text = line.text.strip()
    match = _HEADING.match(text)
    if not match or len(text) > MAX_INLINE_HEADING_CHARS:
        return None
    if _EQUATION_NUMBER.search(text) or match.group(2)[0].islower():
        return None
    if not (line.bold or line.size > body_size + LARGER_THAN_BODY):
        return None
    return match.group(1)


def _in_numbered_run(lines: list[Line], index: int) -> bool:
    """A neighbouring line also starts with a number: a list, not a heading."""
    neighbours = [lines[i] for i in (index - 1, index + 1) if 0 <= i < len(lines)]
    return any(_NUMBERED.match(n.text) for n in neighbours)


def accepted_headings(lines: list[Line], body_size: float, last: str | None,
                      after_references: bool = False) -> list[int]:
    """Indexes of the lines accepted as headings, in order. `last` is the number of
    the heading found before these lines; each accepted heading advances it."""
    if after_references:
        return []
    found = []
    for index, line in enumerate(lines):
        number = _heading_number(line, body_size)
        if number is None or number not in allowed_next(last) or _in_numbered_run(lines, index):
            continue
        found.append(index)
        last = number
    return found


def body_size(page: pymupdf.Page) -> float:
    """The page's commonest font size, weighted by characters."""
    sizes: Counter[float] = Counter()
    for span in _spans(page, page.rect):
        sizes[round(span["size"], 1)] += len(span["text"].strip())
    return sizes.most_common(1)[0][0] if sizes else 0.0


def _spans(page: pymupdf.Page, clip) -> list[dict]:
    blocks = page.get_text("dict", clip=pymupdf.Rect(*clip))["blocks"]
    return [s for b in blocks for ln in b.get("lines", []) for s in ln["spans"] if s["text"].strip()]


def read_lines(page: pymupdf.Page, rect: Rect) -> list[Line]:
    """The rows of text inside `rect`, top to bottom. Spans on one row and close
    together join: a heading's number and title are often separate spans."""
    rows: list[list[dict]] = []
    for span in sorted(_spans(page, rect), key=lambda s: (s["bbox"][1], s["bbox"][0])):
        row = next((r for r in rows if _joins(r[-1], span)), None)
        if row is None:
            rows.append([span])
        else:
            row.append(span)
    return sorted((_to_line(r) for r in rows), key=lambda ln: (ln.rect[1], ln.rect[0]))


def _joins(left: dict, span: dict) -> bool:
    _lx0, ly0, lx1, ly1 = left["bbox"]
    x0, y0, _x1, y1 = span["bbox"]
    same_row = min(ly1, y1) - max(ly0, y0) > 0.5 * min(ly1 - ly0, y1 - y0)
    return same_row and 0 <= x0 - lx1 <= SAME_ROW_GAP * max(left["size"], span["size"])


def _to_line(spans: list[dict]) -> Line:
    spans = sorted(spans, key=lambda s: s["bbox"][0])
    chars = sum(len(s["text"]) for s in spans)
    bold_chars = sum(len(s["text"]) for s in spans if s["flags"] & BOLD_FLAG)
    rect = (min(s["bbox"][0] for s in spans), min(s["bbox"][1] for s in spans),
            max(s["bbox"][2] for s in spans), max(s["bbox"][3] for s in spans))
    return Line(rect=rect, text=" ".join(s["text"].strip() for s in spans),
                bold=bold_chars * 2 > chars, size=max(s["size"] for s in spans))


def split_region(rect: Rect, lines: list[Line], headings: list[int],
                 has_art: Callable[[Rect], bool]) -> list[tuple[Rect, str | None]]:
    """Cut a region at its heading lines, in reading order.

    The heading's column is the span of the lines that overlap the heading
    horizontally; when the region reaches beyond it (a picture across both
    columns), the rest stays whole, after the column. The column is cut into
    bands: text above a heading, the heading, text below. Each piece comes back
    with a label: "section-header" for a heading, "text" for a band with no
    artwork in it, None for "keep the region's own label"."""
    x0, y0, x1, y1 = rect
    first = lines[headings[0]].rect
    column = [ln.rect for ln in lines if ln.rect[0] < first[2] and ln.rect[2] > first[0]]
    cx0, cx1 = min(r[0] for r in column), max(r[2] for r in column)
    left, right = cx0 - x0, x1 - cx1
    if max(left, right) < MIN_REMAINDER_WIDTH:
        cx0, cx1 = x0, x1

    pieces: list[tuple[Rect, str | None]] = []
    top = y0
    for index in headings:
        hy0, hy1 = lines[index].rect[1], lines[index].rect[3]
        pieces += _band((cx0, top, cx1, hy0), lines, has_art)
        pieces.append(((cx0, hy0, cx1, hy1), "section-header"))
        top = hy1
    pieces += _band((cx0, top, cx1, y1), lines, has_art)
    if (cx0, cx1) != (x0, x1):
        rest = (cx1, y0, x1, y1) if right >= left else (x0, y0, cx0, y1)
        pieces.append((rest, None))
    return pieces


def _band(band: Rect, lines: list[Line], has_art: Callable[[Rect], bool]) -> list[tuple[Rect, str | None]]:
    """A band of the column, if anything is in it."""
    x0, y0, x1, y1 = band
    if y1 - y0 <= 0:
        return []
    if has_art(band):
        return [(band, None)]
    inside = any(y0 <= (ln.rect[1] + ln.rect[3]) / 2 <= y1 and ln.rect[0] < x1 and ln.rect[2] > x0
                 for ln in lines)
    return [(band, "text")] if inside else []
