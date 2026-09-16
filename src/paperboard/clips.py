"""Render a rectangle of a page to PNG. Figures and equations are clips of the
paper as printed, never re-typeset (SPEC.md section 12)."""

import pymupdf

from paperboard.geometry import normalise, pad
from paperboard.source_model import PageRect

CLIP_PAD = 4.0      # points; a tight clip cuts the bottom row of glyphs
DEFAULT_DPI = 150
MAX_DPI = 300


def render_clip(pdf: pymupdf.Document, target: PageRect, dpi: int = DEFAULT_DPI) -> tuple[bytes, int, int]:
    if not 0 <= target.page < pdf.page_count:
        raise ValueError(f"page {target.page} is outside the document")
    dpi = max(36, min(MAX_DPI, int(dpi)))
    page = pdf[target.page]
    clip = pymupdf.Rect(*pad(normalise(target.rect), CLIP_PAD)) & page.rect
    if clip.is_empty:
        raise ValueError(f"rect {target.rect} lies outside page {target.page}")
    pixmap = page.get_pixmap(clip=clip, dpi=dpi, alpha=False)
    return pixmap.tobytes("png"), pixmap.width, pixmap.height
