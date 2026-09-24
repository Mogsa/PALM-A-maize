"""The `board.json`, `tags.json` and `template.json` contract. See
SPEC-ADDENDUM.md section 4.

Board schema 2. Nodes are React Flow's native shape with its runtime fields
forbidden; edges are stored by the two things they connect (`from`, `to`) and
become React Flow edges only at render (addendum 4.0). Plus the `highlights`
array (marks on the paper, never nodes), view state, and a `version` integer
for optimistic concurrency. Everything that reads or writes a board goes through
these models and `dump_board`, so a board that did not change produces a
byte-identical file. A schema 1 board is migrated before it gets here
(`migrate.py`).
"""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from paperboard.geometry import Rect
from paperboard.source_model import PageRect

# The board and tags schemas are numbered independently since board schema 2
# (addendum 4): tags.json and template.json did not change.
BOARD_SCHEMA_VERSION = 2
TAGS_SCHEMA_VERSION = 1
TEMPLATE_SCHEMA_VERSION = 1
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
    """One rect per line of the selection, in reading order (addendum 5.1)."""
    rects: list[PageRect] = Field(min_length=1)
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


class PaperScroll(BaseModel):
    """Where the paper view starts: a page, and PDF points down from its top edge."""
    page: int = Field(ge=0)
    y: float


class TextBlock(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["text"]
    page: int = Field(ge=0)
    rect: Rect
    text: str


class ClipBlock(BaseModel):
    """A formula, picture or table shown as a rendered clip (`GET /render`)."""
    model_config = ConfigDict(extra="forbid")
    kind: Literal["clip"]
    page: int = Field(ge=0)
    rect: Rect
    label: str | None = None


Block = Annotated[TextBlock | ClipBlock, Field(discriminator="kind")]


class ChunkData(BaseModel):
    model_config = ConfigDict(extra="forbid")
    tags: list[str] = []
    collapsed: bool = False
    region: ChunkAnchor
    blocks: list[Block] = []
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
    user_sized: bool = False
    source_id: str | None = None   # figure id from source.json when made by split


class NoteData(BaseModel):
    model_config = ConfigDict(extra="forbid")
    tags: list[str] = []
    collapsed: bool = False
    note: str
    origin: Literal["reader", "ai"] = "reader"   # set at creation, never changed (addendum 6.2)
    user_sized: bool = False


class GroupData(BaseModel):
    model_config = ConfigDict(extra="forbid")
    tags: list[str] = []
    name: str | None = None
    tray: bool | None = None     # true on the tray only; absent elsewhere (addendum 4.9)
    prompt: str | None = None    # a slot's question; absent on a group without one


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
    """A connection between two things themselves, each a node id or a highlight
    id. The order is the order it was drawn in and means nothing. React Flow's
    source/target and handles are computed at render, never stored (addendum 4.0)."""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)
    id: str
    from_: str = Field(alias="from")
    to: str
    data: EdgeData = EdgeData()
    _id = field_validator("id")(_prefixed("e-"))


class Board(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)
    schema_version: Literal[2] = Field(default=BOARD_SCHEMA_VERSION, alias="schema")
    paper_id: str
    version: int = Field(default=0, ge=0)
    goal: str = ""
    view: Literal["paper", "board"] = "paper"
    paper_scroll: PaperScroll | None = None
    active_tags: list[str] = []
    viewport: Viewport = Viewport()
    nodes: list[Node] = []
    edges: list[Edge] = []
    highlights: list[Highlight] = []
    # Fingerprint of the source text the anchors were last resolved against
    # (anchoring.anchor_basis). Loading re-finds anchors only when it differs.
    anchor_basis: str | None = None

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
        ends = nodes_by_id.keys() | {h.id for h in self.highlights}
        for edge in self.edges:
            for end in (edge.from_, edge.to):
                if end not in ends:
                    raise ValueError(f"edge {edge.id} references unknown node or highlight {end!r}")
        return self


class Tag(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    name: str
    colour: str = Field(pattern=r"^#[0-9A-Fa-f]{6}$")
    _id = field_validator("id")(_prefixed("t-"))


class TagFile(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)
    schema_version: int = Field(default=TAGS_SCHEMA_VERSION, alias="schema")
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
    Tag(id="t-term", name="term", colour="#0F766E"),
]


class TemplateSlot(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str
    prompt: str


class TemplateFile(BaseModel):
    """`template.json`: the slots a new board is laid out with, in grid order,
    three columns (addendum 4.8)."""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)
    schema_version: int = Field(default=TEMPLATE_SCHEMA_VERSION, alias="schema")
    slots: list[TemplateSlot] = []


DEFAULT_SLOTS = [
    TemplateSlot(name="Background", prompt="What do you need to know first: terms, notation, setup?"),
    TemplateSlot(name="Problem", prompt="What problem is this solving, and why should anyone care?"),
    TemplateSlot(name="Prior work & gap", prompt="What did earlier work do, and what did it miss?"),
    TemplateSlot(name="Main point", prompt="In your own words: what is the one thing this paper shows?"),
    TemplateSlot(name="How it works", prompt="What are the key parts of the approach?"),
    TemplateSlot(name="Evidence", prompt="Does the evidence actually support the claim?"),
    TemplateSlot(name="Limits", prompt="What does it assume, and where does it stop holding?"),
    TemplateSlot(name="My take", prompt="What do the authors conclude, and do you agree?"),
    TemplateSlot(name="Open questions", prompt="What is still open? What would you ask the authors?"),
]


def dump_board(board: Board) -> str:
    """The one serializer. Aliases on, `None` fields dropped, stable indentation."""
    return board.model_dump_json(by_alias=True, exclude_none=True, indent=2) + "\n"


def dump_tags(tags: TagFile) -> str:
    return tags.model_dump_json(by_alias=True, indent=2) + "\n"


def dump_template(template: TemplateFile) -> str:
    return template.model_dump_json(by_alias=True, indent=2) + "\n"
