# Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `paperboard extract paper.pdf` writes a `source.json` holding the paper's sections and figures with page rectangles, good enough that the split command and export can be built on it.

**Architecture:** One Python package, `paperboard`. A pydantic model of `source.json`, an `extract()` interface with exactly one implementation over `pymupdf-layout`, and a CLI. No web server, no UI, no network. Tests are golden files over three committed fixture papers.

**Tech Stack:** Python 3.12, `pymupdf` / `pymupdf4llm` / `pymupdf-layout` pinned to 1.28.2, pydantic 2, typer, pytest, ruff.

**Spec:** `docs/SPEC.md` and `docs/SPEC-ADDENDUM.md`. Read both. The addendum sections 2 and 3 are this plan's contract; where this plan and the addendum disagree, the addendum wins and the plan is wrong.

## Global Constraints

- **All geometry is PyMuPDF page space: PDF points, origin top-left, y increasing downward, pages 0-indexed.** No flips anywhere. (Addendum section 2.)
- A rectangle is always `[x0, y0, x1, y1]`, floats, with `x0 < x1` and `y0 < y1`.
- Page height comes from `page.rect.height`. Never hardcode 792.
- Pin the triplet exactly: `pymupdf == pymupdf4llm == pymupdf-layout == 1.28.2`. `pymupdf4llm` raises `ImportError` on a version mismatch.
- No network access at runtime, including first run. Model weights ship inside the `pymupdf-layout` wheel. A test that reaches the network is a bug.
- Licence is AGPL-3.0. Do not add a dependency whose model weights are non-commercial, unlicensed, or carry Share-a-Like terms on output. (Addendum section 3.2 lists the rejected ones and why.)
- Nothing in this package generates text. It extracts what is there. (SPEC.md principle 1.)
- `source.json` is generated and never hand-edited. Re-running extraction rewrites it wholesale.

---

## File Structure

```
pyproject.toml                       # deps, pins, ruff + pytest config
src/paperboard/__init__.py
src/paperboard/geometry.py           # Rect helpers; the only place tuples become rects
src/paperboard/source_model.py       # pydantic models: the source.json contract
src/paperboard/extract/__init__.py   # the extract() interface
src/paperboard/extract/pymupdf_layout.py   # the one implementation
src/paperboard/cli.py                # typer app: `paperboard extract`
tests/conftest.py                    # fixture paths
tests/fixtures/papers/*.pdf          # three CC-BY arXiv papers
tests/fixtures/papers/SOURCES.md     # provenance and licence of each
tests/fixtures/golden/*.json         # expected source.json per fixture
tests/test_geometry.py
tests/test_source_model.py
tests/test_sections.py
tests/test_figures.py
tests/test_golden.py
tests/test_cli.py
```

`extract/` is a package, not a module, because the whole point of the interface is that a second implementation can land beside the first without anything outside the package noticing. (Addendum section 3.1.)

---

### Task 1: Project scaffold and fixture papers

**Files:**
- Create: `pyproject.toml`, `src/paperboard/__init__.py`, `tests/conftest.py`
- Create: `tests/fixtures/papers/SOURCES.md`
- Create: `tests/fixtures/papers/{attention,resnet,adam}.pdf`

**Interfaces:**
- Consumes: nothing.
- Produces: `FIXTURES` dict in `tests/conftest.py` mapping `"attention" | "resnet" | "adam"` to `Path`. Every later task's tests use it.

Three papers, chosen because the research measured them and they cover the failure modes: **attention** (`1706.03762`, has a PDF outline, a figure the layout model misses, heavy tables), **resnet** (`1512.03385`, *no* PDF outline, figure-dense), **adam** (`1412.6980`, no outline, small-caps headings smaller than body text, display equations that shatter under naive extraction).

- [ ] **Step 1: Write `pyproject.toml`**

```toml
[project]
name = "paperboard"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
    "pymupdf==1.28.2",
    "pymupdf4llm==1.28.2",
    "pymupdf-layout==1.28.2",
    "pydantic>=2.9",
    "typer>=0.12",
]

[project.optional-dependencies]
dev = ["pytest>=8.3", "ruff>=0.6"]

[project.scripts]
paperboard = "paperboard.cli:app"

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.pytest.ini_options]
testpaths = ["tests"]

[tool.ruff]
line-length = 100
```

- [ ] **Step 2: Download the three fixture papers**

```bash
mkdir -p tests/fixtures/papers tests/fixtures/golden
curl -L -o tests/fixtures/papers/attention.pdf https://arxiv.org/pdf/1706.03762v7
curl -L -o tests/fixtures/papers/resnet.pdf    https://arxiv.org/pdf/1512.03385v1
curl -L -o tests/fixtures/papers/adam.pdf      https://arxiv.org/pdf/1412.6980v9
```

Check each is under 3 MB and opens. If any arXiv URL 404s, take the same paper id from a
different version suffix; do not substitute a different paper, because the assertions in
later tasks are measurements of these three.

- [ ] **Step 3: Record fixture provenance**

Write `tests/fixtures/papers/SOURCES.md`:

```markdown
# Fixture papers

Committed for testing. Each is arXiv-hosted and used here under its arXiv licence.
Verify the licence line on the arXiv abstract page before adding a new fixture; this
project is AGPL-3.0 and cannot ship non-redistributable files.

| File | arXiv | Title | Why this one |
|---|---|---|---|
| attention.pdf | 1706.03762v7 | Attention Is All You Need | Has a PDF outline. Figure 1 is missed by the layout model, so it exercises the figure fallback chain. |
| resnet.pdf | 1512.03385v1 | Deep Residual Learning for Image Recognition | No PDF outline. Figure- and table-dense. |
| adam.pdf | 1412.6980v9 | Adam: A Method for Stochastic Optimization | No outline, small-caps headings smaller than body text, display equations. The hard case. |
```

- [ ] **Step 4: Write `tests/conftest.py`**

```python
from pathlib import Path

import pytest

FIXTURE_DIR = Path(__file__).parent / "fixtures"
PAPER_DIR = FIXTURE_DIR / "papers"
GOLDEN_DIR = FIXTURE_DIR / "golden"

FIXTURES = {
    "attention": PAPER_DIR / "attention.pdf",
    "resnet": PAPER_DIR / "resnet.pdf",
    "adam": PAPER_DIR / "adam.pdf",
}


@pytest.fixture(params=sorted(FIXTURES))
def paper_name(request) -> str:
    return request.param


@pytest.fixture
def paper_path(paper_name: str) -> Path:
    return FIXTURES[paper_name]
```

- [ ] **Step 5: Write a test that the environment is sound**

`tests/test_fixtures.py`:

```python
import pymupdf
import pymupdf4llm
import pymupdf.layout  # noqa: F401  -- import must not touch the network

from conftest import FIXTURES


def test_version_triplet_matches():
    assert pymupdf.__version__ == pymupdf4llm.__version__ == "1.28.2"


def test_every_fixture_opens_and_has_pages(paper_path):
    with pymupdf.open(paper_path) as doc:
        assert doc.page_count > 5


def test_fixtures_are_small_enough_to_commit():
    assert sum(p.stat().st_size for p in FIXTURES.values()) < 5_000_000
```

- [ ] **Step 6: Install and run**

```bash
python -m venv .venv && .venv/bin/pip install -e ".[dev]"
.venv/bin/pytest tests/test_fixtures.py -v
```
Expected: 5 passed (one version test, three parametrized opens, one size test).

- [ ] **Step 7: Commit**

```bash
git add pyproject.toml src tests
git commit -m "chore: scaffold paperboard package and fixture papers"
```

---

### Task 2: The `source.json` contract

**Files:**
- Create: `src/paperboard/geometry.py`
- Create: `src/paperboard/source_model.py`
- Test: `tests/test_geometry.py`, `tests/test_source_model.py`

**Interfaces:**
- Consumes: nothing.
- Produces — every later task and both sibling plans depend on these exact names:
  - `paperboard.geometry.Rect` — `tuple[float, float, float, float]` alias.
  - `paperboard.geometry.normalise(rect) -> Rect`, `pad(rect, points) -> Rect`, `area(rect) -> float`, `contains_point(rect, x, y) -> bool`, `overlap_ratio(inner, outer) -> float`, `to_fitz(rect) -> pymupdf.Rect`.
  - `paperboard.source_model.PageInfo(index: int, width: float, height: float, rotation: int)`
  - `paperboard.source_model.PageRect(page: int, rect: Rect)`
  - `paperboard.source_model.Section(id, number, depth, title, heading_rect: PageRect, extent: list[PageRect], text)`
  - `paperboard.source_model.Figure(id, kind, label, caption, caption_rect, rect, confidence)`
  - `paperboard.source_model.PageText(page: int, text: str)`
  - `paperboard.source_model.LayoutRegion(page: int, rect: Rect, label: str)`
  - `paperboard.source_model.SourceDocument(schema, paper_id, extracted_at, extractor, pages, sections, figures, regions, page_text)`

- [ ] **Step 1: Write the failing geometry test**

`tests/test_geometry.py`:

```python
import pytest

from paperboard.geometry import area, contains_point, normalise, overlap_ratio, pad


def test_normalise_orders_corners():
    assert normalise((10.0, 20.0, 5.0, 8.0)) == (5.0, 8.0, 10.0, 20.0)


def test_normalise_leaves_a_good_rect_alone():
    assert normalise((1.0, 2.0, 3.0, 4.0)) == (1.0, 2.0, 3.0, 4.0)


def test_pad_grows_every_side():
    assert pad((10.0, 10.0, 20.0, 20.0), 4.0) == (6.0, 6.0, 24.0, 24.0)


def test_contains_point_is_inclusive_on_the_edge():
    assert contains_point((0.0, 0.0, 10.0, 10.0), 0.0, 5.0)
    assert not contains_point((0.0, 0.0, 10.0, 10.0), 10.1, 5.0)


def test_overlap_ratio_is_area_of_intersection_over_inner():
    # inner is half inside outer
    assert overlap_ratio((0.0, 0.0, 10.0, 10.0), (5.0, 0.0, 15.0, 10.0)) == pytest.approx(0.5)


def test_overlap_ratio_is_zero_when_disjoint():
    assert overlap_ratio((0.0, 0.0, 1.0, 1.0), (5.0, 5.0, 6.0, 6.0)) == 0.0


def test_area_of_a_rect():
    assert area((0.0, 0.0, 10.0, 4.0)) == 40.0


def test_overlap_ratio_of_a_degenerate_rect_is_zero_not_a_crash():
    assert overlap_ratio((1.0, 1.0, 1.0, 1.0), (0.0, 0.0, 10.0, 10.0)) == 0.0
```

- [ ] **Step 2: Run it and watch it fail**

Run: `.venv/bin/pytest tests/test_geometry.py -v`
Expected: FAIL, `ModuleNotFoundError: No module named 'paperboard.geometry'`.

- [ ] **Step 3: Write `src/paperboard/geometry.py`**

```python
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
```

- [ ] **Step 4: Run the geometry tests**

Run: `.venv/bin/pytest tests/test_geometry.py -v`
Expected: 8 passed.

- [ ] **Step 5: Write the failing model test**

`tests/test_source_model.py`:

```python
import pytest
from pydantic import ValidationError

from paperboard.source_model import PageRect, Section, SourceDocument


def test_page_rect_rejects_an_inverted_rectangle():
    with pytest.raises(ValidationError):
        PageRect(page=0, rect=(10.0, 10.0, 5.0, 20.0))


def test_page_rect_rejects_a_negative_page():
    with pytest.raises(ValidationError):
        PageRect(page=-1, rect=(0.0, 0.0, 1.0, 1.0))


def test_section_depth_defaults_to_one():
    section = Section(
        id="sec-1",
        number=None,
        title="Abstract",
        heading_rect=PageRect(page=0, rect=(1.0, 2.0, 3.0, 4.0)),
        extent=[],
        text="",
    )
    assert section.depth == 1


def test_source_document_round_trips_through_json():
    doc = SourceDocument(
        paper_id="x",
        extractor="test/0",
        pages=[{"index": 0, "width": 612.0, "height": 792.0, "rotation": 0}],
    )
    assert SourceDocument.model_validate_json(doc.model_dump_json()) == doc


def test_schema_version_is_pinned_to_one():
    assert SourceDocument(paper_id="x", extractor="t", pages=[]).schema_version == 1
```

- [ ] **Step 6: Run it and watch it fail**

Run: `.venv/bin/pytest tests/test_source_model.py -v`
Expected: FAIL, `ModuleNotFoundError: No module named 'paperboard.source_model'`.

- [ ] **Step 7: Write `src/paperboard/source_model.py`**

```python
"""The `source.json` contract. See SPEC-ADDENDUM.md section 3.

Generated by extraction and never hand-edited. Anything reading source.json reads
it through these models, so a field rename breaks loudly here rather than quietly
three modules away.
"""

from datetime import UTC, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from paperboard.geometry import Rect

SCHEMA_VERSION = 1


class PageInfo(BaseModel):
    index: int = Field(ge=0)
    width: float = Field(gt=0)
    height: float = Field(gt=0)
    rotation: int = 0


class PageRect(BaseModel):
    """A rectangle on a page. Page is 0-indexed; geometry is per addendum section 2."""

    page: int = Field(ge=0)
    rect: Rect

    @field_validator("rect")
    @classmethod
    def _corners_must_be_ordered(cls, value: Rect) -> Rect:
        x0, y0, x1, y1 = value
        if not (x0 < x1 and y0 < y1):
            raise ValueError(f"rect must have x0 < x1 and y0 < y1, got {value!r}")
        return value


class Section(BaseModel):
    id: str
    number: str | None = None
    depth: int = Field(default=1, ge=1)
    title: str
    heading_rect: PageRect
    extent: list[PageRect] = []
    text: str = ""


FigureConfidence = Literal["region", "image", "drawings"]


class Figure(BaseModel):
    id: str
    kind: Literal["figure", "table"]
    label: str | None = None
    caption: str = ""
    caption_rect: PageRect | None = None
    rect: PageRect
    confidence: FigureConfidence


class PageText(BaseModel):
    page: int = Field(ge=0)
    text: str


class LayoutRegion(BaseModel):
    """One labelled layout box. Stored for the snap rule in SPEC-ADDENDUM.md section 5.3
    and nothing else: the API must not re-run the layout model per request."""

    page: int = Field(ge=0)
    rect: Rect
    label: str


class SourceDocument(BaseModel):
    schema_version: int = Field(default=SCHEMA_VERSION, alias="schema")
    paper_id: str
    extracted_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    extractor: str
    pages: list[PageInfo]
    sections: list[Section] = []
    figures: list[Figure] = []
    regions: list[LayoutRegion] = []
    page_text: list[PageText] = []

    model_config = {"populate_by_name": True}
```

`schema_version` carries `alias="schema"` because the JSON key is `schema` per the
addendum, but `BaseModel.schema` is taken by pydantic itself. `populate_by_name` lets both
spellings construct the model.

- [ ] **Step 8: Run the model tests**

Run: `.venv/bin/pytest tests/test_source_model.py -v`
Expected: 5 passed.

- [ ] **Step 9: Commit**

```bash
git add src/paperboard/geometry.py src/paperboard/source_model.py tests/test_geometry.py tests/test_source_model.py
git commit -m "feat: add geometry helpers and the source.json model"
```

---

### Task 3: Pages and layout regions

**Files:**
- Create: `src/paperboard/extract/__init__.py`
- Create: `src/paperboard/extract/pymupdf_layout.py`
- Test: `tests/test_regions.py`

**Interfaces:**
- Consumes: `geometry.Rect`, `source_model.PageInfo`.
- Produces:
  - `paperboard.extract.extract(pdf_path: Path) -> SourceDocument` — the interface. A second extractor implements this signature and nothing outside `extract/` changes.
  - `paperboard.extract.pymupdf_layout.Region(page: int, rect: Rect, label: str, header_level: int | None, text: str)` — a dataclass.
  - `paperboard.extract.pymupdf_layout.read_regions(pdf_path) -> tuple[list[PageInfo], list[Region]]`

- [ ] **Step 1: Write the failing test**

`tests/test_regions.py`:

```python
from paperboard.extract.pymupdf_layout import read_regions

LABELS = {
    "title", "section-header", "text", "list-item", "caption",
    "picture", "table", "formula", "footnote", "page-header", "page-footer",
}


def test_pages_are_zero_indexed_and_sized(paper_path):
    pages, _ = read_regions(paper_path)
    assert pages[0].index == 0
    assert [p.index for p in pages] == list(range(len(pages)))
    assert all(p.width > 0 and p.height > 0 for p in pages)


def test_every_region_uses_a_known_label(paper_path):
    _, regions = read_regions(paper_path)
    assert regions
    assert {r.label for r in regions} <= LABELS


def test_every_region_lies_inside_its_page(paper_path):
    pages, regions = read_regions(paper_path)
    for region in regions:
        page = pages[region.page]
        x0, y0, x1, y1 = region.rect
        assert x0 < x1 and y0 < y1
        # A one-point slop: layout boxes occasionally touch the trim edge.
        assert -1 <= x0 and x1 <= page.width + 1
        assert -1 <= y0 and y1 <= page.height + 1


def test_resnet_has_section_headers_without_a_pdf_outline(paper_path, paper_name):
    if paper_name != "resnet":
        return
    _, regions = read_regions(paper_path)
    headers = [r for r in regions if r.label == "section-header"]
    assert len(headers) >= 10
    assert any("Residual Learning" in r.text for r in headers)


def test_page_zero_title_box_holds_the_paper_title(paper_path, paper_name):
    """parse_document numbers pages from 1. Off by one, and every box reads the
    text of the following page. This is the test that catches it."""
    _, regions = read_regions(paper_path)
    title = next(r for r in regions if r.page == 0 and r.label == "title")
    expected = {
        "attention": "Attention Is All You Need",
        "resnet": "Deep Residual Learning",
        "adam": "ADAM",
    }[paper_name]
    assert expected.lower() in title.text.lower()
```

- [ ] **Step 2: Run it and watch it fail**

Run: `.venv/bin/pytest tests/test_regions.py -v`
Expected: FAIL, `ModuleNotFoundError: No module named 'paperboard.extract'`.

- [ ] **Step 3: Write `src/paperboard/extract/pymupdf_layout.py`**

`parse_document()` is used rather than the faster `m.predict()` because extraction runs
once per paper and we want `header_level` and per-box text in the same pass. See addendum
section 3.

```python
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
```

- [ ] **Step 4: Write the interface, `src/paperboard/extract/__init__.py`**

```python
"""The extractor interface.

Exactly one implementation today. A second one — Docling, or opendataloader-pdf —
is a new module here that returns the same SourceDocument, plus a change to the
one line below. Nothing outside this package knows which ran.
See SPEC-ADDENDUM.md section 3.1.
"""

from pathlib import Path

from paperboard.source_model import SourceDocument


def extract(pdf_path: Path) -> SourceDocument:
    """Read a PDF and return its structure. Never mutates the PDF."""
    from paperboard.extract.pymupdf_layout import extract_document

    return extract_document(pdf_path)
```

`extract_document` does not exist yet; Task 7 writes it. Until then this module imports
fine and only fails when called, which is what keeps Tasks 3 to 6 independently testable.

- [ ] **Step 5: Run the region tests**

Run: `.venv/bin/pytest tests/test_regions.py -v`
Expected: 15 passed (five tests across three papers). The run takes roughly 10 seconds
per paper; `parse_document` may invoke OCR on a few pages.

- [ ] **Step 6: Commit**

```bash
git add src/paperboard/extract tests/test_regions.py
git commit -m "feat: read labelled layout regions from a PDF"
```

---

### Task 4: Sections — title, depth, extent

**Files:**
- Modify: `src/paperboard/extract/pymupdf_layout.py`
- Test: `tests/test_sections.py`

**Interfaces:**
- Consumes: `Region`, `PageInfo` from Task 3.
- Produces: `paperboard.extract.pymupdf_layout.build_sections(pages, regions) -> list[Section]`, and `parse_number(title) -> tuple[str | None, int]` returning `(number, depth)`.

Depth comes from the heading's own numbering first and `header_level` only as a fallback,
because `header_level` is a font-size proxy and Adam's headings are smaller than its body
text. (Addendum section 3.)

- [ ] **Step 1: Write the failing test**

`tests/test_sections.py`:

```python
import pytest

from paperboard.extract.pymupdf_layout import build_sections, parse_number, read_regions


@pytest.mark.parametrize(
    ("title", "expected"),
    [
        ("1. Introduction", ("1", 1)),
        ("3.1. Residual Learning", ("3.1", 2)),
        ("3.1.4 Something Deep", ("3.1.4", 3)),
        ("2 Related Work", ("2", 1)),
        ("Abstract", (None, 1)),
        ("A. Appendix", ("A", 1)),
        ("", (None, 1)),
    ],
)
def test_parse_number(title, expected):
    assert parse_number(title) == expected


def test_parse_number_ignores_a_trailing_sentence_period():
    assert parse_number("Attention Is All You Need.") == (None, 1)


def test_sections_are_found_and_ordered(paper_path):
    pages, regions = read_regions(paper_path)
    sections = build_sections(pages, regions)
    assert len(sections) >= 5
    order = [(s.heading_rect.page, s.heading_rect.rect[1]) for s in sections]
    assert order == sorted(order)


def test_section_ids_are_unique(paper_path):
    pages, regions = read_regions(paper_path)
    sections = build_sections(pages, regions)
    ids = [s.id for s in sections]
    assert len(ids) == len(set(ids))


def test_resnet_nesting_matches_its_numbering(paper_path, paper_name):
    if paper_name != "resnet":
        return
    pages, regions = read_regions(paper_path)
    by_title = {s.title: s for s in build_sections(pages, regions)}
    intro = next(s for t, s in by_title.items() if "Introduction" in t)
    sub = next(s for t, s in by_title.items() if "Residual Learning" in t and s.number == "3.1")
    assert intro.depth == 1
    assert sub.depth == 2


def test_every_section_has_an_extent_that_starts_at_its_heading(paper_path):
    pages, regions = read_regions(paper_path)
    for section in build_sections(pages, regions):
        assert section.extent, f"{section.title} has no extent"
        first = section.extent[0]
        assert first.page == section.heading_rect.page
        assert first.rect[1] <= section.heading_rect.rect[1] + 1


def test_running_heads_are_not_mistaken_for_sections(paper_path):
    pages, regions = read_regions(paper_path)
    titles = [s.title.lower() for s in build_sections(pages, regions)]
    assert not any(t.isdigit() for t in titles)


def test_no_heading_starts_lowercase_or_ends_with_a_period(paper_path):
    """ResNet page 0 has a section-header box reading 'greatly benefited from very
    deep models.' -- a body sentence the layout model promoted."""
    pages, regions = read_regions(paper_path)
    for section in build_sections(pages, regions):
        assert not section.title[0].islower(), section.title
        assert not section.title.endswith("."), section.title


def test_unnumbered_abstract_is_depth_one(paper_path):
    """header_level counts the paper title as 1, so Abstract arrives as 2."""
    pages, regions = read_regions(paper_path)
    sections = build_sections(pages, regions)
    abstract = next(s for s in sections if s.title.lower().startswith("abstract"))
    assert abstract.depth == 1
```

- [ ] **Step 2: Run it and watch it fail**

Run: `.venv/bin/pytest tests/test_sections.py -v`
Expected: FAIL, `ImportError: cannot import name 'build_sections'`.

- [ ] **Step 3: Add to `src/paperboard/extract/pymupdf_layout.py`**

```python
import re

from paperboard.source_model import PageRect, Section

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
```

- [ ] **Step 4: Run the section tests**

Run: `.venv/bin/pytest tests/test_sections.py -v`
Expected: all pass. If `test_resnet_nesting_matches_its_numbering` fails, print every
heading with its text and `header_level` before changing the code — the layout model may
have merged two headings, which is a different bug from a bad parse.

- [ ] **Step 5: Commit**

```bash
git add src/paperboard/extract/pymupdf_layout.py tests/test_sections.py
git commit -m "feat: build sections with depth and per-page extents"
```

---

### Task 5: Figures and tables, with the caption fallback chain

**Files:**
- Modify: `src/paperboard/extract/pymupdf_layout.py`
- Test: `tests/test_figures.py`

**Interfaces:**
- Consumes: `Region`, `PageInfo`.
- Produces: `paperboard.extract.pymupdf_layout.build_figures(pdf_path, pages, regions) -> list[Figure]`.

This is the task the addendum names as the real cost of not using Docling. The chain is:
adjacent layout region, else an embedded image above the caption, else clustered vector
drawings. `Figure.confidence` records which branch won, so a reader can see that a
boundary was guessed. (Addendum section 3.)

Captions are found by their text, not their label. Measured on ResNet: the layout model
labelled 13 boxes `caption` and 7 more real captions `text`, including Figure 1. Every
real caption has `.` or `:` after its number; body references like "Table 3 shows" do not.
The pattern below requires that separator and is applied to `caption` and `text` boxes.

- [ ] **Step 1: Write the failing test**

`tests/test_figures.py`:

```python
from paperboard.extract.pymupdf_layout import build_figures, read_regions


def test_captions_are_parsed_into_label_and_kind(paper_path):
    pages, regions = read_regions(paper_path)
    figures = build_figures(paper_path, pages, regions)
    assert figures
    for figure in figures:
        assert figure.kind in {"figure", "table"}
        assert figure.confidence in {"region", "image", "drawings"}
        if figure.label:
            assert figure.label.split()[0] in {"Figure", "Table"}


def test_figure_ids_are_unique(paper_path):
    pages, regions = read_regions(paper_path)
    ids = [f.id for f in build_figures(paper_path, pages, regions)]
    assert len(ids) == len(set(ids))


def test_a_figure_rect_never_swallows_its_own_caption(paper_path):
    pages, regions = read_regions(paper_path)
    for figure in build_figures(paper_path, pages, regions):
        if figure.caption_rect is None or figure.caption_rect.page != figure.rect.page:
            continue
        assert figure.rect.rect[1] < figure.caption_rect.rect[3]


def test_resnet_finds_figure_one_and_most_tables(paper_path, paper_name):
    """Figure 1's caption is labelled `text` by the layout model. Caption-only
    scanning misses it and six others."""
    if paper_name != "resnet":
        return
    pages, regions = read_regions(paper_path)
    figures = build_figures(paper_path, pages, regions)
    assert any(f.label == "Figure 1" for f in figures)
    assert len([f for f in figures if f.kind == "figure"]) >= 4
    assert len([f for f in figures if f.kind == "table"]) >= 8


def test_attention_figure_one_is_recovered_by_the_fallback(paper_path, paper_name):
    """The layout model emits Figure 1's caption but no picture region on page 2.

    This is the documented miss that the fallback chain exists for, so it is the
    single most valuable assertion in this file. See SPEC-ADDENDUM.md section 3.
    """
    if paper_name != "attention":
        return
    pages, regions = read_regions(paper_path)
    figures = build_figures(paper_path, pages, regions)
    first = next(f for f in figures if f.label == "Figure 1")
    assert first.confidence in {"region", "image"}
    x0, y0, x1, y1 = first.rect.rect
    assert (x1 - x0) > 100 and (y1 - y0) > 100
```

- [ ] **Step 2: Run it and watch it fail**

Run: `.venv/bin/pytest tests/test_figures.py -v`
Expected: FAIL, `ImportError: cannot import name 'build_figures'`.

- [ ] **Step 3: Add to `src/paperboard/extract/pymupdf_layout.py`**

```python
from paperboard.geometry import area, pad
from paperboard.source_model import Figure

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
```

- [ ] **Step 4: Run the figure tests**

Run: `.venv/bin/pytest tests/test_figures.py -v`
Expected: all pass. `test_attention_figure_one_is_recovered_by_the_fallback` is the one to
watch — if it fails with `confidence == "drawings"`, the fallback still worked but took the
last branch, which is worth a look before relaxing the assertion.

- [ ] **Step 5: Commit**

```bash
git add src/paperboard/extract/pymupdf_layout.py tests/test_figures.py
git commit -m "feat: pair captions with figures through a three-branch fallback"
```

---

### Task 6: Page text

**Files:**
- Modify: `src/paperboard/extract/pymupdf_layout.py`
- Test: `tests/test_page_text.py`

**Interfaces:**
- Consumes: `Region`, `PageInfo`.
- Produces: `read_page_text(pdf_path) -> list[PageText]`.

There is no formula extraction. SPEC-ADDENDUM.md section 11 removed the `formulas` list
from `source.json` because no command consumes it: a cut equation is a chunk like any
other, anchored by its rectangle. The `formula` layout label is still used — Task 5 relies
on layout regions generally — but nothing is stored for it.

`page_text` exists so the anchoring module in the API plan can re-anchor without reopening
the PDF, and so anchoring is testable from a JSON fixture. (Addendum sections 3 and 5.)
Use `page.get_text()`, not `PageLayout.fulltext`: measured, `fulltext` came back as 47
characters for a full page.

- [ ] **Step 1: Write the failing test**

`tests/test_page_text.py`:

```python
from paperboard.extract.pymupdf_layout import read_page_text, read_regions


def test_page_text_covers_every_page_in_order(paper_path):
    pages, _ = read_regions(paper_path)
    text = read_page_text(paper_path)
    assert [t.page for t in text] == list(range(len(pages)))


def test_page_text_is_not_empty_for_a_body_page(paper_path):
    assert len(read_page_text(paper_path)[1].text) > 200
```

- [ ] **Step 2: Run it and watch it fail**

Run: `.venv/bin/pytest tests/test_page_text.py -v`
Expected: FAIL, `ImportError: cannot import name 'read_page_text'`.

- [ ] **Step 3: Add to `src/paperboard/extract/pymupdf_layout.py`**

```python
from paperboard.source_model import PageText


def read_page_text(pdf_path: Path) -> list[PageText]:
    """Full text per page, whitespace preserved.

    Preserved because the anchoring matcher strips whitespace itself and needs the
    original to map offsets back. See SPEC-ADDENDUM.md section 5.2.
    """
    with pymupdf.open(pdf_path) as doc:
        return [PageText(page=i, text=doc[i].get_text()) for i in range(doc.page_count)]
```

- [ ] **Step 4: Run the page-text tests**

Run: `.venv/bin/pytest tests/test_page_text.py -v`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/paperboard/extract/pymupdf_layout.py tests/test_page_text.py
git commit -m "feat: extract per-page text for anchoring"
```

---

### Task 7: Assemble the document, and the paper id

**Files:**
- Modify: `src/paperboard/extract/pymupdf_layout.py`
- Test: `tests/test_extract.py`

**Interfaces:**
- Consumes: everything above.
- Produces: `extract_document(pdf_path) -> SourceDocument` and
  `paper_id_for(pdf_path, title, first_page_text) -> str`. `extract()` from Task 3 now works.

- [ ] **Step 1: Write the failing test**

`tests/test_extract.py`:

```python
import pymupdf

from paperboard.extract import extract
from paperboard.extract.pymupdf_layout import paper_id_for


def test_paper_id_is_slug_plus_arxiv_id_when_present(paper_path, paper_name):
    doc = extract(paper_path)
    if paper_name == "attention":
        assert doc.paper_id.endswith("1706.03762")
        assert "attention" in doc.paper_id


def test_paper_id_is_stable_across_runs(paper_path):
    assert extract(paper_path).paper_id == extract(paper_path).paper_id


def test_paper_id_is_filesystem_safe(paper_path):
    assert extract(paper_path).paper_id.replace("-", "").replace(".", "").isalnum()


def test_extracted_document_is_populated(paper_path):
    doc = extract(paper_path)
    assert doc.schema_version == 1
    assert doc.extractor.startswith("pymupdf-layout/")
    assert doc.pages and doc.sections and doc.regions and doc.page_text


def test_extraction_never_modifies_the_pdf(paper_path):
    before = paper_path.read_bytes()
    extract(paper_path)
    assert paper_path.read_bytes() == before


def test_every_rect_in_the_document_lies_on_a_real_page(paper_path):
    doc = extract(paper_path)
    sizes = {p.index: (p.width, p.height) for p in doc.pages}
    rects = (
        [s.heading_rect for s in doc.sections]
        + [r for s in doc.sections for r in s.extent]
        + [f.rect for f in doc.figures]
    )
    for page_rect in rects:
        assert page_rect.page in sizes
```

- [ ] **Step 2: Run it and watch it fail**

Run: `.venv/bin/pytest tests/test_extract.py -v`
Expected: FAIL, `ImportError: cannot import name 'extract_document'`.

- [ ] **Step 3: Add to `src/paperboard/extract/pymupdf_layout.py`**

```python
import hashlib

_ARXIV = re.compile(r"arXiv:\s*(\d{4}\.\d{4,5})", re.IGNORECASE)
_SLUG_TRIM = re.compile(r"[^a-z0-9]+")
SLUG_WORDS = 6


def paper_id_for(pdf_path: Path, title: str, first_page_text: str) -> str:
    """A stable folder name: slugified title plus arXiv id, else a content hash.

    It never changes for a given file, because it is the folder the board lives in.
    """
    words = _SLUG_TRIM.sub("-", title.lower()).strip("-").split("-")
    slug = "-".join(w for w in words if w)[:60].strip("-")
    match = _ARXIV.search(first_page_text)
    suffix = match.group(1) if match else hashlib.sha256(
        pdf_path.read_bytes()
    ).hexdigest()[:10]
    return f"{slug}-{suffix}" if slug else suffix


def extract_document(pdf_path: Path) -> SourceDocument:
    """Read a PDF into a SourceDocument. The whole package's entry point."""
    pages, regions = read_regions(pdf_path)
    sections = build_sections(pages, regions)
    page_text = read_page_text(pdf_path)
    title = next(
        (r.text for r in regions if r.label == "title" and r.page == 0),
        sections[0].title if sections else pdf_path.stem,
    )
    return SourceDocument(
        paper_id=paper_id_for(pdf_path, title, page_text[0].text if page_text else ""),
        extractor=EXTRACTOR_NAME,
        pages=pages,
        sections=sections,
        figures=build_figures(pdf_path, pages, regions),
        regions=[LayoutRegion(page=r.page, rect=r.rect, label=r.label) for r in regions],
        page_text=page_text,
    )
```

Add the import at the top of the file: `from paperboard.source_model import LayoutRegion, SourceDocument`.

- [ ] **Step 4: Run the tests**

Run: `.venv/bin/pytest tests/test_extract.py -v`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/paperboard/extract/pymupdf_layout.py tests/test_extract.py
git commit -m "feat: assemble a SourceDocument with a stable paper id"
```

---

### Task 8: The CLI

**Files:**
- Create: `src/paperboard/cli.py`
- Test: `tests/test_cli.py`

**Interfaces:**
- Consumes: `extract()`.
- Produces: `paperboard extract <pdf> [--out DIR]`, writing `<out>/<paper-id>/source.json` and copying the PDF in as `paper.pdf`. This is the folder layout SPEC.md section 7 defines, so the API plan finds boards where it expects them.

- [ ] **Step 1: Write the failing test**

`tests/test_cli.py`:

```python
import json

from typer.testing import CliRunner

from paperboard.cli import app
from conftest import FIXTURES

runner = CliRunner()


def test_extract_writes_a_board_folder(tmp_path):
    result = runner.invoke(
        app, ["extract", str(FIXTURES["resnet"]), "--out", str(tmp_path)]
    )
    assert result.exit_code == 0, result.output
    folder = next(tmp_path.iterdir())
    assert (folder / "paper.pdf").exists()
    payload = json.loads((folder / "source.json").read_text())
    assert payload["schema"] == 1
    assert payload["sections"]


def test_extract_is_idempotent(tmp_path):
    for _ in range(2):
        result = runner.invoke(
            app, ["extract", str(FIXTURES["resnet"]), "--out", str(tmp_path)]
        )
        assert result.exit_code == 0
    assert len(list(tmp_path.iterdir())) == 1


def test_missing_file_exits_nonzero_with_a_readable_message(tmp_path):
    result = runner.invoke(app, ["extract", str(tmp_path / "nope.pdf")])
    assert result.exit_code != 0
    assert "not found" in result.output.lower()
```

- [ ] **Step 2: Run it and watch it fail**

Run: `.venv/bin/pytest tests/test_cli.py -v`
Expected: FAIL, `ModuleNotFoundError: No module named 'paperboard.cli'`.

- [ ] **Step 3: Write `src/paperboard/cli.py`**

```python
"""`paperboard extract` — the only command in this plan."""

import shutil
from pathlib import Path

import typer

from paperboard.extract import extract

app = typer.Typer(help="Take a paper apart so its ideas can be laid out.")


@app.command("extract")
def extract_command(
    pdf: Path = typer.Argument(..., help="The PDF to read."),
    out: Path = typer.Option(Path("papers"), "--out", help="Where board folders live."),
) -> None:
    """Write <out>/<paper-id>/{paper.pdf,source.json}."""
    if not pdf.is_file():
        typer.echo(f"error: {pdf} not found", err=True)
        raise typer.Exit(code=1)

    try:
        document = extract(pdf)
    except Exception as error:  # surface the extractor's own message, do not swallow it
        typer.echo(f"error: could not extract {pdf.name}: {error}", err=True)
        raise typer.Exit(code=2) from error

    folder = out / document.paper_id
    folder.mkdir(parents=True, exist_ok=True)
    if not (folder / "paper.pdf").exists():
        shutil.copy2(pdf, folder / "paper.pdf")
    (folder / "source.json").write_text(
        document.model_dump_json(indent=2, by_alias=True), encoding="utf-8"
    )
    typer.echo(
        f"{document.paper_id}: {len(document.sections)} sections, "
        f"{len(document.figures)} figures"
    )
```

- [ ] **Step 4: Run the CLI tests**

Run: `.venv/bin/pytest tests/test_cli.py -v`
Expected: 3 passed.

- [ ] **Step 5: Run it by hand on the hard paper**

```bash
.venv/bin/paperboard extract tests/fixtures/papers/adam.pdf --out /tmp/pb
```
Expected: a line naming a double-digit section count. Open `/tmp/pb/*/source.json` and read
the section titles. This is SPEC.md build step 1's own test — *are the section boundaries
right?* — and no assertion substitutes for looking.

- [ ] **Step 6: Commit**

```bash
git add src/paperboard/cli.py tests/test_cli.py
git commit -m "feat: add the paperboard extract command"
```

---

### Task 9: Golden files and the visual check

**Files:**
- Create: `tests/test_golden.py`
- Create: `scripts/regenerate_goldens.py`
- Create: `scripts/render_clips.py`
- Create: `tests/fixtures/golden/{attention,resnet,adam}.json`

**Interfaces:**
- Consumes: `extract()`.
- Produces: golden files that later changes are diffed against. The sibling plans do not depend on this task, but every future change to extraction does.

Goldens hold structure, not text, so a whitespace change in PyMuPDF does not fail the
suite while a lost section does.

- [ ] **Step 1: Write the regeneration script**

`scripts/regenerate_goldens.py`:

```python
"""Rewrite tests/fixtures/golden/*.json. Run after a deliberate extraction change.

Read the diff before committing: a section count that drops is a regression, and
this script cannot tell the difference.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "tests"))

from conftest import FIXTURES, GOLDEN_DIR  # noqa: E402

from paperboard.extract import extract  # noqa: E402


def summarise(document) -> dict:
    return {
        "page_count": len(document.pages),
        "region_count": len(document.regions),
        "sections": [
            {
                "id": s.id,
                "number": s.number,
                "depth": s.depth,
                "title": s.title,
                "page": s.heading_rect.page,
                "extent_pages": [e.page for e in s.extent],
            }
            for s in document.sections
        ],
        "figures": [
            {"id": f.id, "kind": f.kind, "label": f.label,
             "page": f.rect.page, "confidence": f.confidence}
            for f in document.figures
        ],
    }


if __name__ == "__main__":
    GOLDEN_DIR.mkdir(parents=True, exist_ok=True)
    for name, path in sorted(FIXTURES.items()):
        target = GOLDEN_DIR / f"{name}.json"
        target.write_text(json.dumps(summarise(extract(path)), indent=2) + "\n")
        print(f"wrote {target}")
```

- [ ] **Step 2: Write the failing golden test**

`tests/test_golden.py`:

```python
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "scripts"))

from regenerate_goldens import summarise  # noqa: E402

from conftest import GOLDEN_DIR  # noqa: E402

from paperboard.extract import extract


def test_extraction_matches_its_golden(paper_path, paper_name):
    """Regenerate with: python scripts/regenerate_goldens.py"""
    golden = json.loads((GOLDEN_DIR / f"{paper_name}.json").read_text())
    assert summarise(extract(paper_path)) == golden
```

- [ ] **Step 3: Run it and watch it fail**

Run: `.venv/bin/pytest tests/test_golden.py -v`
Expected: FAIL, `FileNotFoundError` — the goldens do not exist yet.

- [ ] **Step 4: Generate the goldens, then read them**

```bash
.venv/bin/python scripts/regenerate_goldens.py
cat tests/fixtures/golden/adam.json
```

**Do not skip the reading.** Check that Adam's section titles are the real ones, that
`depth` follows the numbering, and that no running head became a section. If they are
wrong, the bug is in Task 4 and the golden would freeze it in place.

- [ ] **Step 5: Run the golden test**

Run: `.venv/bin/pytest tests/test_golden.py -v`
Expected: 3 passed.

- [ ] **Step 6: Write the clip renderer**

`scripts/render_clips.py`:

```python
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
```

- [ ] **Step 7: Render and look**

```bash
.venv/bin/python scripts/render_clips.py tests/fixtures/papers/resnet.pdf /tmp/clips
open /tmp/clips
```
Expected: each PNG is the figure its filename claims, not a slab of body text. Filenames
carry the confidence branch, so a wrong crop points straight at which branch produced it.

- [ ] **Step 8: Commit**

```bash
git add scripts tests/test_golden.py tests/fixtures/golden
git commit -m "test: pin extraction behaviour with golden files"
```

---

## Done when

- `.venv/bin/pytest` is green, with no network access during the run.
- `paperboard extract` produces a folder matching SPEC.md section 7 for all three papers.
- You have *looked at* the rendered clips and the section titles for Adam, the hard paper.
- SPEC.md build step 1's two questions are answered in writing, in the commit message or
  a note: are the section boundaries right, and are the figures found and paired?

## Not in this plan

The HTTP API, anchoring, the board, clips written into a board folder, and export. The
next plan consumes `SourceDocument` and `source.json` exactly as defined here.
