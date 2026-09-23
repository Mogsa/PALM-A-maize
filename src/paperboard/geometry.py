"""Rectangles, in PyMuPDF page space: points, origin top-left, y down.

This is the only module that knows how a rectangle is spelled. Everything else
passes Rect around. See SPEC-ADDENDUM.md section 2.
"""

import pymupdf

Rect = tuple[float, float, float, float]


def normalise(rect: Rect) -> Rect:
    """Order the corners so x0 < x1 and y0 < y1."""
    x0, y0, x1, y1 = rect
    return (min(x0, x1), min(y0, y1), max(x0, x1), max(y0, y1))


def pad(rect: Rect, points: float) -> Rect:
    """Grow a rectangle on every side. Figure clips need this; a tight clip cuts glyphs."""
    x0, y0, x1, y1 = normalise(rect)
    return (x0 - points, y0 - points, x1 + points, y1 + points)


def contains_point(rect: Rect, x: float, y: float) -> bool:
    x0, y0, x1, y1 = normalise(rect)
    return x0 <= x <= x1 and y0 <= y <= y1


def area(rect: Rect) -> float:
    x0, y0, x1, y1 = normalise(rect)
    return (x1 - x0) * (y1 - y0)


def overlap_ratio(inner: Rect, outer: Rect) -> float:
    """How much of `inner` lies inside `outer`, from 0.0 to 1.0.

    A degenerate `inner` has no area to share, so the ratio is 0.0 rather than a
    ZeroDivisionError. Callers use this to decide containment, and "a zero-area
    rect is inside nothing" is the answer that keeps them simple.
    """
    inner_area = area(inner)
    if inner_area <= 0.0:
        return 0.0
    ax0, ay0, ax1, ay1 = normalise(inner)
    bx0, by0, bx1, by1 = normalise(outer)
    ox0, oy0 = max(ax0, bx0), max(ay0, by0)
    ox1, oy1 = min(ax1, bx1), min(ay1, by1)
    if ox1 <= ox0 or oy1 <= oy0:
        return 0.0
    return ((ox1 - ox0) * (oy1 - oy0)) / inner_area


def to_fitz(rect: Rect) -> pymupdf.Rect:
    return pymupdf.Rect(*normalise(rect))


# A rect joins the current run only if its horizontal centre sits within this
# fraction of the page width of the run's centre. Columns on a two-column page are
# about 0.21 of the page width apart, a full-width figure is about 0.21 from either
# column, and nothing inside one column (indented lists, centred formulas) moves the
# centre by more than about 0.05.
COLUMN_CENTRE_TOLERANCE = 0.15


def union(a: Rect, b: Rect) -> Rect:
    ax0, ay0, ax1, ay1 = normalise(a)
    bx0, by0, bx1, by1 = normalise(b)
    return (min(ax0, bx0), min(ay0, by0), max(ax1, bx1), max(ay1, by1))


def intersection(a: Rect, b: Rect) -> Rect | None:
    """The overlap of two rects, or None when they do not overlap."""
    ax0, ay0, ax1, ay1 = normalise(a)
    bx0, by0, bx1, by1 = normalise(b)
    x0, y0, x1, y1 = max(ax0, bx0), max(ay0, by0), min(ax1, bx1), min(ay1, by1)
    return (x0, y0, x1, y1) if x0 < x1 and y0 < y1 else None


def midpoint(rect: Rect) -> tuple[float, float]:
    x0, y0, x1, y1 = normalise(rect)
    return ((x0 + x1) / 2, (y0 + y1) / 2)


def column_runs(
    items: list[tuple[int, Rect]], page_widths: dict[int, float]
) -> list[tuple[int, Rect]]:
    """Collapse rects in reading order into one hull per column run on a page.

    A run breaks when the page changes, when the next rect's top is above the
    previous rect's top (reading order runs down a column before crossing to
    the next), or when the next rect sits in a different column, judged by its
    horizontal centre. One hull per page was the first rule and it was wrong:
    on a two-column page the hull spans the column gap and covers the other
    column. See SPEC-ADDENDUM.md section 3, `extent`.
    """
    runs: list[tuple[int, Rect]] = []
    last_y0: float | None = None
    for page, rect in items:
        x0, y0, x1, y1 = normalise(rect)
        if runs:
            run_page, hull = runs[-1]
            same_page = page == run_page
            reads_downward = last_y0 is not None and y0 >= last_y0
            same_column = abs(midpoint(hull)[0] - (x0 + x1) / 2) <= (
                COLUMN_CENTRE_TOLERANCE * page_widths[page]
            )
            if same_page and reads_downward and same_column:
                runs[-1] = (run_page, union(hull, (x0, y0, x1, y1)))
                last_y0 = y0
                continue
        runs.append((page, (x0, y0, x1, y1)))
        last_y0 = y0
    return runs
