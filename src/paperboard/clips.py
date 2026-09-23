"""Render a rectangle of a page to PNG. Figures and equations are clips of the
paper as printed, never re-typeset (SPEC.md section 12)."""

import hashlib

import pymupdf

from paperboard.geometry import normalise, pad
from paperboard.source_model import PageRect

CLIP_PAD = 4.0      # points; a tight clip cuts the bottom row of glyphs
DEFAULT_DPI = 216   # three times the page's native 72, so an equation stays sharp (addendum 5.3)
MAX_DPI = 300
ETAG_CHARS = 16     # hex digits of each hash in a render's ETag


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


def render_etag(pdf_sha256: str, target: PageRect, dpi: int) -> str:
    """The ETag of a stateless render (`GET /render`): the PDF's own hash, so a
    replaced PDF invalidates every cached image, and the query."""
    query = f"{target.page}:{list(target.rect)}:{dpi}".encode()
    return f'"{pdf_sha256[:ETAG_CHARS]}-{hashlib.sha256(query).hexdigest()[:ETAG_CHARS]}"'
