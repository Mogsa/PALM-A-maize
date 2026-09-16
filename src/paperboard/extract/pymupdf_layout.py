"""Extraction over `pymupdf-layout`. See SPEC-ADDENDUM.md sections 3 and 3.1."""

from dataclasses import dataclass
from pathlib import Path

import pymupdf
from pymupdf4llm.helpers.document_layout import OCRMode, parse_document

from paperboard.geometry import Rect, normalise
from paperboard.source_model import PageInfo

EXTRACTOR_NAME = "pymupdf-layout/1.28.2"


@dataclass(frozen=True)
class Region:
    """One labelled area of one page, in PyMuPDF page space."""

    page: int
    rect: Rect
    label: str
    header_level: int | None
    text: str


def read_regions(pdf_path: Path) -> tuple[list[PageInfo], list[Region]]:
    """Run layout analysis and return page sizes plus every labelled region.

    Regions come back in reading order within a page, and pages in order, which is
    what lets section extents be computed by walking the list once.
    """
    # OCR never: born-digital papers do not need it, and a test must not depend on
    # whether Tesseract happens to be installed.
    parsed = parse_document(str(pdf_path), use_ocr=OCRMode.NEVER)
    pages: list[PageInfo] = []
    regions: list[Region] = []

    with pymupdf.open(pdf_path) as doc:
        for page_layout in parsed.pages:
            # parse_document numbers pages from 1; PyMuPDF and source.json from 0.
            index = page_layout.page_number - 1
            page = doc[index]
            pages.append(
                PageInfo(
                    index=index,
                    width=page.rect.width,
                    height=page.rect.height,
                    rotation=page.rotation,
                )
            )
            for box in page_layout.boxes:
                rect = normalise((box.x0, box.y0, box.x1, box.y1))
                if rect[2] - rect[0] <= 0 or rect[3] - rect[1] <= 0:
                    continue  # degenerate slivers appear; they carry no content
                regions.append(
                    Region(
                        page=index,
                        rect=rect,
                        label=box.boxclass,
                        header_level=box.header_level,
                        text=page.get_textbox(pymupdf.Rect(*rect)).strip(),
                    )
                )

    return pages, regions
