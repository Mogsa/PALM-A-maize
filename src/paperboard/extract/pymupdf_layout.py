"""Extraction over `pymupdf-layout`. See SPEC-ADDENDUM.md sections 3 and 3.1."""

import re
from dataclasses import dataclass
from pathlib import Path

import pymupdf
from pymupdf4llm.helpers.document_layout import OCRMode, parse_document

from paperboard.geometry import Rect, area, normalise, pad
from paperboard.source_model import Figure, PageInfo, PageRect, Section

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


# Leading characters stripped by _clean_title: anything that is not alphanumeric
# and not an opening bracket a heading might legitimately start with.
_LEADING_JUNK = re.compile(r"^[^\w(\[]+")

# Any run of whitespace, including the line breaks get_textbox preserves.
_WHITESPACE_RUN = re.compile(r"\s+")


def _clean_title(text: str) -> str:
    """Presentation-only cleanup of a heading's text for use as a Section title.

    `region.text` is a faithful record of what the layout model and `get_textbox`
    returned, including line breaks the PDF itself carries and glyph-decoding
    artefacts such as U+FFFD REPLACEMENT CHARACTER for a font glyph with no
    Unicode mapping. Neither belongs in a title a reader sees, so this collapses
    every run of whitespace (line breaks included) to a single space, then strips
    leading characters that are neither alphanumeric nor an opening bracket. It
    does not touch `Region.text`, which stays untouched for source.json.
    """
    collapsed = _WHITESPACE_RUN.sub(" ", text).strip()
    return _LEADING_JUNK.sub("", collapsed)


def _is_heading(region: Region) -> bool:
    if region.label not in {"section-header", "title"}:
        return False
    if region.label == "title" and region.page > 0:
        return False  # only the first page carries the paper title
    text = _clean_title(region.text)
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
        title = _clean_title(region.text)
        number, depth = parse_number(title)
        if number is None and region.header_level:
            # header_level 1 is the paper title, so top-level sections are 2.
            depth = max(1, region.header_level - 1)
        span = body[start:stop]
        sections.append(
            Section(
                id=f"sec-{ordinal}",
                number=number,
                depth=depth,
                title=title,
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


# A caption, not a reference to one: "Figure 3." or "Table 2:" but not "Table 3 shows".
_CAPTION = re.compile(r"^\s*(Figure|Fig\.?|Table)\s*(\d+)\s*[.:]", re.IGNORECASE)
_CAPTION_LABELS = {"caption", "text"}

CAPTION_PAD = 4.0          # points; a tight clip cuts the bottom row of glyphs
MIN_FIGURE_AREA = 2500.0   # square points; smaller boxes are rules and separators
SAME_COLUMN_RATIO = 0.3    # horizontal overlap needed to count as the same column


def _caption_key(text: str) -> tuple[str, str] | None:
    match = _CAPTION.match(text)
    if not match:
        return None
    word = match.group(1).lower()
    kind = "table" if word.startswith("table") else "figure"
    return kind, match.group(2)


def _same_column(a: Rect, b: Rect) -> bool:
    """Two rects share a column if their horizontal spans overlap enough.

    Two-column papers put an unrelated figure directly above a caption in the
    other column, which is the failure this guards against.
    """
    ax0, _, ax1, _ = a
    bx0, _, bx1, _ = b
    width = min(ax1 - ax0, bx1 - bx0)
    if width <= 0:
        return False
    return (min(ax1, bx1) - max(ax0, bx0)) / width >= SAME_COLUMN_RATIO


def build_figures(pdf_path: Path, pages: list[PageInfo], regions: list[Region]) -> list[Figure]:
    """Pair each caption with the artwork it names.

    Proximity matching, because pymupdf-layout does not link the two. Recorded as a
    deliberate trade in SPEC.md section 12: a miss costs one figure piece, which the
    reader cuts by hand in seconds.
    """
    figures: list[Figure] = []
    with pymupdf.open(pdf_path) as doc:
        captions = [r for r in regions if r.label in _CAPTION_LABELS and _CAPTION.match(r.text)]
        for caption in captions:
            kind, number = _caption_key(caption.text)
            found = _find_artwork(doc, regions, caption, kind)
            if found is None:
                continue
            rect, confidence = found
            figures.append(
                Figure(
                    id=f"{'tab' if kind == 'table' else 'fig'}-{number}",
                    kind=kind,
                    label=f"{'Table' if kind == 'table' else 'Figure'} {number}",
                    caption=caption.text,
                    caption_rect=PageRect(page=caption.page, rect=caption.rect),
                    rect=PageRect(page=caption.page, rect=pad(rect, CAPTION_PAD)),
                    confidence=confidence,
                )
            )
    return _dedupe(figures)


def _find_artwork(doc, regions, caption: Region, kind: str):
    """Three branches, cheapest and most trustworthy first."""
    wanted = "table" if kind == "table" else "picture"
    candidates = [
        r
        for r in regions
        if r.page == caption.page
        and r.label == wanted
        and _same_column(r.rect, caption.rect)
        and area(r.rect) >= MIN_FIGURE_AREA
    ]
    if candidates:
        # Nearest above the caption, else nearest below: most papers caption
        # figures underneath and tables on top, and neither is universal.
        above = [r for r in candidates if r.rect[3] <= caption.rect[1] + 1]
        pick = max(above, key=lambda r: r.rect[3]) if above else min(
            candidates, key=lambda r: r.rect[1]
        )
        return pick.rect, "region"

    page = doc[caption.page]
    images = [
        normalise((i["bbox"][0], i["bbox"][1], i["bbox"][2], i["bbox"][3]))
        for i in page.get_image_info()
    ]
    near = [r for r in images if _same_column(r, caption.rect) and area(r) >= MIN_FIGURE_AREA]
    if near:
        above = [r for r in near if r[3] <= caption.rect[1] + 1]
        return (max(above, key=lambda r: r[3]) if above else near[0]), "image"

    clusters = [
        normalise((c.x0, c.y0, c.x1, c.y1))
        for c in page.cluster_drawings()
    ]
    near = [r for r in clusters if _same_column(r, caption.rect) and area(r) >= MIN_FIGURE_AREA]
    if near:
        above = [r for r in near if r[3] <= caption.rect[1] + 1]
        return (max(above, key=lambda r: r[3]) if above else near[0]), "drawings"

    return None


def _dedupe(figures: list[Figure]) -> list[Figure]:
    """Keep the most trusted entry when two captions claim the same number."""
    rank = {"region": 0, "image": 1, "drawings": 2}
    best: dict[str, Figure] = {}
    for figure in figures:
        current = best.get(figure.id)
        if current is None or rank[figure.confidence] < rank[current.confidence]:
            best[figure.id] = figure
    return [best[k] for k in sorted(best)]
