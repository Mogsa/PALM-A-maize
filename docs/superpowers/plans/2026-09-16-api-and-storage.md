# API and Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A local FastAPI server over plain files that the two-view frontend can be built against: it stores boards, notes, tags and clips in the folder layout SPEC.md section 7 defines, turns a selection in the paper into an anchor, re-anchors every highlight and chunk after re-extraction, and exports a board as Markdown.

**Architecture:** Six new modules in the existing `paperboard` package, each with one job and a test file: `board_model` (the board and tag contract), `store` (folders, atomic versioned writes), `anchoring` (quote matching, the one part specific to this tool), `snap` (selection to anchor), `clips` (rect to PNG), `export` (board to Markdown), and `api` (routes only, no logic). The extractor is untouched except that its column-run rule moves into `geometry` so anchoring can reuse it.

**Tech Stack:** Python 3.12, the merged extraction package, `fastapi` 0.141, `uvicorn` 0.53, `httpx` 0.28 for `TestClient`, `rapidfuzz` 3.14, `python-multipart` for upload, `pymupdf` 1.28.2 (already pinned), pydantic 2.13, pytest.

**Spec:** `docs/SPEC.md` sections 4 to 7, and `docs/SPEC-ADDENDUM.md` sections 2, 4, 5, 6, 7, 8. Where this plan and the addendum disagree, the plan is newer and lists the differences in the last section, which are applied to the addendum when this plan is accepted.

## Global Constraints

- **All geometry is PyMuPDF page space: PDF points, origin top-left, y downward, pages 0-indexed.** No flips anywhere. (Addendum section 2.) A rectangle is `[x0, y0, x1, y1]`, floats, `x0 < x1`, `y0 < y1`.
- The server binds to `127.0.0.1` only. It never reaches the network itself.
- No test reaches the network. The three fixture papers come from `scripts/fetch_fixtures.py`, already in the repo, and every test that needs a paper uses the `extracted` session fixture defined in Task 1.
- Nothing generates text. The server stores, matches, renders, and reorders the reader's own words and the paper's. (SPEC.md principle 1.)
- `source.json` is generated and never hand-edited. Extraction rewrites it wholesale and touches nothing else. (SPEC.md section 7.)
- Board writes are atomic and versioned. A stale write is refused with `409`, never merged, never silently dropped. (Addendum section 7.)
- Every id is minted by the client: `n-` node, `e-` edge, `h-` highlight, `t-` tag. The server validates prefixes and uniqueness and mints nothing.
- Licence stays AGPL-3.0. Every dependency above is MIT, BSD, or Apache. Do not add another.

---

## File Structure

```
src/paperboard/geometry.py            # + union, midpoint, column_runs (moved from extractor)
src/paperboard/extract/pymupdf_layout.py   # _extent now calls geometry.column_runs
src/paperboard/board_model.py         # board.json and tags.json contract, presets
src/paperboard/store.py               # root folder, atomic writes, versions, notes, tags, clips
src/paperboard/anchoring.py           # page index, quote finding, resolve highlight / chunk
src/paperboard/snap.py                # text under rects, forgiving-highlight rule, selectors
src/paperboard/clips.py               # render a page rect to PNG
src/paperboard/export.py              # board to Markdown in paper order
src/paperboard/api.py                 # FastAPI app: routes, error shape, nothing else
src/paperboard/cli.py                 # + `paperboard serve`
tests/conftest.py                     # + `extracted` session fixture, `store_root` fixture
tests/test_column_runs.py
tests/test_board_model.py
tests/test_store.py
tests/test_anchoring.py
tests/test_snap.py
tests/test_clips.py
tests/test_export.py
tests/test_api.py
```

Each module is importable without FastAPI. `api.py` is the only file that imports it, and it contains no logic that a test would want to reach without HTTP.

---

### Task 1: Column runs move to geometry; test fixtures for the rest of the plan

**Files:**
- Modify: `src/paperboard/geometry.py`
- Modify: `src/paperboard/extract/pymupdf_layout.py` (the `_extent` function and the `COLUMN_CENTRE_TOLERANCE` constant)
- Modify: `tests/conftest.py`
- Modify: `pyproject.toml`
- Test: `tests/test_column_runs.py`

**Interfaces:**
- Consumes: `paperboard.geometry.Rect`, `paperboard.source_model.PageRect`, `paperboard.extract.extract`.
- Produces:
  - `paperboard.geometry.union(a: Rect, b: Rect) -> Rect`
  - `paperboard.geometry.midpoint(rect: Rect) -> tuple[float, float]`
  - `paperboard.geometry.column_runs(items: list[tuple[int, Rect]], page_widths: dict[int, float]) -> list[tuple[int, Rect]]`
  - `paperboard.geometry.COLUMN_CENTRE_TOLERANCE = 0.15`
  - `tests/conftest.py::extracted` — session fixture, `dict[str, SourceDocument]` keyed `"attention" | "resnet" | "adam"`.
  - `tests/conftest.py::store_root` — function fixture, a temp directory laid out as a store root with all three papers already extracted into it (copies from the session cache, so it costs milliseconds).

The chunk re-anchoring in Task 4 rebuilds a chunk's rectangles from layout regions and needs the same column-run rule extraction uses, so the rule becomes a shared function with the same behaviour and the same tests.

- [ ] **Step 1: Add the dependencies**

In `pyproject.toml`, `dependencies` becomes:

```toml
dependencies = [
    "pymupdf==1.28.2",
    "pymupdf4llm==1.28.2",
    "pymupdf-layout==1.28.2",
    "pydantic>=2.9",
    "typer>=0.12",
    "fastapi>=0.115",
    "uvicorn[standard]>=0.30",
    "python-multipart>=0.0.9",
    "rapidfuzz>=3.9",
]
```

and `dev` gains `"httpx>=0.27"`. Run `.venv/bin/pip install -e ".[dev]"`.

- [ ] **Step 2: Write the failing column-runs test**

`tests/test_column_runs.py`:

```python
from paperboard.geometry import column_runs, midpoint, union

WIDTHS = {0: 612.0, 1: 612.0}
LEFT = (50.0, 0.0, 286.0, 0.0)     # x-span of the left column
RIGHT = (309.0, 0.0, 545.0, 0.0)   # x-span of the right column
FULL = (50.0, 0.0, 545.0, 0.0)     # a full-width figure


def _at(col, page, y0, y1):
    return (page, (col[0], y0, col[2], y1))


def test_union_and_midpoint():
    assert union((0.0, 0.0, 1.0, 1.0), (2.0, 3.0, 4.0, 5.0)) == (0.0, 0.0, 4.0, 5.0)
    assert midpoint((0.0, 0.0, 10.0, 4.0)) == (5.0, 2.0)


def test_same_column_stack_is_one_run():
    runs = column_runs([_at(LEFT, 0, 100, 200), _at(LEFT, 0, 210, 300)], WIDTHS)
    assert runs == [(0, (50.0, 100.0, 286.0, 300.0))]


def test_column_change_starts_a_new_run_even_without_an_upward_jump():
    # short left column ending at y=150, right column starting lower at y=160
    runs = column_runs([_at(LEFT, 0, 100, 150), _at(RIGHT, 0, 160, 400)], WIDTHS)
    assert len(runs) == 2


def test_full_width_figure_does_not_merge_with_the_column_beneath_it():
    runs = column_runs([_at(FULL, 0, 72, 173), _at(LEFT, 0, 393, 713)], WIDTHS)
    assert runs == [(0, (50.0, 72.0, 545.0, 173.0)), (0, (50.0, 393.0, 286.0, 713.0))]


def test_page_change_starts_a_new_run():
    runs = column_runs([_at(LEFT, 0, 600, 700), _at(LEFT, 1, 72, 200)], WIDTHS)
    assert [page for page, _ in runs] == [0, 1]


def test_upward_jump_on_the_same_page_starts_a_new_run():
    runs = column_runs([_at(LEFT, 0, 400, 700), _at(RIGHT, 0, 72, 300)], WIDTHS)
    assert len(runs) == 2
```

- [ ] **Step 3: Run it and watch it fail**

Run: `.venv/bin/pytest tests/test_column_runs.py -v`
Expected: FAIL, `ImportError: cannot import name 'column_runs'`.

- [ ] **Step 4: Add to `src/paperboard/geometry.py`**

```python
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
```

- [ ] **Step 5: Make the extractor call it**

In `src/paperboard/extract/pymupdf_layout.py`, delete the `COLUMN_CENTRE_TOLERANCE` constant and the body of `_extent`, and replace `_extent` with:

```python
def _extent(span: list[Region], page_widths: dict[int, float]) -> list[PageRect]:
    """One rectangle per column run; the rule lives in geometry.column_runs."""
    runs = column_runs([(r.page, r.rect) for r in span], page_widths)
    return [PageRect(page=page, rect=rect) for page, rect in runs]
```

and add `column_runs` to the `from paperboard.geometry import ...` line. `tests/test_sections.py` may import `COLUMN_CENTRE_TOLERANCE` from the extractor; if it does, change that import to `paperboard.geometry`.

- [ ] **Step 6: Run the new tests, the section tests, and the goldens**

Run: `.venv/bin/pytest tests/test_column_runs.py tests/test_sections.py tests/test_golden.py -v`
Expected: all pass, goldens unchanged. The move must not change one rectangle.

- [ ] **Step 7: Add the shared fixtures to `tests/conftest.py`**

Append:

```python
import shutil

from paperboard.extract import extract


@pytest.fixture(scope="session")
def extracted() -> dict:
    """Every fixture paper extracted once per session; about four seconds each."""
    docs = {}
    for name, path in FIXTURES.items():
        if not path.exists():
            pytest.fail(MISSING_FIXTURE.format(path=path), pytrace=False)
        docs[name] = extract(path)
    return docs


@pytest.fixture
def store_root(tmp_path, extracted) -> Path:
    """A store root with all three papers already in it, laid out per SPEC.md 7."""
    for name, doc in extracted.items():
        folder = tmp_path / "papers" / doc.paper_id
        folder.mkdir(parents=True)
        shutil.copy2(FIXTURES[name], folder / "paper.pdf")
        (folder / "source.json").write_text(doc.model_dump_json(by_alias=True, indent=2))
    return tmp_path
```

- [ ] **Step 8: Commit**

```bash
git add pyproject.toml src/paperboard/geometry.py src/paperboard/extract/pymupdf_layout.py tests/conftest.py tests/test_column_runs.py
git commit -m "refactor: move the column-run rule to geometry, add shared test fixtures"
```

---

### Task 2: The board and tags contract

**Files:**
- Create: `src/paperboard/board_model.py`
- Test: `tests/test_board_model.py`

**Interfaces:**
- Consumes: `geometry.Rect`, `source_model.PageRect`.
- Produces, and every later task and the frontend plan depend on these exact names:
  - `QuoteSelector(exact: str, prefix: str = "", suffix: str = "")`
  - `AnchorState = Literal["anchored", "relocated", "orphaned"]`
  - `HighlightAnchor(page: int, rect: Rect, quote: QuoteSelector, position: int = 0, state: AnchorState = "anchored")`
  - `ChunkAnchor(rects: list[PageRect], start: QuoteSelector, end: QuoteSelector, position: int = 0, state: AnchorState = "anchored")`
  - `Highlight(id, tags: list[str], note: str | None, anchor: HighlightAnchor)`
  - `Position(x, y)`, `Viewport(x, y, zoom)`
  - `ChunkData(tags, collapsed, region: ChunkAnchor, text: str, user_sized: bool, source_id: str | None)` — `source_id` is the `source.json` section id when the chunk came from split, else `None`, so split can skip sections already on the board
  - `FigureData(tags, collapsed, region: ChunkAnchor, clip: str | None, clip_size: ClipSize | None, caption: str, source_id: str | None)`
  - `NoteData(tags, collapsed, note: str)`
  - `GroupData(tags, name: str | None)`
  - `ChunkNode | FigureNode | NoteNode | GroupNode`, discriminated on `type`, alias `Node`
  - `Edge(id, source, target, sourceHandle: str | None, targetHandle: str | None, data: EdgeData(tags))`
  - `Board(schema, paper_id, version: int, goal: str, active_tags, viewport, nodes, edges, highlights)`
  - `Tag(id, name, colour)`, `TagFile(schema, tags)`, `PRESET_TAGS: list[Tag]`
  - `dump_board(board) -> str` and `dump_tags(tags) -> str`, the only serializers anyone uses.

This is React Flow's node and edge shape with runtime fields forbidden, per addendum section 4, plus the `highlights` array and the `version` integer.

- [ ] **Step 1: Write the failing test**

`tests/test_board_model.py`:

```python
import json

import pytest
from pydantic import ValidationError

from paperboard.board_model import (
    PRESET_TAGS,
    Board,
    ChunkAnchor,
    ChunkNode,
    Edge,
    GroupNode,
    Highlight,
    HighlightAnchor,
    NoteNode,
    QuoteSelector,
    TagFile,
    dump_board,
)

ANCHOR = HighlightAnchor(
    page=2, rect=(108.0, 280.0, 504.0, 322.0),
    quote=QuoteSelector(exact="Attention mechanisms", prefix="however, ", suffix=" have"),
)
REGION = ChunkAnchor(
    rects=[{"page": 2, "rect": (108.0, 280.0, 504.0, 720.0)}],
    start=QuoteSelector(exact="The Transformer"), end=QuoteSelector(exact="section 3.2."),
)


def _group(id="n-g"):
    return GroupNode(id=id, type="group", position={"x": 0, "y": 0}, width=600, height=400,
                     data={"tags": [], "name": "pile"})


def _chunk(id="n-c", parent=None):
    node = {"id": id, "type": "chunk", "position": {"x": 24, "y": 40}, "width": 320,
            "data": {"tags": ["t-claim"], "collapsed": False, "region": REGION.model_dump(),
                     "text": "The Transformer ...", "user_sized": True}}
    if parent:
        node["parentId"] = parent
        node["extent"] = "parent"
    return ChunkNode.model_validate(node)


def _note(id="n-n"):
    return NoteNode(id=id, type="note", position={"x": 900, "y": 40}, initialWidth=280,
                    data={"tags": [], "collapsed": False, "note": f"notes/{id}.md"})


def test_runtime_fields_are_rejected():
    with pytest.raises(ValidationError):
        ChunkNode.model_validate({**_chunk().model_dump(), "selected": True})
    with pytest.raises(ValidationError):
        ChunkNode.model_validate({**_chunk().model_dump(), "measured": {"width": 1, "height": 1}})


def test_ids_must_carry_their_prefix():
    with pytest.raises(ValidationError):
        _note(id="note-1")
    with pytest.raises(ValidationError):
        Highlight(id="n-x", tags=[], note=None, anchor=ANCHOR)
    with pytest.raises(ValidationError):
        Edge(id="x", source="n-a", target="n-b", data={"tags": []})


def test_board_rejects_a_child_before_its_parent():
    with pytest.raises(ValidationError, match="before its parent"):
        Board(paper_id="p", nodes=[_chunk(parent="n-g"), _group()])


def test_board_rejects_a_parent_that_is_not_a_group():
    with pytest.raises(ValidationError, match="not a group"):
        Board(paper_id="p", nodes=[_chunk("n-a"), _chunk("n-b", parent="n-a")])


def test_board_rejects_an_edge_to_a_missing_node():
    with pytest.raises(ValidationError, match="unknown node"):
        Board(paper_id="p", nodes=[_note()], edges=[Edge(id="e-1", source="n-n", target="n-zz", data={"tags": []})])


def test_board_rejects_a_handle_that_is_not_a_highlight():
    with pytest.raises(ValidationError, match="unknown highlight"):
        Board(paper_id="p", nodes=[_chunk(), _note()],
              edges=[Edge(id="e-1", source="n-c", sourceHandle="h-nope", target="n-n", data={"tags": []})])


def test_board_rejects_duplicate_ids():
    with pytest.raises(ValidationError, match="duplicate"):
        Board(paper_id="p", nodes=[_note(), _note()])


def test_a_valid_board_round_trips_byte_for_byte():
    board = Board(
        paper_id="p", goal="why", nodes=[_group(), _chunk(parent="n-g"), _note()],
        edges=[Edge(id="e-1", source="n-c", sourceHandle="h-1", target="n-n", data={"tags": ["t-supports"]})],
        highlights=[Highlight(id="h-1", tags=["t-question"], note="n-n", anchor=ANCHOR)],
    )
    text = dump_board(board)
    again = Board.model_validate_json(text)
    assert again == board
    assert dump_board(again) == text
    payload = json.loads(text)
    assert payload["schema"] == 1 and payload["version"] == 0
    assert "selected" not in json.dumps(payload)


def test_empty_board_has_sane_defaults():
    board = Board(paper_id="p")
    assert board.version == 0 and board.nodes == [] and board.highlights == []
    assert board.viewport.zoom == 1


def test_presets_are_the_ten_from_the_spec():
    assert [t.name for t in PRESET_TAGS] == [
        "problem", "claim", "method", "evidence", "assumption",
        "pass 1", "pass 2", "supports", "contradicts", "question",
    ]
    assert TagFile(tags=PRESET_TAGS).tags[0].colour.startswith("#")
```

- [ ] **Step 2: Run it and watch it fail**

Run: `.venv/bin/pytest tests/test_board_model.py -v`
Expected: FAIL, `ModuleNotFoundError: No module named 'paperboard.board_model'`.

- [ ] **Step 3: Write `src/paperboard/board_model.py`**

```python
"""The `board.json` and `tags.json` contract. See SPEC-ADDENDUM.md section 4.

React Flow's native node and edge shape with its runtime fields forbidden, plus
the `highlights` array (marks on the paper, never nodes) and a `version` integer
for optimistic concurrency. Everything that reads or writes a board goes through
these models and `dump_board`, so a board that did not change produces a
byte-identical file.
"""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from paperboard.geometry import Rect
from paperboard.source_model import PageRect

SCHEMA_VERSION = 1
CONTEXT_CHARS = 32  # prefix and suffix length in a QuoteSelector

AnchorState = Literal["anchored", "relocated", "orphaned"]


def _check_prefix(value: str, prefix: str) -> str:
    if not value.startswith(prefix) or len(value) <= len(prefix):
        raise ValueError(f"id must start with {prefix!r}, got {value!r}")
    return value


class QuoteSelector(BaseModel):
    exact: str
    prefix: str = ""
    suffix: str = ""


class HighlightAnchor(BaseModel):
    page: int = Field(ge=0)
    rect: Rect
    quote: QuoteSelector
    position: int = 0
    state: AnchorState = "anchored"


class ChunkAnchor(BaseModel):
    rects: list[PageRect] = Field(min_length=1)
    start: QuoteSelector
    end: QuoteSelector
    position: int = 0
    state: AnchorState = "anchored"


class Highlight(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    tags: list[str] = []
    note: str | None = None
    anchor: HighlightAnchor

    @field_validator("id")
    @classmethod
    def _id_prefix(cls, value: str) -> str:
        return _check_prefix(value, "h-")


class Position(BaseModel):
    x: float
    y: float


class Viewport(BaseModel):
    x: float = 0
    y: float = 0
    zoom: float = 1


class ClipSize(BaseModel):
    width: int
    height: int


class ChunkData(BaseModel):
    model_config = ConfigDict(extra="forbid")
    tags: list[str] = []
    collapsed: bool = False
    region: ChunkAnchor
    text: str = ""
    user_sized: bool = False
    source_id: str | None = None   # section id from source.json when made by split


class FigureData(BaseModel):
    model_config = ConfigDict(extra="forbid")
    tags: list[str] = []
    collapsed: bool = False
    region: ChunkAnchor
    clip: str | None = None
    clip_size: ClipSize | None = None
    caption: str = ""
    source_id: str | None = None   # figure id from source.json when made by split


class NoteData(BaseModel):
    model_config = ConfigDict(extra="forbid")
    tags: list[str] = []
    collapsed: bool = False
    note: str


class GroupData(BaseModel):
    model_config = ConfigDict(extra="forbid")
    tags: list[str] = []
    name: str | None = None


class _NodeBase(BaseModel):
    """React Flow's persisted node fields, exhaustively. Anything else is rejected:
    `selected`, `dragging`, `measured` and friends are runtime state the client
    must strip before writing (addendum 4.1)."""

    model_config = ConfigDict(extra="forbid")
    id: str
    position: Position
    parentId: str | None = None
    extent: Literal["parent"] | None = None
    width: float | None = None
    height: float | None = None
    initialWidth: float | None = None
    initialHeight: float | None = None
    hidden: bool | None = None
    zIndex: int | None = None

    @field_validator("id")
    @classmethod
    def _id_prefix(cls, value: str) -> str:
        return _check_prefix(value, "n-")


class ChunkNode(_NodeBase):
    type: Literal["chunk"]
    data: ChunkData


class FigureNode(_NodeBase):
    type: Literal["figure"]
    data: FigureData


class NoteNode(_NodeBase):
    type: Literal["note"]
    data: NoteData


class GroupNode(_NodeBase):
    type: Literal["group"]
    data: GroupData


Node = Annotated[ChunkNode | FigureNode | NoteNode | GroupNode, Field(discriminator="type")]


class EdgeData(BaseModel):
    model_config = ConfigDict(extra="forbid")
    tags: list[str] = []


class Edge(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    type: str | None = None
    source: str
    sourceHandle: str | None = None
    target: str
    targetHandle: str | None = None
    data: EdgeData = EdgeData()

    @field_validator("id")
    @classmethod
    def _id_prefix(cls, value: str) -> str:
        return _check_prefix(value, "e-")


class Board(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)
    schema_version: int = Field(default=SCHEMA_VERSION, alias="schema")
    paper_id: str
    version: int = Field(default=0, ge=0)
    goal: str = ""
    active_tags: list[str] = []
    viewport: Viewport = Viewport()
    nodes: list[Node] = []
    edges: list[Edge] = []
    highlights: list[Highlight] = []

    @model_validator(mode="after")
    def _consistent(self) -> "Board":
        seen: set[str] = set()
        for item in [*self.nodes, *self.edges, *self.highlights]:
            if item.id in seen:
                raise ValueError(f"duplicate id {item.id!r}")
            seen.add(item.id)
        nodes_by_id = {n.id: n for n in self.nodes}
        placed: set[str] = set()
        for node in self.nodes:
            if node.parentId is not None:
                if node.parentId not in nodes_by_id:
                    raise ValueError(f"{node.id} has unknown parent {node.parentId!r}")
                if nodes_by_id[node.parentId].type != "group":
                    raise ValueError(f"{node.id} parent {node.parentId} is not a group")
                if node.parentId not in placed:
                    raise ValueError(f"{node.id} appears before its parent {node.parentId}")
            placed.add(node.id)
        highlight_ids = {h.id for h in self.highlights}
        for edge in self.edges:
            for end in (edge.source, edge.target):
                if end not in nodes_by_id:
                    raise ValueError(f"edge {edge.id} references unknown node {end!r}")
            for handle in (edge.sourceHandle, edge.targetHandle):
                if handle is not None and handle not in highlight_ids:
                    raise ValueError(f"edge {edge.id} references unknown highlight {handle!r}")
        for highlight in self.highlights:
            if highlight.note is not None and highlight.note not in nodes_by_id:
                raise ValueError(f"highlight {highlight.id} references unknown note {highlight.note!r}")
        return self


class Tag(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    name: str
    colour: str = Field(pattern=r"^#[0-9A-Fa-f]{6}$")

    @field_validator("id")
    @classmethod
    def _id_prefix(cls, value: str) -> str:
        return _check_prefix(value, "t-")


class TagFile(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)
    schema_version: int = Field(default=SCHEMA_VERSION, alias="schema")
    tags: list[Tag] = []


PRESET_TAGS = [
    Tag(id="t-problem", name="problem", colour="#C2410C"),
    Tag(id="t-claim", name="claim", colour="#B91C1C"),
    Tag(id="t-method", name="method", colour="#1D4ED8"),
    Tag(id="t-evidence", name="evidence", colour="#15803D"),
    Tag(id="t-assumption", name="assumption", colour="#A16207"),
    Tag(id="t-pass1", name="pass 1", colour="#64748B"),
    Tag(id="t-pass2", name="pass 2", colour="#475569"),
    Tag(id="t-supports", name="supports", colour="#15803D"),
    Tag(id="t-contradicts", name="contradicts", colour="#B91C1C"),
    Tag(id="t-question", name="question", colour="#7C3AED"),
]


def dump_board(board: Board) -> str:
    """The one serializer. Aliases on, `None` fields dropped, stable indentation."""
    return board.model_dump_json(by_alias=True, exclude_none=True, indent=2) + "\n"


def dump_tags(tags: TagFile) -> str:
    return tags.model_dump_json(by_alias=True, indent=2) + "\n"
```

- [ ] **Step 4: Run the tests**

Run: `.venv/bin/pytest tests/test_board_model.py -v`
Expected: 10 passed. If `test_a_valid_board_round_trips_byte_for_byte` fails on `again == board`, the cause is float versus int in `position`; pydantic coerces both to float, so compare after a round trip rather than against literals.

- [ ] **Step 5: Commit**

```bash
git add src/paperboard/board_model.py tests/test_board_model.py
git commit -m "feat: add the board.json and tags.json contract"
```

---

### Task 3: The store

**Files:**
- Create: `src/paperboard/store.py`
- Test: `tests/test_store.py`

**Interfaces:**
- Consumes: `board_model.Board`, `dump_board`, `TagFile`, `PRESET_TAGS`, `dump_tags`, `source_model.SourceDocument`, `extract.extract`.
- Produces:
  - `PaperNotFound(Exception)`, `NoteNotFound(Exception)`, `VersionConflict(Exception)` with `.current: int`
  - `PaperSummary(paper_id: str, title: str, page_count: int)`
  - `atomic_write(path: Path, data: bytes) -> None`
  - `Store(root: Path)` with `papers_dir`, `tags_path`, `paper_dir(paper_id)`, `list_papers()`, `add_paper(pdf_bytes: bytes) -> SourceDocument`, `read_source(paper_id)`, `write_source(paper_id, doc)`, `read_board(paper_id) -> Board`, `write_board(paper_id, board, expected_version: int | None) -> int`, `read_note(paper_id, node_id) -> str`, `write_note(paper_id, node_id, markdown)`, `read_tags() -> TagFile`, `write_tags(tags)`, `clip_path(paper_id, node_id) -> Path`, `write_clip(paper_id, node_id, png: bytes) -> str`, `pdf_path(paper_id) -> Path`.

Layout under `root`, exactly SPEC.md section 7:

```
tags.json
papers/<paper-id>/paper.pdf
papers/<paper-id>/source.json
papers/<paper-id>/board.json
papers/<paper-id>/notes/<node-id>.md
papers/<paper-id>/clips/<node-id>.png
```

- [ ] **Step 1: Write the failing test**

`tests/test_store.py`:

```python
import os

import pytest

from paperboard.board_model import Board, NoteNode, PRESET_TAGS
from paperboard.store import PaperNotFound, Store, VersionConflict, atomic_write
from conftest import FIXTURES


def _note(id="n-n"):
    return NoteNode(id=id, type="note", position={"x": 0, "y": 0},
                    data={"tags": [], "collapsed": False, "note": f"notes/{id}.md"})


def test_atomic_write_leaves_the_old_file_intact_when_replace_fails(tmp_path, monkeypatch):
    target = tmp_path / "board.json"
    target.write_bytes(b"old")

    def boom(src, dst):
        raise OSError("simulated crash between tmp and replace")

    monkeypatch.setattr(os, "replace", boom)
    with pytest.raises(OSError):
        atomic_write(target, b"new")
    assert target.read_bytes() == b"old"
    assert not list(tmp_path.glob("*.tmp")), "a failed write must not leave a tmp file"


def test_list_papers_reads_title_and_page_count(store_root):
    store = Store(store_root)
    papers = {p.paper_id: p for p in store.list_papers()}
    resnet = next(p for p in papers.values() if "residual" in p.paper_id)
    assert "Deep Residual Learning" in resnet.title
    assert resnet.page_count == 12


def test_unknown_paper_raises(store_root):
    with pytest.raises(PaperNotFound):
        Store(store_root).read_source("nope")


def test_board_is_empty_until_written_and_versions_advance(store_root):
    store = Store(store_root)
    paper_id = store.list_papers()[0].paper_id
    board = store.read_board(paper_id)
    assert board.version == 0 and board.nodes == []

    board.nodes = [_note()]
    assert store.write_board(paper_id, board, expected_version=0) == 1
    assert store.read_board(paper_id).version == 1

    stale = board.model_copy(update={"goal": "stale tab"})
    with pytest.raises(VersionConflict) as conflict:
        store.write_board(paper_id, stale, expected_version=0)
    assert conflict.value.current == 1
    assert store.read_board(paper_id).goal == ""


def test_write_board_with_no_expected_version_is_refused(store_root):
    store = Store(store_root)
    paper_id = store.list_papers()[0].paper_id
    with pytest.raises(VersionConflict):
        store.write_board(paper_id, Board(paper_id=paper_id), expected_version=None)


def test_notes_round_trip_with_front_matter(store_root):
    store = Store(store_root)
    paper_id = store.list_papers()[0].paper_id
    store.write_note(paper_id, "n-01", "Multi-head attention is *h* attentions.\n")
    raw = (store.paper_dir(paper_id) / "notes" / "n-01.md").read_text()
    assert raw.startswith("---\nid: n-01\n---\n")
    assert store.read_note(paper_id, "n-01") == "Multi-head attention is *h* attentions.\n"


def test_tags_default_to_presets_and_persist(store_root):
    store = Store(store_root)
    assert [t.name for t in store.read_tags().tags] == [t.name for t in PRESET_TAGS]
    tags = store.read_tags()
    tags.tags[0].name = "gap"
    store.write_tags(tags)
    assert store.read_tags().tags[0].name == "gap"


def test_add_paper_extracts_and_lays_out_the_folder(tmp_path):
    store = Store(tmp_path)
    doc = store.add_paper(FIXTURES["resnet"].read_bytes())
    folder = tmp_path / "papers" / doc.paper_id
    assert (folder / "paper.pdf").exists() and (folder / "source.json").exists()
    assert store.read_source(doc.paper_id).paper_id == doc.paper_id
    # adding the same PDF again is idempotent: same id, one folder
    assert store.add_paper(FIXTURES["resnet"].read_bytes()).paper_id == doc.paper_id
    assert len(list((tmp_path / "papers").iterdir())) == 1


def test_clip_is_written_under_clips_and_referenced_relatively(store_root):
    store = Store(store_root)
    paper_id = store.list_papers()[0].paper_id
    rel = store.write_clip(paper_id, "n-fig", b"\x89PNG\r\n\x1a\nfake")
    assert rel == "clips/n-fig.png"
    assert (store.paper_dir(paper_id) / rel).read_bytes().startswith(b"\x89PNG")
```

- [ ] **Step 2: Run it and watch it fail**

Run: `.venv/bin/pytest tests/test_store.py -v`
Expected: FAIL, `ModuleNotFoundError: No module named 'paperboard.store'`.

- [ ] **Step 3: Write `src/paperboard/store.py`**

```python
"""Plain files under one root, laid out per SPEC.md section 7.

Atomic writes, a monotonic board version, and nothing clever. A board is a
folder you can copy; this module is what keeps that true.
"""

import os
import re
import tempfile
from dataclasses import dataclass
from pathlib import Path

from pydantic import BaseModel

from paperboard.board_model import PRESET_TAGS, Board, TagFile, dump_board, dump_tags
from paperboard.extract import extract
from paperboard.source_model import SourceDocument

_FRONT_MATTER = re.compile(r"\A---\nid: (?P<id>[^\n]+)\n---\n", re.DOTALL)


class PaperNotFound(Exception):
    pass


class NoteNotFound(Exception):
    pass


class VersionConflict(Exception):
    def __init__(self, current: int):
        super().__init__(f"board is at version {current}")
        self.current = current


class PaperSummary(BaseModel):
    paper_id: str
    title: str
    page_count: int


def atomic_write(path: Path, data: bytes) -> None:
    """tmp in the same directory, fsync, then os.replace. A crash mid-write leaves
    the old file intact; a failed replace leaves no tmp file behind."""
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(dir=path.parent, prefix=path.name, suffix=".tmp")
    tmp = Path(tmp_name)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp, path)
    except BaseException:
        tmp.unlink(missing_ok=True)
        raise


@dataclass
class Store:
    root: Path

    @property
    def papers_dir(self) -> Path:
        return self.root / "papers"

    @property
    def tags_path(self) -> Path:
        return self.root / "tags.json"

    # -- papers -------------------------------------------------------------

    def paper_dir(self, paper_id: str) -> Path:
        folder = self.papers_dir / paper_id
        if not (folder / "source.json").is_file():
            raise PaperNotFound(paper_id)
        return folder

    def pdf_path(self, paper_id: str) -> Path:
        return self.paper_dir(paper_id) / "paper.pdf"

    def list_papers(self) -> list[PaperSummary]:
        out = []
        if not self.papers_dir.is_dir():
            return out
        for folder in sorted(self.papers_dir.iterdir()):
            if not (folder / "source.json").is_file():
                continue
            doc = self.read_source(folder.name)
            title = doc.sections[0].title if doc.sections else folder.name
            out.append(PaperSummary(paper_id=doc.paper_id, title=title, page_count=len(doc.pages)))
        return out

    def add_paper(self, pdf_bytes: bytes) -> SourceDocument:
        """Extract a PDF and lay out its folder. Idempotent for the same bytes,
        because paper_id is a pure function of the file (extractor Task 7)."""
        with tempfile.TemporaryDirectory() as scratch:
            staged = Path(scratch) / "paper.pdf"
            staged.write_bytes(pdf_bytes)
            doc = extract(staged)
        folder = self.papers_dir / doc.paper_id
        folder.mkdir(parents=True, exist_ok=True)
        if not (folder / "paper.pdf").exists():
            atomic_write(folder / "paper.pdf", pdf_bytes)
        self.write_source(doc.paper_id, doc)
        return doc

    def read_source(self, paper_id: str) -> SourceDocument:
        return SourceDocument.model_validate_json((self.paper_dir(paper_id) / "source.json").read_text())

    def write_source(self, paper_id: str, doc: SourceDocument) -> None:
        folder = self.papers_dir / paper_id
        atomic_write(folder / "source.json", doc.model_dump_json(by_alias=True, indent=2).encode())

    # -- board --------------------------------------------------------------

    def read_board(self, paper_id: str) -> Board:
        path = self.paper_dir(paper_id) / "board.json"
        if not path.exists():
            return Board(paper_id=paper_id)
        return Board.model_validate_json(path.read_text())

    def write_board(self, paper_id: str, board: Board, expected_version: int | None) -> int:
        """Refuse unless the caller proves it saw the current version. Two open
        tabs must never silently overwrite each other (addendum section 7)."""
        current = self.read_board(paper_id).version
        if expected_version is None or expected_version != current:
            raise VersionConflict(current)
        board = board.model_copy(update={"version": current + 1, "paper_id": paper_id})
        atomic_write(self.paper_dir(paper_id) / "board.json", dump_board(board).encode())
        return board.version

    # -- notes --------------------------------------------------------------

    def read_note(self, paper_id: str, node_id: str) -> str:
        path = self.paper_dir(paper_id) / "notes" / f"{node_id}.md"
        if not path.exists():
            raise NoteNotFound(node_id)
        raw = path.read_text(encoding="utf-8")
        match = _FRONT_MATTER.match(raw)
        return raw[match.end():] if match else raw

    def write_note(self, paper_id: str, node_id: str, markdown: str) -> None:
        body = f"---\nid: {node_id}\n---\n{markdown}"
        atomic_write(self.paper_dir(paper_id) / "notes" / f"{node_id}.md", body.encode("utf-8"))

    # -- tags ---------------------------------------------------------------

    def read_tags(self) -> TagFile:
        if not self.tags_path.exists():
            return TagFile(tags=list(PRESET_TAGS))
        return TagFile.model_validate_json(self.tags_path.read_text())

    def write_tags(self, tags: TagFile) -> None:
        atomic_write(self.tags_path, dump_tags(tags).encode())

    # -- clips --------------------------------------------------------------

    def clip_path(self, paper_id: str, node_id: str) -> Path:
        return self.paper_dir(paper_id) / "clips" / f"{node_id}.png"

    def write_clip(self, paper_id: str, node_id: str, png: bytes) -> str:
        atomic_write(self.clip_path(paper_id, node_id), png)
        return f"clips/{node_id}.png"
```

- [ ] **Step 4: Run the tests**

Run: `.venv/bin/pytest tests/test_store.py -v`
Expected: 9 passed. `test_add_paper_extracts_and_lays_out_the_folder` takes about eight seconds because it extracts twice.

- [ ] **Step 5: Commit**

```bash
git add src/paperboard/store.py tests/test_store.py
git commit -m "feat: add the file store with atomic, versioned board writes"
```

---

### Task 4: Anchoring

**Files:**
- Create: `src/paperboard/anchoring.py`
- Test: `tests/test_anchoring.py`

**Interfaces:**
- Consumes: `board_model.QuoteSelector | HighlightAnchor | ChunkAnchor | AnchorState | CONTEXT_CHARS`, `geometry.column_runs | union | midpoint`, `source_model.SourceDocument | PageRect | LayoutRegion`, `rapidfuzz.fuzz`, `pymupdf`.
- Produces:
  - `PageIndex(page: int, text: str, stripped: str, offsets: list[int])` — `offsets[i]` is the index in `text` of `stripped[i]`.
  - `build_index(doc: SourceDocument) -> list[PageIndex]`
  - `strip_whitespace(text: str) -> tuple[str, list[int]]`
  - `Match(page: int, start: int, end: int, score: float)` — `start`/`end` are offsets into the page's original `text`.
  - `find_quote(index: list[PageIndex], quote: QuoteSelector, position: int, page_hint: int) -> Match | None`
  - `rects_for_text(page: pymupdf.Page, text: str) -> Rect | None`
  - `resolve_highlight(anchor: HighlightAnchor, index, pdf: pymupdf.Document) -> HighlightAnchor`
  - `resolve_chunk(anchor: ChunkAnchor, index, pdf, doc: SourceDocument) -> ChunkAnchor`
  - `global_position(index, page, offset) -> int` and the constants `MIN_SCORE = 0.5`, `MIN_QUOTE_SCORE = 0.6`, `SAME_PLACE_POINTS = 3.0`.

The design is Hypothesis's, per addendum section 5, with two measured facts folded in: `rapidfuzz.fuzz.partial_ratio_alignment` finds a perturbed quote in a whitespace-stripped page in about a millisecond and returns offsets into the stripped text; `page.search_for(text)` returns the rectangles of the text's lines, so a rectangle is recovered from the matched words, never from stored geometry alone.

- [ ] **Step 1: Write the failing test**

`tests/test_anchoring.py`:

```python
import pymupdf
import pytest

from paperboard.anchoring import (
    build_index,
    find_quote,
    global_position,
    rects_for_text,
    resolve_chunk,
    resolve_highlight,
    strip_whitespace,
)
from paperboard.board_model import ChunkAnchor, HighlightAnchor, QuoteSelector
from paperboard.geometry import overlap_ratio
from conftest import FIXTURES


def test_strip_whitespace_maps_offsets_back():
    stripped, offsets = strip_whitespace("a b\n c")
    assert stripped == "abc"
    assert offsets == [0, 2, 5]


@pytest.fixture(scope="module")
def resnet(extracted):
    doc = extracted["resnet"]
    pdf = pymupdf.open(FIXTURES["resnet"])
    yield doc, build_index(doc), pdf
    pdf.close()


def _selector(text: str, exact: str) -> tuple[QuoteSelector, int]:
    at = text.index(exact)
    return QuoteSelector(exact=exact, prefix=text[max(0, at - 32):at], suffix=text[at + len(exact):at + len(exact) + 32]), at


def _end_quote(doc, section) -> str:
    """The last 60 characters of a section, taken from the page's own text just
    before the next heading, so `text.index` finds them verbatim."""
    ordinal = int(section.id.split("-")[1])
    following = next(s for s in doc.sections if s.id == f"sec-{ordinal + 1}")
    page_text = doc.page_text[following.heading_rect.page].text
    stop = page_text.index(" ".join(following.title.split()[:2]))
    return page_text[stop - 60:stop].strip()


def test_exact_quote_is_found_on_its_page_with_full_score(resnet):
    doc, index, _ = resnet
    text = doc.page_text[2].text
    quote, at = _selector(text, "Let us consider H(x) as an underlying mapping")
    match = find_quote(index, quote, global_position(index, 2, at), page_hint=2)
    assert match is not None and match.page == 2
    assert text[match.start:match.end] == quote.exact
    assert match.score == pytest.approx(1.0, abs=0.02)


def test_quote_survives_whitespace_and_line_break_changes(resnet):
    doc, index, _ = resnet
    text = doc.page_text[2].text
    quote, at = _selector(text, "Let us consider H(x) as an underlying mapping")
    quote.exact = "Let  us\nconsider H(x)   as an underlying\nmapping"
    match = find_quote(index, quote, global_position(index, 2, at), page_hint=2)
    assert match is not None and match.page == 2
    assert match.score > 0.95


def test_quote_survives_an_inserted_word_with_a_lower_score(resnet):
    doc, index, _ = resnet
    text = doc.page_text[2].text
    quote, at = _selector(text, "Let us consider H(x) as an underlying mapping")
    quote.exact = "Let us consider carefully H(x) as an underlying mapping"
    match = find_quote(index, quote, global_position(index, 2, at), page_hint=2)
    assert match is not None and match.page == 2
    assert 0.5 <= match.score < 0.98


def test_quote_is_found_on_the_right_page_without_a_hint(resnet):
    doc, index, _ = resnet
    text = doc.page_text[2].text
    quote, at = _selector(text, "Let us consider H(x) as an underlying mapping")
    match = find_quote(index, quote, position=0, page_hint=0)
    assert match is not None and match.page == 2


def test_context_disambiguates_a_repeated_phrase(resnet):
    doc, index, _ = resnet
    # "shortcut connections" occurs on several pages; the prefix picks page 1's.
    text = doc.page_text[1].text
    quote, at = _selector(text, "shortcut connections")
    match = find_quote(index, quote, global_position(index, 1, at), page_hint=5)
    assert match is not None and match.page == 1


def test_deleted_sentence_is_not_found(resnet):
    doc, index, _ = resnet
    quote = QuoteSelector(exact="This sentence was never in the paper at all, honestly.")
    assert find_quote(index, quote, position=0, page_hint=2) is None


def test_rects_for_text_returns_the_lines_bounding_box(resnet):
    doc, _, pdf = resnet
    rect = rects_for_text(pdf[2], "Let us consider H(x) as an underlying mapping")
    assert rect is not None
    x0, y0, x1, y1 = rect
    assert 0 < x0 < x1 < 612 and 0 < y0 < y1 < 792


def test_resolve_highlight_states(resnet):
    doc, index, pdf = resnet
    text = doc.page_text[2].text
    quote, at = _selector(text, "Let us consider H(x) as an underlying mapping")
    true_rect = rects_for_text(pdf[2], quote.exact)

    anchored = resolve_highlight(HighlightAnchor(page=2, rect=true_rect, quote=quote, position=global_position(index, 2, at)), index, pdf)
    assert anchored.state == "anchored" and anchored.rect == true_rect

    moved = resolve_highlight(HighlightAnchor(page=2, rect=(50.0, 700.0, 286.0, 720.0), quote=quote, position=0), index, pdf)
    assert moved.state == "relocated"
    assert overlap_ratio(moved.rect, true_rect) > 0.9

    gone = resolve_highlight(HighlightAnchor(page=2, rect=true_rect, quote=QuoteSelector(exact="never in the paper, not once, not ever"), position=0), index, pdf)
    assert gone.state == "orphaned" and gone.rect == true_rect


def test_resolve_chunk_keeps_rects_when_both_ends_hold(resnet):
    doc, index, pdf = resnet
    section = next(s for s in doc.sections if s.number == "3.1")
    text = doc.page_text[section.heading_rect.page].text
    start, s_at = _selector(text, section.title)
    end, _ = _selector(doc.page_text[section.extent[-1].page].text, _end_quote(doc, section))
    anchor = ChunkAnchor(rects=section.extent, start=start, end=end, position=global_position(index, section.heading_rect.page, s_at))
    resolved = resolve_chunk(anchor, index, pdf, doc)
    assert resolved.state == "anchored"
    assert resolved.rects == section.extent


def test_resolve_chunk_rebuilds_rects_from_regions_when_moved(resnet):
    doc, index, pdf = resnet
    section = next(s for s in doc.sections if s.number == "3.1")
    page = section.heading_rect.page
    text = doc.page_text[page].text
    start, s_at = _selector(text, section.title)
    end, _ = _selector(doc.page_text[section.extent[-1].page].text, _end_quote(doc, section))
    stale = [{"page": page, "rect": (50.0, 700.0, 286.0, 720.0)}]
    resolved = resolve_chunk(ChunkAnchor(rects=stale, start=start, end=end, position=0), index, pdf, doc)
    assert resolved.state == "relocated"
    assert resolved.rects[0].page == page
    # the rebuilt region covers the heading and stays in one column
    hx0, hy0, hx1, hy1 = section.heading_rect.rect
    assert any(r.rect[0] <= hx0 and r.rect[3] >= hy1 for r in resolved.rects)
    assert all((r.rect[2] - r.rect[0]) < 300 for r in resolved.rects)
```

- [ ] **Step 2: Run it and watch it fail**

Run: `.venv/bin/pytest tests/test_anchoring.py -v`
Expected: FAIL, `ModuleNotFoundError: No module named 'paperboard.anchoring'`.

- [ ] **Step 3: Write `src/paperboard/anchoring.py`**

```python
"""Find a quoted passage again after the text under it has changed.

This is the one part of the tool that is specific to it. The design is
Hypothesis's text-quote anchoring (SPEC-ADDENDUM.md section 5): match on the
quote with whitespace stripped, use prefix and suffix to tell identical
sentences apart, use the stored offset only to break ties, and recover the
rectangle from the matched words on the page rather than trusting stored
geometry. Coordinates come out in PyMuPDF page space because PyMuPDF is the
only thing that produces them.
"""

from dataclasses import dataclass

import pymupdf
from rapidfuzz import fuzz

from paperboard.board_model import CONTEXT_CHARS, ChunkAnchor, HighlightAnchor, QuoteSelector
from paperboard.geometry import Rect, column_runs, midpoint, normalise, union
from paperboard.source_model import PageRect, SourceDocument

MIN_SCORE = 0.5            # below this, a quote is orphaned
MIN_QUOTE_SCORE = 0.6      # the quote itself must match at least this well to be a candidate
SAME_PLACE_POINTS = 3.0    # a recovered rect within this many points of the stored one is "anchored"
FUZZY_MIN_CHARS = 8        # shorter quotes are matched exactly or not at all
WEIGHTS = {"quote": 50.0, "prefix": 20.0, "suffix": 20.0, "position": 2.0}
TOTAL_WEIGHT = sum(WEIGHTS.values())


@dataclass(frozen=True)
class PageIndex:
    page: int
    text: str
    stripped: str
    offsets: list[int]


@dataclass(frozen=True)
class Match:
    page: int
    start: int
    end: int
    score: float


def strip_whitespace(text: str) -> tuple[str, list[int]]:
    """Whitespace out, and for every kept character the offset it came from.
    PDF extraction paths disagree about spacing more than about anything else,
    so all matching happens on the stripped text (addendum 5.2 step 2)."""
    kept: list[str] = []
    offsets: list[int] = []
    for i, char in enumerate(text):
        if not char.isspace():
            kept.append(char)
            offsets.append(i)
    return "".join(kept), offsets


def build_index(doc: SourceDocument) -> list[PageIndex]:
    out = []
    for page_text in doc.page_text:
        stripped, offsets = strip_whitespace(page_text.text)
        out.append(PageIndex(page_text.page, page_text.text, stripped, offsets))
    return out


def global_position(index: list[PageIndex], page: int, offset: int) -> int:
    """Offset into the concatenation of every page's original text."""
    return sum(len(p.text) for p in index[:page]) + offset


def _similarity(a: str, b: str) -> float:
    if not a and not b:
        return 1.0
    if not a or not b:
        return 0.0
    return fuzz.ratio(a, b) / 100.0


def _candidates_on_page(page: PageIndex, quote: str) -> list[tuple[int, int, float]]:
    """(stripped start, stripped end, quote score) for every plausible hit."""
    hits: list[tuple[int, int, float]] = []
    at = page.stripped.find(quote)
    while at != -1:
        hits.append((at, at + len(quote), 1.0))
        at = page.stripped.find(quote, at + 1)
    if hits or len(quote) < FUZZY_MIN_CHARS:
        return hits
    alignment = fuzz.partial_ratio_alignment(quote, page.stripped, score_cutoff=MIN_QUOTE_SCORE * 100)
    if alignment is None:
        return hits
    return [(alignment.dest_start, alignment.dest_end, alignment.score / 100.0)]


def find_quote(index: list[PageIndex], quote: QuoteSelector, position: int, page_hint: int) -> Match | None:
    """Best match across pages, nearest page to the hint searched first only so
    that ties resolve toward it; every page is scored, since scoring all twelve
    pages of a paper costs a few milliseconds."""
    needle, _ = strip_whitespace(quote.exact)
    if not needle:
        return None
    prefix, _ = strip_whitespace(quote.prefix)
    suffix, _ = strip_whitespace(quote.suffix)
    total_len = max(1, sum(len(p.text) for p in index))

    best: Match | None = None
    for page in sorted(index, key=lambda p: abs(p.page - page_hint)):
        for s, e, quote_score in _candidates_on_page(page, needle):
            before = page.stripped[max(0, s - len(prefix)):s] if prefix else ""
            after = page.stripped[e:e + len(suffix)] if suffix else ""
            start = page.offsets[s]
            end = page.offsets[e - 1] + 1
            distance = abs(global_position(index, page.page, start) - position)
            score = (
                WEIGHTS["quote"] * quote_score
                + WEIGHTS["prefix"] * _similarity(prefix, before)
                + WEIGHTS["suffix"] * _similarity(suffix, after)
                + WEIGHTS["position"] * (1.0 - min(1.0, distance / total_len))
            ) / TOTAL_WEIGHT
            if score >= MIN_SCORE and (best is None or score > best.score):
                best = Match(page.page, start, end, score)
    return best


def rects_for_text(page: pymupdf.Page, text: str) -> Rect | None:
    """Bounding box of the lines that carry `text`, via PyMuPDF's own search.
    A long passage may straddle a hyphenated line break that search_for cannot
    cross; then the first and last few words are searched separately and the
    box spans between them."""
    hits = page.search_for(text)
    if hits:
        rect = None
        for hit in hits:
            rect = union(rect, tuple(hit)) if rect else normalise(tuple(hit))
        return rect
    words = text.split()
    if len(words) < 4:
        return None
    head = page.search_for(" ".join(words[:3]))
    tail = page.search_for(" ".join(words[-3:]))
    if not head or not tail:
        return None
    return union(tuple(head[0]), tuple(tail[-1]))


def _same_place(a: Rect, b: Rect) -> bool:
    return all(abs(x - y) <= SAME_PLACE_POINTS for x, y in zip(normalise(a), normalise(b)))


def resolve_highlight(anchor: HighlightAnchor, index: list[PageIndex], pdf: pymupdf.Document) -> HighlightAnchor:
    match = find_quote(index, anchor.quote, anchor.position, anchor.page)
    if match is None:
        return anchor.model_copy(update={"state": "orphaned"})
    found_text = index[match.page].text[match.start:match.end]
    rect = rects_for_text(pdf[match.page], found_text)
    if rect is None:
        return anchor.model_copy(update={"state": "orphaned"})
    position = global_position(index, match.page, match.start)
    if match.page == anchor.page and _same_place(rect, anchor.rect):
        return anchor.model_copy(update={"state": "anchored", "position": position})
    return anchor.model_copy(update={"page": match.page, "rect": rect, "position": position, "state": "relocated"})


def _regions_between(doc: SourceDocument, start: tuple[int, Rect], end: tuple[int, Rect]) -> list[tuple[int, Rect]]:
    """Layout regions in reading order from the one holding `start` to the one
    holding `end`, inclusive. Regions are stored in extraction order, which is
    reading order, so this is a slice."""
    regions = [(r.page, r.rect) for r in doc.regions]

    def holding(target: tuple[int, Rect]) -> int | None:
        page, rect = target
        mx, my = midpoint(rect)
        for i, (rp, rr) in enumerate(regions):
            x0, y0, x1, y1 = rr
            if rp == page and x0 <= mx <= x1 and y0 <= my <= y1:
                return i
        return None

    first, last = holding(start), holding(end)
    if first is None or last is None or last < first:
        return [start, end] if start != end else [start]
    return regions[first:last + 1]


def resolve_chunk(anchor: ChunkAnchor, index: list[PageIndex], pdf: pymupdf.Document, doc: SourceDocument) -> ChunkAnchor:
    """Anchor the two ends independently. If both hold where they were, keep the
    stored rects. If they moved, rebuild the region from the layout regions
    between them with the same column-run rule extraction uses."""
    first_page = anchor.rects[0].page
    start = find_quote(index, anchor.start, anchor.position, first_page)
    end = find_quote(index, anchor.end, anchor.position, anchor.rects[-1].page)
    if start is None and end is None:
        return anchor.model_copy(update={"state": "orphaned"})

    def located(match: Match | None, fallback: PageRect) -> tuple[int, Rect]:
        if match is None:
            return fallback.page, fallback.rect
        rect = rects_for_text(pdf[match.page], index[match.page].text[match.start:match.end])
        return (match.page, rect) if rect else (fallback.page, fallback.rect)

    start_at = located(start, anchor.rects[0])
    end_at = located(end, anchor.rects[-1])
    if start and end and _still_inside(start_at, anchor.rects[0]) and _still_inside(end_at, anchor.rects[-1]):
        position = global_position(index, start.page, start.start)
        return anchor.model_copy(update={"state": "anchored", "position": position})

    widths = {p.index: p.width for p in doc.pages}
    runs = column_runs(_regions_between(doc, start_at, end_at), widths)
    rects = [PageRect(page=page, rect=rect) for page, rect in runs]
    position = global_position(index, start.page, start.start) if start else anchor.position
    return anchor.model_copy(update={"rects": rects, "position": position, "state": "relocated"})


def _still_inside(found: tuple[int, Rect], stored: PageRect) -> bool:
    """The recovered end sits on the stored page and inside the stored rect,
    give or take a few points."""
    page, rect = found
    if page != stored.page:
        return False
    bx0, by0, bx1, by1 = normalise(stored.rect)
    x0, y0, x1, y1 = normalise(rect)
    slack = SAME_PLACE_POINTS
    return bx0 - slack <= x0 and by0 - slack <= y0 and x1 <= bx1 + slack and y1 <= by1 + slack
```

- [ ] **Step 4: Run the tests**

Run: `.venv/bin/pytest tests/test_anchoring.py -v`
Expected: all pass. Two of them are calibrated guesses and may need one adjustment each, which is allowed only after printing the actual value:

- `test_quote_survives_an_inserted_word_with_a_lower_score` asserts a score band. Print `match.score` if it fails; an inserted word in a 45-character quote should land near 0.9. Widen the band, never remove it.
- `test_context_disambiguates_a_repeated_phrase` assumes "shortcut connections" occurs on page 1 and elsewhere. If the phrase is not on page 1 of this ResNet version, pick another two-page phrase from `page_text` and keep the test's shape: the prefix must decide, with the hint pointing at the wrong page.

- [ ] **Step 5: Commit**

```bash
git add src/paperboard/anchoring.py tests/test_anchoring.py
git commit -m "feat: anchor quotes with whitespace-stripped fuzzy matching and rect recovery"
```

---

### Task 5: Snap: a selection becomes an anchor

**Files:**
- Create: `src/paperboard/snap.py`
- Test: `tests/test_snap.py`

**Interfaces:**
- Consumes: `anchoring.build_index | strip_whitespace | global_position`, `board_model.QuoteSelector | HighlightAnchor | ChunkAnchor | CONTEXT_CHARS`, `geometry.union | midpoint | area`, `source_model.SourceDocument | PageRect`.
- Produces:
  - `SNAP_THRESHOLD = 0.6`
  - `Selection(text: str, rects: list[PageRect], region_label: str | None, highlight: HighlightAnchor | None, chunk: ChunkAnchor)` — a pydantic model, returned as JSON by `POST /text`.
  - `text_under(page: pymupdf.Page, rect: Rect) -> str`
  - `select(doc: SourceDocument, pdf: pymupdf.Document, rects: list[PageRect], snap: bool) -> Selection`

The rule from addendum 5.3: take the selection; find the smallest layout region containing its midpoint; if the selection covers at least 60% of that region's characters, the selection becomes the whole region. `snap=False` skips it. One implementation, here, and the browser never guesses.

- [ ] **Step 1: Write the failing test**

`tests/test_snap.py`:

```python
import pymupdf
import pytest

from paperboard.snap import SNAP_THRESHOLD, select, text_under
from paperboard.source_model import PageRect
from conftest import FIXTURES


@pytest.fixture(scope="module")
def resnet(extracted):
    pdf = pymupdf.open(FIXTURES["resnet"])
    yield extracted["resnet"], pdf
    pdf.close()


def _first_text_region(doc, page):
    return next(r for r in doc.regions if r.page == page and r.label == "text")


def _slice(region, fraction):
    x0, y0, x1, y1 = region.rect
    return PageRect(page=region.page, rect=(x0, y0, x1, y0 + (y1 - y0) * fraction))


def test_threshold_is_the_named_constant():
    assert SNAP_THRESHOLD == 0.6


def test_text_under_reads_the_words_inside_the_rect(resnet):
    doc, pdf = resnet
    region = _first_text_region(doc, 2)
    text = text_under(pdf[2], region.rect)
    assert len(text) > 100 and "\n" in text


def test_a_rough_drag_over_most_of_a_paragraph_snaps_to_the_whole_region(resnet):
    doc, pdf = resnet
    region = _first_text_region(doc, 2)
    result = select(doc, pdf, [_slice(region, 0.85)], snap=True)
    assert result.region_label == "text"
    assert result.rects == [PageRect(page=2, rect=region.rect)]
    assert result.text == text_under(pdf[2], region.rect)


def test_a_small_selection_stays_exact(resnet):
    doc, pdf = resnet
    region = _first_text_region(doc, 2)
    small = _slice(region, 0.3)
    result = select(doc, pdf, [small], snap=True)
    assert result.rects == [small]
    assert result.region_label == "text"
    assert result.text == text_under(pdf[2], small.rect)


def test_snap_false_keeps_exactly_what_was_selected(resnet):
    doc, pdf = resnet
    region = _first_text_region(doc, 2)
    big = _slice(region, 0.85)
    result = select(doc, pdf, [big], snap=False)
    assert result.rects == [big]


def test_selection_carries_both_anchor_shapes(resnet):
    doc, pdf = resnet
    region = _first_text_region(doc, 2)
    result = select(doc, pdf, [_slice(region, 0.85)], snap=True)
    assert result.highlight is not None
    assert result.highlight.page == 2 and result.highlight.rect == region.rect
    assert result.highlight.quote.exact == result.text.strip()
    assert len(result.highlight.quote.prefix) <= 32 and len(result.highlight.quote.suffix) <= 32
    assert result.chunk.rects == result.rects
    assert result.text.strip().startswith(result.chunk.start.exact[:20])
    assert result.text.strip().endswith(result.chunk.end.exact[-20:])


def test_multi_page_selection_has_no_highlight_anchor_and_does_not_snap(resnet):
    doc, pdf = resnet
    a = _first_text_region(doc, 2)
    b = _first_text_region(doc, 3)
    result = select(doc, pdf, [_slice(a, 0.9), _slice(b, 0.9)], snap=True)
    assert result.highlight is None
    assert [r.page for r in result.rects] == [2, 3]
    assert result.rects[0] == _slice(a, 0.9)
```

- [ ] **Step 2: Run it and watch it fail**

Run: `.venv/bin/pytest tests/test_snap.py -v`
Expected: FAIL, `ModuleNotFoundError: No module named 'paperboard.snap'`.

- [ ] **Step 3: Write `src/paperboard/snap.py`**

```python
"""A selection in the paper becomes text plus an anchor, snapped to a layout
region when the drag was rough. SPEC-ADDENDUM.md section 5.3, one implementation."""

import pymupdf
from pydantic import BaseModel

from paperboard.anchoring import build_index, global_position, strip_whitespace
from paperboard.board_model import CONTEXT_CHARS, ChunkAnchor, HighlightAnchor, QuoteSelector
from paperboard.geometry import Rect, area, midpoint, normalise
from paperboard.source_model import PageRect, SourceDocument

SNAP_THRESHOLD = 0.6   # a rough drag covering this share of a region's characters takes the region
END_CHARS = 64         # a chunk's start and end selectors quote this many characters


class Selection(BaseModel):
    text: str
    rects: list[PageRect]
    region_label: str | None
    highlight: HighlightAnchor | None
    chunk: ChunkAnchor


def text_under(page: pymupdf.Page, rect: Rect) -> str:
    return page.get_text("text", clip=pymupdf.Rect(*normalise(rect)))


def _smallest_region_at(doc: SourceDocument, page: int, point: tuple[float, float]):
    x, y = point
    inside = [
        r for r in doc.regions
        if r.page == page and r.rect[0] <= x <= r.rect[2] and r.rect[1] <= y <= r.rect[3]
    ]
    return min(inside, key=lambda r: area(r.rect)) if inside else None


def _snap_rect(pdf: pymupdf.Document, rect: PageRect, region) -> PageRect:
    """The whole region if the selection covers enough of its characters, else
    exactly what was selected."""
    page = pdf[rect.page]
    selected, _ = strip_whitespace(text_under(page, rect.rect))
    whole, _ = strip_whitespace(text_under(page, region.rect))
    if whole and len(selected) / len(whole) >= SNAP_THRESHOLD:
        return PageRect(page=rect.page, rect=normalise(region.rect))
    return rect


def _selector(page_text: str, exact: str) -> tuple[QuoteSelector, int]:
    """Prefix and suffix from the page's own text around the first occurrence,
    matched with whitespace stripped so line breaks do not defeat it."""
    stripped_page, offsets = strip_whitespace(page_text)
    needle, _ = strip_whitespace(exact)
    at = stripped_page.find(needle) if needle else -1
    if at == -1:
        return QuoteSelector(exact=exact), 0
    start = offsets[at]
    end = offsets[at + len(needle) - 1] + 1
    return (
        QuoteSelector(exact=exact, prefix=page_text[max(0, start - CONTEXT_CHARS):start],
                      suffix=page_text[end:end + CONTEXT_CHARS]),
        start,
    )


def select(doc: SourceDocument, pdf: pymupdf.Document, rects: list[PageRect], snap: bool) -> Selection:
    if not rects:
        raise ValueError("a selection needs at least one rectangle")
    label: str | None = None
    if len(rects) == 1:
        region = _smallest_region_at(doc, rects[0].page, midpoint(rects[0].rect))
        label = region.label if region else None
        if snap and region is not None:
            rects = [_snap_rect(pdf, rects[0], region)]

    pieces = [text_under(pdf[r.page], r.rect) for r in rects]
    text = "\n".join(piece.strip() for piece in pieces).strip()
    index = build_index(doc)
    first_page_text = doc.page_text[rects[0].page].text
    last_page_text = doc.page_text[rects[-1].page].text

    start, start_at = _selector(first_page_text, text[:END_CHARS])
    end, _ = _selector(last_page_text, text[-END_CHARS:])
    position = global_position(index, rects[0].page, start_at)
    chunk = ChunkAnchor(rects=rects, start=start, end=end, position=position)

    highlight = None
    if len(rects) == 1:
        quote, at = _selector(first_page_text, text)
        highlight = HighlightAnchor(page=rects[0].page, rect=rects[0].rect, quote=quote,
                                    position=global_position(index, rects[0].page, at))
    return Selection(text=text, rects=rects, region_label=label, highlight=highlight, chunk=chunk)
```

- [ ] **Step 4: Run the tests**

Run: `.venv/bin/pytest tests/test_snap.py -v`
Expected: all pass. `test_a_small_selection_stays_exact` uses 30% of the region's height; measured character coverage tracks height closely for a paragraph, but if this test snaps, print the coverage and lower the slice to 0.2. `test_a_rough_drag_over_most_of_a_paragraph_snaps_to_the_whole_region` uses 85%; if it does not snap, the region is probably not a single paragraph, so pick the second `text` region on the page instead.

- [ ] **Step 5: Commit**

```bash
git add src/paperboard/snap.py tests/test_snap.py
git commit -m "feat: turn a selection into text and anchors, snapping rough drags to layout regions"
```

---

### Task 6: Clips

**Files:**
- Create: `src/paperboard/clips.py`
- Test: `tests/test_clips.py`

**Interfaces:**
- Consumes: `geometry.pad | normalise`, `source_model.PageRect`.
- Produces: `render_clip(pdf: pymupdf.Document, target: PageRect, dpi: int = 150) -> tuple[bytes, int, int]` returning PNG bytes, pixel width, pixel height. `CLIP_PAD = 4.0`, `DEFAULT_DPI = 150`, `MAX_DPI = 300`.

- [ ] **Step 1: Write the failing test**

`tests/test_clips.py`:

```python
import pymupdf
import pytest

from paperboard.clips import DEFAULT_DPI, MAX_DPI, render_clip
from conftest import FIXTURES


@pytest.fixture(scope="module")
def resnet(extracted):
    pdf = pymupdf.open(FIXTURES["resnet"])
    yield extracted["resnet"], pdf
    pdf.close()


def test_renders_a_figure_to_png_at_the_expected_size(resnet):
    doc, pdf = resnet
    figure = next(f for f in doc.figures if f.label == "Figure 1")
    png, width, height = render_clip(pdf, figure.rect, dpi=DEFAULT_DPI)
    assert png.startswith(b"\x89PNG\r\n\x1a\n")
    x0, y0, x1, y1 = figure.rect.rect
    assert width == pytest.approx((x1 - x0 + 8) * DEFAULT_DPI / 72, abs=3)
    assert height == pytest.approx((y1 - y0 + 8) * DEFAULT_DPI / 72, abs=3)


def test_dpi_is_clamped(resnet):
    doc, pdf = resnet
    figure = doc.figures[0]
    _, w_big, _ = render_clip(pdf, figure.rect, dpi=10_000)
    _, w_max, _ = render_clip(pdf, figure.rect, dpi=MAX_DPI)
    assert w_big == w_max


def test_rect_is_clipped_to_the_page(resnet):
    doc, pdf = resnet
    off_page = doc.figures[0].rect.model_copy(update={"rect": (500.0, 700.0, 900.0, 1000.0)})
    png, width, height = render_clip(pdf, off_page)
    assert png and width > 0 and height > 0
```

- [ ] **Step 2: Run it and watch it fail**

Run: `.venv/bin/pytest tests/test_clips.py -v`
Expected: FAIL, `ModuleNotFoundError: No module named 'paperboard.clips'`.

- [ ] **Step 3: Write `src/paperboard/clips.py`**

```python
"""Render a rectangle of a page to PNG. Figures and equations are clips of the
paper as printed, never re-typeset (SPEC.md section 12)."""

import pymupdf

from paperboard.geometry import normalise, pad
from paperboard.source_model import PageRect

CLIP_PAD = 4.0      # points; a tight clip cuts the bottom row of glyphs
DEFAULT_DPI = 150
MAX_DPI = 300


def render_clip(pdf: pymupdf.Document, target: PageRect, dpi: int = DEFAULT_DPI) -> tuple[bytes, int, int]:
    dpi = max(36, min(MAX_DPI, int(dpi)))
    page = pdf[target.page]
    clip = pymupdf.Rect(*pad(normalise(target.rect), CLIP_PAD)) & page.rect
    if clip.is_empty:
        raise ValueError(f"rect {target.rect} lies outside page {target.page}")
    pixmap = page.get_pixmap(clip=clip, dpi=dpi, alpha=False)
    return pixmap.tobytes("png"), pixmap.width, pixmap.height
```

- [ ] **Step 4: Run the tests**

Run: `.venv/bin/pytest tests/test_clips.py -v`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/paperboard/clips.py tests/test_clips.py
git commit -m "feat: render page rectangles to PNG clips"
```

---

### Task 7: Export

**Files:**
- Create: `src/paperboard/export.py`
- Test: `tests/test_export.py`

**Interfaces:**
- Consumes: `board_model.Board | Highlight | ChunkNode | FigureNode | NoteNode`, `snap.text_under`, `source_model.SourceDocument`, `geometry.midpoint`.
- Produces: `export_markdown(doc: SourceDocument, board: Board, notes: dict[str, str], pdf: pymupdf.Document, tags: list[str]) -> str` and `highlights_in(board, node) -> list[Highlight]`, the geometric containment rule from addendum 4.0 that the frontend also implements.

Order and content per SPEC.md section 6: the goal; then each chunk and figure in the paper's order, with the highlights inside it and the notes connected to them; then highlights outside any chunk; then notes connected to nothing. Figure clips are image links to the board folder's own `clips/` files. Filtered by tag if any are given.

- [ ] **Step 1: Write the failing test**

`tests/test_export.py`:

```python
import pymupdf
import pytest

from paperboard.board_model import (
    Board, ChunkAnchor, ChunkNode, Edge, FigureNode, Highlight, HighlightAnchor, NoteNode, QuoteSelector,
)
from paperboard.export import export_markdown, highlights_in
from conftest import FIXTURES


@pytest.fixture(scope="module")
def resnet(extracted):
    pdf = pymupdf.open(FIXTURES["resnet"])
    yield extracted["resnet"], pdf
    pdf.close()


def _board(doc):
    intro = next(s for s in doc.sections if s.number == "1")
    method = next(s for s in doc.sections if s.number == "3.1")
    figure = next(f for f in doc.figures if f.label == "Figure 1")

    def region(section):
        return ChunkAnchor(rects=section.extent, start=QuoteSelector(exact=section.title),
                           end=QuoteSelector(exact=section.text[-40:]))

    inside = HighlightAnchor(page=method.extent[0].page,
                             rect=(method.extent[0].rect[0] + 2, method.extent[0].rect[1] + 20,
                                   method.extent[0].rect[2] - 2, method.extent[0].rect[1] + 40),
                             quote=QuoteSelector(exact="a passage inside 3.1"))
    outside = HighlightAnchor(page=9, rect=(60.0, 300.0, 280.0, 320.0), quote=QuoteSelector(exact="a passage on page 10"))
    return Board(
        paper_id=doc.paper_id, goal="understand residual blocks",
        nodes=[
            ChunkNode(id="n-method", type="chunk", position={"x": 0, "y": 0},
                      data={"tags": ["t-method"], "collapsed": False, "region": region(method).model_dump(), "text": method.text}),
            ChunkNode(id="n-intro", type="chunk", position={"x": 0, "y": 0},
                      data={"tags": ["t-claim"], "collapsed": False, "region": region(intro).model_dump(), "text": intro.text}),
            FigureNode(id="n-fig", type="figure", position={"x": 0, "y": 0},
                       data={"tags": ["t-evidence"], "collapsed": False,
                             "region": ChunkAnchor(rects=[figure.rect], start=QuoteSelector(exact=figure.caption), end=QuoteSelector(exact=figure.caption)).model_dump(),
                             "clip": "clips/n-fig.png", "clip_size": {"width": 436, "height": 300}, "caption": figure.caption}),
            NoteNode(id="n-note", type="note", position={"x": 0, "y": 0}, data={"tags": [], "collapsed": False, "note": "notes/n-note.md"}),
            NoteNode(id="n-loose", type="note", position={"x": 0, "y": 0}, data={"tags": ["t-question"], "collapsed": False, "note": "notes/n-loose.md"}),
        ],
        edges=[Edge(id="e-1", source="n-method", sourceHandle="h-in", target="n-note", data={"tags": ["t-supports"]})],
        highlights=[Highlight(id="h-in", tags=["t-question"], note="n-note", anchor=inside),
                    Highlight(id="h-out", tags=[], note=None, anchor=outside)],
    )


NOTES = {"n-note": "The block learns F(x) = H(x) - x.\n", "n-loose": "What is a bottleneck?\n"}


def test_highlights_in_uses_geometry(resnet):
    doc, _ = resnet
    board = _board(doc)
    method = next(n for n in board.nodes if n.id == "n-method")
    intro = next(n for n in board.nodes if n.id == "n-intro")
    assert [h.id for h in highlights_in(board, method)] == ["h-in"]
    assert highlights_in(board, intro) == []


def test_export_follows_the_papers_order_not_the_boards(resnet):
    doc, pdf = resnet
    md = export_markdown(doc, _board(doc), NOTES, pdf, tags=[])
    assert md.index("understand residual blocks") < md.index("1. Introduction")
    assert md.index("1. Introduction") < md.index("Figure 1") < md.index("3.1. Residual Learning")


def test_export_places_highlight_and_its_note_under_the_chunk(resnet):
    doc, pdf = resnet
    md = export_markdown(doc, _board(doc), NOTES, pdf, tags=[])
    section = md[md.index("3.1. Residual Learning"):]
    assert "> a passage inside 3.1" in section
    assert "F(x) = H(x) - x" in section
    assert md.index("a passage inside 3.1") < md.index("F(x) = H(x) - x")


def test_export_has_figure_image_and_loose_sections(resnet):
    doc, pdf = resnet
    md = export_markdown(doc, _board(doc), NOTES, pdf, tags=[])
    assert "![Figure 1](clips/n-fig.png)" in md
    assert "## Highlights outside any chunk" in md and "a passage on page 10" in md
    assert "## Notes" in md and "What is a bottleneck?" in md


def test_tag_filter_keeps_only_tagged_things(resnet):
    doc, pdf = resnet
    md = export_markdown(doc, _board(doc), NOTES, pdf, tags=["t-claim"])
    assert "1. Introduction" in md
    assert "3.1. Residual Learning" not in md
    assert "Figure 1" not in md
```

- [ ] **Step 2: Run it and watch it fail**

Run: `.venv/bin/pytest tests/test_export.py -v`
Expected: FAIL, `ModuleNotFoundError: No module named 'paperboard.export'`.

- [ ] **Step 3: Write `src/paperboard/export.py`**

```python
"""The board as one Markdown file in the paper's order. SPEC.md section 6: this
is the literature note, and nothing else is ever written by hand."""

import pymupdf

from paperboard.board_model import Board, ChunkNode, FigureNode, Highlight, NoteNode
from paperboard.geometry import midpoint, normalise
from paperboard.source_model import SourceDocument

TITLE_CHARS = 80


def _contains(page: int, rect, point_page: int, point) -> bool:
    x0, y0, x1, y1 = normalise(rect)
    return page == point_page and x0 <= point[0] <= x1 and y0 <= point[1] <= y1


def highlights_in(board: Board, node: ChunkNode | FigureNode) -> list[Highlight]:
    """Every highlight whose rect midpoint lies inside one of the node's rects.
    Nothing stores the relation (addendum 4.0)."""
    out = []
    for h in board.highlights:
        point = midpoint(h.anchor.rect)
        if any(_contains(r.page, r.rect, h.anchor.page, point) for r in node.data.region.rects):
            out.append(h)
    return out


def _wanted(tags: list[str], have: list[str]) -> bool:
    return not tags or bool(set(tags) & set(have))


def _title(node: ChunkNode | FigureNode) -> str:
    if isinstance(node, FigureNode):
        return node.data.caption.split(":")[0].split(".")[0].strip() or node.id
    first = node.data.region.start.exact.strip().splitlines()[0] if node.data.region.start.exact.strip() else node.data.text.strip()[:TITLE_CHARS]
    return first[:TITLE_CHARS]


def _order_key(node):
    first = node.data.region.rects[0]
    return (first.page, first.rect[1], first.rect[0])


def export_markdown(doc: SourceDocument, board: Board, notes: dict[str, str], pdf: pymupdf.Document, tags: list[str]) -> str:
    nodes = {n.id: n for n in board.nodes}
    notes_for: dict[str, list[str]] = {}
    for edge in board.edges:
        for a, handle, b in ((edge.source, edge.sourceHandle, edge.target), (edge.target, edge.targetHandle, edge.source)):
            other = nodes.get(b)
            if isinstance(other, NoteNode):
                notes_for.setdefault(handle or a, []).append(other.id)
    used_notes: set[str] = set()

    def note_lines(owner: str) -> list[str]:
        lines = []
        for note_id in notes_for.get(owner, []):
            body = notes.get(note_id, "").strip()
            if body:
                lines += ["", body]
                used_notes.add(note_id)
        return lines

    out: list[str] = []
    title = doc.sections[0].title if doc.sections else doc.paper_id
    out += [f"# {title}", ""]
    if board.goal.strip():
        out += [f"*Reading goal: {board.goal.strip()}*", ""]

    placed: set[str] = set()
    pieces = sorted((n for n in board.nodes if isinstance(n, (ChunkNode, FigureNode))), key=_order_key)
    for node in pieces:
        marks = [h for h in highlights_in(board, node)]
        placed.update(h.id for h in marks)
        if not _wanted(tags, node.data.tags) and not any(_wanted(tags, h.tags) for h in marks):
            continue
        out += [f"## {_title(node)}", ""]
        if isinstance(node, FigureNode):
            if node.data.clip:
                out += [f"![{_title(node)}]({node.data.clip})", ""]
            if node.data.caption:
                out += [node.data.caption.strip(), ""]
        for h in marks:
            if not _wanted(tags, h.tags) and tags:
                continue
            out += [f"> {h.anchor.quote.exact.strip()}"]
            out += note_lines(h.id)
            out += [""]
        out += note_lines(node.id)
        out += [""]

    loose = [h for h in board.highlights if h.id not in placed and _wanted(tags, h.tags)]
    if loose:
        out += ["## Highlights outside any chunk", ""]
        for h in sorted(loose, key=lambda h: (h.anchor.page, h.anchor.rect[1])):
            out += [f"> {h.anchor.quote.exact.strip()}  (page {h.anchor.page + 1})"]
            out += note_lines(h.id)
            out += [""]

    remaining = [n for n in board.nodes if isinstance(n, NoteNode) and n.id not in used_notes
                 and _wanted(tags, n.data.tags) and notes.get(n.id, "").strip()]
    if remaining:
        out += ["## Notes", ""]
        for n in remaining:
            out += [notes[n.id].strip(), ""]

    return "\n".join(out).rstrip() + "\n"
```

- [ ] **Step 4: Run the tests**

Run: `.venv/bin/pytest tests/test_export.py -v`
Expected: 5 passed. `test_export_follows_the_papers_order_not_the_boards` requires reading order: the Introduction before Figure 1, although the figure sits higher on the page in the other column. Sorting by `(page, y, x)` fails it. Executed, this was resolved by ordering pieces through the extracted layout regions, which are stored in reading order (ruling R1 in the API branch); that is the rule, and the `_order_key` sketch above is superseded by it.

- [ ] **Step 5: Commit**

```bash
git add src/paperboard/export.py tests/test_export.py
git commit -m "feat: export a board as Markdown in the paper's order"
```

---

### Task 8: The HTTP API

**Files:**
- Create: `src/paperboard/api.py`
- Test: `tests/test_api.py`

**Interfaces:**
- Consumes: everything above.
- Produces: `create_app(root: Path) -> FastAPI`. Routes, exactly:

| Method | Route | Body / params | Returns |
|---|---|---|---|
| `GET` | `/api/papers` | | `[{paper_id, title, page_count}]` |
| `POST` | `/api/papers` | multipart field `file` | `{paper_id}` `201`; runs extraction |
| `GET` | `/api/papers/{id}/source` | | `source.json` |
| `POST` | `/api/papers/{id}/extract` | | `{states: {id: state}}`; re-extracts, re-anchors, writes nothing but `source.json` |
| `GET` | `/api/papers/{id}/pdf` | | `application/pdf` |
| `GET` | `/api/papers/{id}/board` | | `board.json` with every anchor resolved |
| `PUT` | `/api/papers/{id}/board` | board JSON, header `If-Match: <version>` | `{version}` |
| `GET` | `/api/papers/{id}/notes/{node_id}` | | `{markdown}` |
| `PUT` | `/api/papers/{id}/notes/{node_id}` | `{markdown}` | `204` |
| `POST` | `/api/papers/{id}/text` | `{rects: [{page, rect}], snap}` | `Selection` (Task 5) |
| `PUT` | `/api/papers/{id}/clips/{node_id}` | `{page, rect, dpi}` | `{clip, clip_size}` |
| `GET` | `/api/papers/{id}/clips/{node_id}.png` | | `image/png` |
| `GET` | `/api/papers/{id}/questions` | | `[{id, kind, text}]` |
| `POST` | `/api/papers/{id}/export` | `{tags: [tag_id]}` | `{path, markdown}` |
| `GET` | `/api/tags` | | `tags.json` |
| `PUT` | `/api/tags` | `tags.json` | `tags.json` |

Errors are `{"error": {"code": "...", "message": "..."}}`: `404` `paper_not_found` / `note_not_found`, `409` `version_conflict` with `current` in the body, `422` `invalid` for malformed bodies or geometry, `500` `extraction_failed` with the extractor's message.

- [ ] **Step 1: Write the failing test**

`tests/test_api.py`:

```python
import json

import pytest
from fastapi.testclient import TestClient

from paperboard.api import create_app
from conftest import FIXTURES


@pytest.fixture
def client(store_root):
    return TestClient(create_app(store_root))


@pytest.fixture
def resnet_id(client):
    papers = client.get("/api/papers").json()
    return next(p["paper_id"] for p in papers if "residual" in p["paper_id"])


def _first_text_region(source, page):
    return next(r for r in source["regions"] if r["page"] == page and r["label"] == "text")


def test_list_and_source(client, resnet_id):
    assert client.get("/api/papers").status_code == 200
    source = client.get(f"/api/papers/{resnet_id}/source").json()
    assert source["schema"] == 1 and source["sections"]


def test_unknown_paper_is_404_with_the_error_shape(client):
    response = client.get("/api/papers/nope/source")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "paper_not_found"


def test_pdf_bytes(client, resnet_id):
    response = client.get(f"/api/papers/{resnet_id}/pdf")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert response.content[:5] == b"%PDF-"


def test_upload_runs_extraction(tmp_path):
    client = TestClient(create_app(tmp_path))
    with FIXTURES["adam"].open("rb") as handle:
        response = client.post("/api/papers", files={"file": ("adam.pdf", handle, "application/pdf")})
    assert response.status_code == 201
    paper_id = response.json()["paper_id"]
    assert "adam" in paper_id
    assert client.get(f"/api/papers/{paper_id}/source").json()["sections"]


def test_text_returns_a_selection_with_anchors(client, resnet_id):
    source = client.get(f"/api/papers/{resnet_id}/source").json()
    region = _first_text_region(source, 2)
    x0, y0, x1, y1 = region["rect"]
    body = {"rects": [{"page": 2, "rect": [x0, y0, x1, y0 + (y1 - y0) * 0.85]}], "snap": True}
    response = client.post(f"/api/papers/{resnet_id}/text", json=body)
    assert response.status_code == 200, response.text
    selection = response.json()
    assert selection["rects"] == [{"page": 2, "rect": region["rect"]}]
    assert selection["highlight"]["quote"]["exact"]
    assert selection["chunk"]["start"]["exact"]


def test_text_rejects_bad_geometry(client, resnet_id):
    response = client.post(f"/api/papers/{resnet_id}/text", json={"rects": [{"page": 2, "rect": [10, 10, 5, 20]}], "snap": True})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid"


def test_board_put_get_and_version_conflict(client, resnet_id):
    board = client.get(f"/api/papers/{resnet_id}/board").json()
    assert board["version"] == 0 and board["nodes"] == []

    source = client.get(f"/api/papers/{resnet_id}/source").json()
    region = _first_text_region(source, 2)
    selection = client.post(f"/api/papers/{resnet_id}/text", json={"rects": [{"page": 2, "rect": region["rect"]}], "snap": False}).json()
    board["highlights"] = [{"id": "h-1", "tags": ["t-question"], "note": None, "anchor": selection["highlight"]}]
    board["nodes"] = [{"id": "n-1", "type": "note", "position": {"x": 0, "y": 0}, "data": {"tags": [], "collapsed": False, "note": "notes/n-1.md"}}]

    put = client.put(f"/api/papers/{resnet_id}/board", json=board, headers={"If-Match": "0"})
    assert put.status_code == 200, put.text
    assert put.json()["version"] == 1

    stale = client.put(f"/api/papers/{resnet_id}/board", json=board, headers={"If-Match": "0"})
    assert stale.status_code == 409
    assert stale.json()["error"]["code"] == "version_conflict" and stale.json()["error"]["current"] == 1

    missing = client.put(f"/api/papers/{resnet_id}/board", json=board)
    assert missing.status_code == 409

    got = client.get(f"/api/papers/{resnet_id}/board").json()
    assert got["version"] == 1
    assert got["highlights"][0]["anchor"]["state"] == "anchored"


def test_board_with_runtime_fields_is_422(client, resnet_id):
    board = client.get(f"/api/papers/{resnet_id}/board").json()
    board["nodes"] = [{"id": "n-1", "type": "note", "position": {"x": 0, "y": 0}, "selected": True,
                       "data": {"tags": [], "collapsed": False, "note": "notes/n-1.md"}}]
    response = client.put(f"/api/papers/{resnet_id}/board", json=board, headers={"If-Match": "0"})
    assert response.status_code == 422


def test_notes_round_trip_and_404(client, resnet_id):
    assert client.get(f"/api/papers/{resnet_id}/notes/n-9").status_code == 404
    assert client.put(f"/api/papers/{resnet_id}/notes/n-9", json={"markdown": "hello *there*\n"}).status_code == 204
    assert client.get(f"/api/papers/{resnet_id}/notes/n-9").json() == {"markdown": "hello *there*\n"}


def test_questions_lists_unanswered_marks_and_pieces(client, resnet_id):
    test_board_put_get_and_version_conflict(client, resnet_id)
    questions = client.get(f"/api/papers/{resnet_id}/questions").json()
    assert [q["id"] for q in questions] == ["h-1"]
    assert questions[0]["kind"] == "highlight" and questions[0]["text"]

    # Connecting a note clears it. With no chunk on the board there is no node to
    # hang an edge on, so the highlight's own `note` field carries the link; the
    # frontend keeps that field in step with edges (addendum 4.0).
    board = client.get(f"/api/papers/{resnet_id}/board").json()
    board["highlights"][0]["note"] = "n-1"
    assert client.put(f"/api/papers/{resnet_id}/board", json=board, headers={"If-Match": str(board["version"])}).status_code == 200
    assert client.get(f"/api/papers/{resnet_id}/questions").json() == []


def test_clip_put_and_get(client, resnet_id):
    source = client.get(f"/api/papers/{resnet_id}/source").json()
    figure = source["figures"][0]
    response = client.put(f"/api/papers/{resnet_id}/clips/n-fig", json={**figure["rect"], "dpi": 100})
    assert response.status_code == 200, response.text
    assert response.json()["clip"] == "clips/n-fig.png"
    assert response.json()["clip_size"]["width"] > 0
    png = client.get(f"/api/papers/{resnet_id}/clips/n-fig.png")
    assert png.status_code == 200 and png.content.startswith(b"\x89PNG")


def test_export_writes_a_file_and_returns_it(client, resnet_id, store_root):
    test_board_put_get_and_version_conflict(client, resnet_id)
    client.put(f"/api/papers/{resnet_id}/notes/n-1", json={"markdown": "my words\n"})
    response = client.post(f"/api/papers/{resnet_id}/export", json={"tags": []})
    assert response.status_code == 200
    payload = response.json()
    assert payload["path"].endswith("export.md")
    assert (store_root / "papers" / resnet_id / "export.md").read_text() == payload["markdown"]
    assert "# " in payload["markdown"]


def test_tags_default_and_update(client):
    tags = client.get("/api/tags").json()
    assert len(tags["tags"]) == 10
    tags["tags"].append({"id": "t-mine", "name": "mine", "colour": "#123456"})
    assert client.put("/api/tags", json=tags).status_code == 200
    assert len(client.get("/api/tags").json()["tags"]) == 11


def test_reextract_reports_states_and_touches_only_source(client, resnet_id, store_root):
    test_board_put_get_and_version_conflict(client, resnet_id)
    board_before = (store_root / "papers" / resnet_id / "board.json").read_bytes()
    response = client.post(f"/api/papers/{resnet_id}/extract")
    assert response.status_code == 200
    assert response.json()["states"] == {"h-1": "anchored"}
    assert (store_root / "papers" / resnet_id / "board.json").read_bytes() == board_before
```

- [ ] **Step 2: Run it and watch it fail**

Run: `.venv/bin/pytest tests/test_api.py -v`
Expected: FAIL, `ModuleNotFoundError: No module named 'paperboard.api'`.

- [ ] **Step 3: Write `src/paperboard/api.py`**

```python
"""Routes and nothing else. Every rule lives in the module it belongs to; this
file turns HTTP into calls and exceptions into the one error shape."""

from contextlib import contextmanager
from pathlib import Path

import pymupdf
from fastapi import FastAPI, File, Header, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse, Response
from pydantic import BaseModel, Field, ValidationError

from paperboard.anchoring import build_index, resolve_chunk, resolve_highlight
from paperboard.board_model import Board, ChunkNode, FigureNode, NoteNode, TagFile
from paperboard.clips import DEFAULT_DPI, render_clip
from paperboard.export import export_markdown
from paperboard.extract import extract
from paperboard.snap import Selection, select
from paperboard.source_model import PageRect
from paperboard.store import NoteNotFound, PaperNotFound, Store, VersionConflict, atomic_write


class TextRequest(BaseModel):
    rects: list[PageRect] = Field(min_length=1)
    snap: bool = True


class NoteBody(BaseModel):
    markdown: str


class ClipRequest(PageRect):
    dpi: int = DEFAULT_DPI


class ExportRequest(BaseModel):
    tags: list[str] = []


def _error(status: int, code: str, message: str, **extra) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": {"code": code, "message": message, **extra}})


def create_app(root: Path) -> FastAPI:
    store = Store(root)
    app = FastAPI(title="paperboard", docs_url=None, redoc_url=None)

    @contextmanager
    def opened(paper_id: str):
        pdf = pymupdf.open(store.pdf_path(paper_id))
        try:
            yield pdf
        finally:
            pdf.close()

    def resolved_board(paper_id: str) -> Board:
        board = store.read_board(paper_id)
        doc = store.read_source(paper_id)
        index = build_index(doc)
        with opened(paper_id) as pdf:
            highlights = [h.model_copy(update={"anchor": resolve_highlight(h.anchor, index, pdf)}) for h in board.highlights]
            nodes = []
            for node in board.nodes:
                if isinstance(node, (ChunkNode, FigureNode)):
                    region = resolve_chunk(node.data.region, index, pdf, doc)
                    node = node.model_copy(update={"data": node.data.model_copy(update={"region": region})})
                nodes.append(node)
        return board.model_copy(update={"highlights": highlights, "nodes": nodes})

    # -- error shape --------------------------------------------------------

    @app.exception_handler(PaperNotFound)
    async def _paper_missing(_: Request, exc: PaperNotFound):
        return _error(404, "paper_not_found", f"no paper {exc}")

    @app.exception_handler(NoteNotFound)
    async def _note_missing(_: Request, exc: NoteNotFound):
        return _error(404, "note_not_found", f"no note {exc}")

    @app.exception_handler(VersionConflict)
    async def _conflict(_: Request, exc: VersionConflict):
        return _error(409, "version_conflict", str(exc), current=exc.current)

    @app.exception_handler(RequestValidationError)
    async def _invalid(_: Request, exc: RequestValidationError):
        return _error(422, "invalid", str(exc.errors()[0].get("msg", "invalid request")))

    @app.exception_handler(ValidationError)
    async def _invalid_model(_: Request, exc: ValidationError):
        return _error(422, "invalid", str(exc.errors()[0].get("msg", "invalid request")))

    @app.exception_handler(ValueError)
    async def _value(_: Request, exc: ValueError):
        return _error(422, "invalid", str(exc))

    # -- papers -------------------------------------------------------------

    @app.get("/api/papers")
    def list_papers():
        return [p.model_dump() for p in store.list_papers()]

    @app.post("/api/papers", status_code=201)
    async def add_paper(file: UploadFile = File(...)):
        try:
            doc = store.add_paper(await file.read())
        except Exception as exc:  # the extractor's own message, passed through
            return _error(500, "extraction_failed", f"{type(exc).__name__}: {exc}")
        return {"paper_id": doc.paper_id}

    @app.get("/api/papers/{paper_id}/source")
    def get_source(paper_id: str):
        return Response(store.read_source(paper_id).model_dump_json(by_alias=True), media_type="application/json")

    @app.post("/api/papers/{paper_id}/extract")
    def reextract(paper_id: str):
        try:
            doc = extract(store.pdf_path(paper_id))
        except Exception as exc:
            return _error(500, "extraction_failed", f"{type(exc).__name__}: {exc}")
        store.write_source(paper_id, doc)
        board = resolved_board(paper_id)
        states = {h.id: h.anchor.state for h in board.highlights}
        states.update({n.id: n.data.region.state for n in board.nodes if isinstance(n, (ChunkNode, FigureNode))})
        return {"states": states}

    @app.get("/api/papers/{paper_id}/pdf")
    def get_pdf(paper_id: str):
        return FileResponse(store.pdf_path(paper_id), media_type="application/pdf")

    # -- board --------------------------------------------------------------

    @app.get("/api/papers/{paper_id}/board")
    def get_board(paper_id: str):
        return Response(resolved_board(paper_id).model_dump_json(by_alias=True, exclude_none=True), media_type="application/json")

    @app.put("/api/papers/{paper_id}/board")
    def put_board(paper_id: str, board: Board, if_match: str | None = Header(default=None)):
        expected = int(if_match) if if_match is not None and if_match.isdigit() else None
        return {"version": store.write_board(paper_id, board, expected)}

    # -- notes --------------------------------------------------------------

    @app.get("/api/papers/{paper_id}/notes/{node_id}")
    def get_note(paper_id: str, node_id: str):
        return {"markdown": store.read_note(paper_id, node_id)}

    @app.put("/api/papers/{paper_id}/notes/{node_id}", status_code=204)
    def put_note(paper_id: str, node_id: str, body: NoteBody):
        store.write_note(paper_id, node_id, body.markdown)
        return Response(status_code=204)

    # -- text, clips --------------------------------------------------------

    @app.post("/api/papers/{paper_id}/text", response_model=Selection)
    def post_text(paper_id: str, body: TextRequest):
        doc = store.read_source(paper_id)
        with opened(paper_id) as pdf:
            return select(doc, pdf, body.rects, body.snap)

    @app.put("/api/papers/{paper_id}/clips/{node_id}")
    def put_clip(paper_id: str, node_id: str, body: ClipRequest):
        with opened(paper_id) as pdf:
            png, width, height = render_clip(pdf, PageRect(page=body.page, rect=body.rect), body.dpi)
        return {"clip": store.write_clip(paper_id, node_id, png), "clip_size": {"width": width, "height": height}}

    @app.get("/api/papers/{paper_id}/clips/{node_id}.png")
    def get_clip(paper_id: str, node_id: str):
        path = store.clip_path(paper_id, node_id)
        if not path.exists():
            return _error(404, "clip_not_found", f"no clip for {node_id}")
        return FileResponse(path, media_type="image/png")

    # -- questions, export --------------------------------------------------

    @app.get("/api/papers/{paper_id}/questions")
    def questions(paper_id: str):
        board = store.read_board(paper_id)
        nodes = {n.id: n for n in board.nodes}
        answered: set[str] = set()
        for edge in board.edges:
            for a, handle, b in ((edge.source, edge.sourceHandle, edge.target), (edge.target, edge.targetHandle, edge.source)):
                if isinstance(nodes.get(b), NoteNode):
                    answered.add(handle or a)
        out = []
        for h in board.highlights:
            if "t-question" in h.tags and h.note is None and h.id not in answered:
                out.append({"id": h.id, "kind": "highlight", "text": h.anchor.quote.exact})
        for n in board.nodes:
            if "t-question" in n.data.tags and n.id not in answered and not isinstance(n, NoteNode):
                text = n.data.region.start.exact if isinstance(n, (ChunkNode, FigureNode)) else (n.data.name or "")
                out.append({"id": n.id, "kind": n.type, "text": text})
        return out

    @app.post("/api/papers/{paper_id}/export")
    def export(paper_id: str, body: ExportRequest):
        doc = store.read_source(paper_id)
        board = store.read_board(paper_id)
        notes = {}
        for n in board.nodes:
            if isinstance(n, NoteNode):
                try:
                    notes[n.id] = store.read_note(paper_id, n.id)
                except NoteNotFound:
                    notes[n.id] = ""
        with opened(paper_id) as pdf:
            markdown = export_markdown(doc, board, notes, pdf, body.tags)
        path = store.paper_dir(paper_id) / "export.md"
        atomic_write(path, markdown.encode("utf-8"))
        return {"path": str(path), "markdown": markdown}

    # -- tags ---------------------------------------------------------------

    @app.get("/api/tags")
    def get_tags():
        return Response(store.read_tags().model_dump_json(by_alias=True), media_type="application/json")

    @app.put("/api/tags")
    def put_tags(tags: TagFile):
        store.write_tags(tags)
        return Response(store.read_tags().model_dump_json(by_alias=True), media_type="application/json")

    return app
```

- [ ] **Step 4: Run the tests**

Run: `.venv/bin/pytest tests/test_api.py -v`
Expected: all pass. Two points where FastAPI's behaviour decides the outcome:

- A `Board` that fails validation inside the request body raises `RequestValidationError`, which the handler maps to `422 invalid`. Confirm with `test_board_with_runtime_fields_is_422`.
- `If-Match` arrives as the `if_match` parameter through `Header`; FastAPI converts the underscore. If the header is not seen, print `request.headers` once, do not guess.

- [ ] **Step 5: Commit**

```bash
git add src/paperboard/api.py tests/test_api.py
git commit -m "feat: add the HTTP API over the store, anchoring, snap, clips and export"
```

---

### Task 9: `paperboard serve`

**Files:**
- Modify: `src/paperboard/cli.py`
- Test: `tests/test_cli.py`

**Interfaces:**
- Consumes: `api.create_app`.
- Produces: `paperboard serve [--root DIR] [--web DIR] [--port 8765]`, binding `127.0.0.1`. `--root` is the data folder holding `papers/` and `tags.json`. `--web` is the frontend build folder, default `web/dist` relative to the current directory, which is where the frontend plan puts it; if its `index.html` exists it is served at `/`, otherwise `/` returns a one-line JSON saying so. The two folders are separate on purpose: one is the reader's data, the other is the program.

- [ ] **Step 1: Write the failing test**

Append to `tests/test_cli.py`:

```python
from fastapi.testclient import TestClient

from paperboard.cli import build_app


def test_build_app_serves_the_api_and_a_placeholder_root(tmp_path):
    client = TestClient(build_app(tmp_path / "data", tmp_path / "missing-web"))
    assert client.get("/api/papers").json() == []
    assert client.get("/").json()["message"].startswith("paperboard API")


def test_build_app_serves_the_frontend_when_built(tmp_path):
    dist = tmp_path / "dist"
    dist.mkdir(parents=True)
    (dist / "index.html").write_text("<!doctype html><title>board</title>")
    client = TestClient(build_app(tmp_path / "data", dist))
    assert client.get("/").status_code == 200
    assert "board" in client.get("/").text


def test_serve_command_exists():
    result = runner.invoke(app, ["serve", "--help"])
    assert result.exit_code == 0 and "--port" in result.output
```

- [ ] **Step 2: Run it and watch it fail**

Run: `.venv/bin/pytest tests/test_cli.py -v`
Expected: FAIL, `ImportError: cannot import name 'build_app'`.

- [ ] **Step 3: Add to `src/paperboard/cli.py`**

```python
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from paperboard.api import create_app

HOST = "127.0.0.1"
DEFAULT_PORT = 8765
DEFAULT_WEB = Path("web") / "dist"


def build_app(root: Path, web: Path = DEFAULT_WEB) -> FastAPI:
    """The API over the data folder `root`, plus the frontend build at `/` when
    `web/index.html` exists."""
    application = create_app(root)
    if (web / "index.html").exists():
        application.mount("/", StaticFiles(directory=web, html=True), name="web")
    else:
        @application.get("/")
        def placeholder():
            return {"message": "paperboard API is running; the web build is not present"}
    return application


@app.command("serve")
def serve_command(
    root: Path = typer.Option(Path("."), "--root", help="Data folder holding papers/ and tags.json."),
    web: Path = typer.Option(DEFAULT_WEB, "--web", help="Frontend build folder (web/dist)."),
    port: int = typer.Option(DEFAULT_PORT, "--port", help="Local port."),
) -> None:
    """Run the local server on 127.0.0.1 only."""
    import uvicorn

    typer.echo(f"paperboard at http://{HOST}:{port}  (data: {root.resolve()}, web: {web.resolve()})")
    uvicorn.run(build_app(root, web), host=HOST, port=port, log_level="warning")
```

`import uvicorn` is inside the command so that importing the CLI module for tests does not start anything.

- [ ] **Step 4: Run the CLI tests**

Run: `.venv/bin/pytest tests/test_cli.py -v`
Expected: all pass.

- [ ] **Step 5: Run the whole suite, then the server by hand**

```bash
.venv/bin/pytest -q
.venv/bin/paperboard serve --root /tmp/pb-root &
curl -s -F "file=@tests/fixtures/papers/resnet.pdf" http://127.0.0.1:8765/api/papers
curl -s http://127.0.0.1:8765/api/papers | head -c 300
```

Expected: green suite; the upload returns a paper id; the list shows one paper. Kill the server.

- [ ] **Step 6: Commit**

```bash
git add src/paperboard/cli.py tests/test_cli.py
git commit -m "feat: add paperboard serve"
```

---

## Done when

- `.venv/bin/pytest` is green with no network access, under the same socket block the extraction plan used.
- `paperboard serve` answers every route in Task 8's table against a folder containing the three fixtures.
- You have read one exported `export.md` for ResNet with a chunk, a highlight, and a note in it, and it reads as a literature note in the paper's order.
- The frontend plan can be written against Task 8's table and Task 2's names without opening this code.

## Amendments to SPEC-ADDENDUM.md when this plan is accepted

1. **Section 4:** `board.json` gains a top-level `version` integer, default 0, incremented by the server on every accepted write. Section 7 already promised it.
2. **Section 6, routes:** `GET /clip?page=&rect=&dpi=` is replaced by `PUT /clips/{node_id}` (render and store) and `GET /clips/{node_id}.png` (serve), because the client cannot write files and the board references clips by path.
3. **Section 6, `/text`:** the response is `Selection`: `{text, rects, region_label, highlight, chunk}`, where `highlight` is a ready-to-store highlight anchor (null for a multi-page selection) and `chunk` a ready-to-store chunk anchor. The browser decides which to keep, per the gesture.
4. **Section 5.2, step 1:** "sort pages by distance from the hint" becomes "score every page; the hint breaks ties". Measured: scoring all pages of a paper takes a few milliseconds.
5. **Section 5.1:** rectangles are recovered from the matched words with `page.search_for`, so a relocated highlight's rect is the text's real bounding box, never a shifted copy of the stored one.
6. **Section 5.3:** snapping applies only to single-page selections in v1.
7. **Section 8:** the fixture paragraph already reflects the fetch script; add "the `extracted` session fixture in `tests/conftest.py` is how every test gets a parsed paper".

## Not in this plan

The browser. Nothing here renders a page, draws a canvas, or handles a drag. The frontend plan consumes Task 8's routes and Task 2's shapes exactly as written.
