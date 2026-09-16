"""Render every figure of one paper to PNG, so a human can look at them.

The only way to answer SPEC.md build step 1's second question — are the figures
found? — is to look at the crops.
"""

import sys
from pathlib import Path

import pymupdf

from paperboard.extract import extract
from paperboard.geometry import to_fitz

if __name__ == "__main__":
    pdf = Path(sys.argv[1])
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("/tmp/clips")
    out.mkdir(parents=True, exist_ok=True)
    document = extract(pdf)
    with pymupdf.open(pdf) as doc:
        for figure in document.figures:
            page = doc[figure.rect.page]
            pixmap = page.get_pixmap(clip=to_fitz(figure.rect.rect), dpi=150)
            target = out / f"{figure.id}-{figure.confidence}.png"
            pixmap.save(target)
            print(f"{target}  {figure.label}")
