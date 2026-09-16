"""Extraction over `pymupdf-layout`. See SPEC-ADDENDUM.md sections 3 and 3.1."""

import re
from dataclasses import dataclass
from pathlib import Path

import pymupdf
from pymupdf4llm.helpers.document_layout import OCRMode, parse_document

from paperboard.geometry import Rect, normalise
from paperboard.source_model import PageInfo, PageRect, Section

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


# A heading number: "3", "3.1", "3.1.4", or a single appendix letter, then a
# separator. Anchored, so a sentence that merely contains a number is not a heading.
_NUMBER = re.compile(r"^\s*(\d+(?:\.\d+)*|[A-Z])[.)]?\s+\S")

# Layout labels that can never be a section heading, whatever the model says.
_FURNITURE = {"page-header", "page-footer", "footnote", "caption"}

MIN_HEADING_CHARS = 2
MAX_HEADING_CHARS = 120


def parse_number(title: str) -> tuple[str | None, int]:
    """Pull the section number out of a heading and derive depth from it.

    Depth is the count of dot-separated components, so "3.1" is depth 2. An
    unnumbered heading such as "Abstract" is depth 1. This is the parse that no
    extractor saved us; see SPEC-ADDENDUM.md section 3.
    """
    match = _NUMBER.match(title)
    if not match:
        return None, 1
    number = match.group(1).rstrip(".")
    return number, number.count(".") + 1


def _is_heading(region: Region) -> bool:
    if region.label not in {"section-header", "title"}:
        return False
    if region.label == "title" and region.page > 0:
        return False  # only the first page carries the paper title
    text = region.text.strip()
    if not (MIN_HEADING_CHARS <= len(text) <= MAX_HEADING_CHARS):
        return False
    if text.isdigit():
        return False  # a bare page number the model promoted
    if text[0].islower() or text.endswith("."):
        return False  # a body sentence the model promoted; no real heading looks like this
    return True


def build_sections(pages: list[PageInfo], regions: list[Region]) -> list[Section]:
    """One Section per heading, with its extent running to the next heading.

    Extent is what the split command turns into a section piece, so it must cover
    the body text and stop before the following heading. Furniture regions are
    excluded from extents so a running head never lands inside a section.
    """
    body = [r for r in regions if r.label not in _FURNITURE]
    headings = [(i, r) for i, r in enumerate(body) if _is_heading(r)]

    sections: list[Section] = []
    for ordinal, (start, region) in enumerate(headings):
        stop = headings[ordinal + 1][0] if ordinal + 1 < len(headings) else len(body)
        number, depth = parse_number(region.text)
        if number is None and region.header_level:
            # header_level 1 is the paper title, so top-level sections are 2.
            depth = max(1, region.header_level - 1)
        span = body[start:stop]
        sections.append(
            Section(
                id=f"sec-{ordinal}",
                number=number,
                depth=depth,
                title=region.text,
                heading_rect=PageRect(page=region.page, rect=region.rect),
                extent=_extent(span),
                text="\n\n".join(r.text for r in span[1:] if r.text),
            )
        )
    return sections


def _extent(span: list[Region]) -> list[PageRect]:
    """Collapse a run of regions into one bounding rectangle per page crossed."""
    by_page: dict[int, Rect] = {}
    for region in span:
        x0, y0, x1, y1 = region.rect
        if region.page not in by_page:
            by_page[region.page] = (x0, y0, x1, y1)
            continue
        px0, py0, px1, py1 = by_page[region.page]
        by_page[region.page] = (min(px0, x0), min(py0, y0), max(px1, x1), max(py1, y1))
    return [PageRect(page=page, rect=rect) for page, rect in sorted(by_page.items())]
