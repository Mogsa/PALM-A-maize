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


def _prefixed(prefix: str):
    def check(value: str) -> str:
        if not value.startswith(prefix) or len(value) <= len(prefix):
            raise ValueError(f"id must start with {prefix!r}, got {value!r}")
        return value
    return check


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
    _id = field_validator("id")(_prefixed("h-"))


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
    _id = field_validator("id")(_prefixed("n-"))


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
    _id = field_validator("id")(_prefixed("e-"))


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
    _id = field_validator("id")(_prefixed("t-"))


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
