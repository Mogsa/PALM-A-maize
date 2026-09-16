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
