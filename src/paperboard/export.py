"""The board as one Markdown file in the paper's order. SPEC.md section 6: this
is the literature note, and nothing else is ever written by hand."""

import re
from collections.abc import Set as AbstractSet
from typing import Literal

import pymupdf

from paperboard.board_model import (
    Board,
    ChunkNode,
    FigureNode,
    GroupNode,
    Highlight,
    NoteNode,
    TextBlock,
)
from paperboard.geometry import contains_point, midpoint, normalise
from paperboard.source_model import SourceDocument

TITLE_CHARS = 80
BARE_NUMBER = re.compile(r"^\d+(\.\d+)*[.)]?$")
TOP_INSET_POINTS = 1.0  # how far below a rect's top edge its "top-centre" point sits

ExportOrder = Literal["paper", "template"]


def highlights_in(board: Board, node: ChunkNode | FigureNode) -> list[Highlight]:
    """Every highlight with at least one line rect whose midpoint lies inside one
    of the node's rects on the same page. Nothing stores the relation (addendum 4.0)."""
    regions = node.data.region.rects
    return [h for h in board.highlights
            if any(r.page == line.page and contains_point(r.rect, *midpoint(line.rect))
                   for line in h.anchor.rects for r in regions)]


def _wanted(tags: list[str], have: list[str]) -> bool:
    return not tags or bool(set(tags) & set(have))


def _first_line(text: str) -> str:
    """The first line, joined with the next when it is only a heading number:
    PDFs often break "5.1" and "Learning rate" onto separate lines."""
    lines = [line.strip() for line in text.strip().splitlines() if line.strip()]
    if len(lines) > 1 and BARE_NUMBER.match(lines[0]):
        return f"{lines[0]} {lines[1]}"
    return lines[0]


def _title(node: ChunkNode | FigureNode) -> str:
    if isinstance(node, FigureNode):
        return node.data.caption.split(":")[0].split(".")[0].strip() or node.id
    if node.data.region.start.exact.strip():
        return _first_line(node.data.region.start.exact)[:TITLE_CHARS]
    text = "\n".join(b.text for b in node.data.blocks if isinstance(b, TextBlock))
    return text.strip()[:TITLE_CHARS]


def _region_index(doc: SourceDocument, page: int, rect) -> int | None:
    """Index in `doc.regions` of the layout region a node's first rect starts
    in. `doc.regions` is stored in extraction order, which is reading order
    (the same assumption anchoring's `_regions_between` makes), so this index
    doubles as a reading-order position.

    Ruling R14 (M7): the region that holds the rect's top-centre point, the
    same point-in-region direction anchoring uses, so a one-line cut finds the
    paragraph it was cut from. Measured on the fixtures, that point falls in
    no region for every figure rect (padded a few points beyond its picture
    region) and for 10 of 67 section extents (a short heading narrower than
    the column its extent spans, e.g. ResNet "1. Introduction"). Those still
    match by ruling R1's rule, the first region whose midpoint lies inside
    the rect."""
    x0, y0, x1, _y1 = normalise(rect)
    top_centre = ((x0 + x1) / 2, y0 + TOP_INSET_POINTS)
    on_page = [(i, region) for i, region in enumerate(doc.regions) if region.page == page]
    for i, region in on_page:
        if contains_point(region.rect, *top_centre):
            return i
    for i, region in on_page:
        if contains_point(rect, *midpoint(region.rect)):
            return i
    return None


def _order_key(doc: SourceDocument, node: ChunkNode | FigureNode):
    """Reading order, not board position, not `(page, y0, x0)` (ruling R1).

    On ResNet page 0, the `1. Introduction` heading sits at y0 536 in the
    left column while Figure 1 sits at y0 220 in the right column: sorting by
    `(page, y0, x0)` would put the figure first, but SPEC.md section 6 wants
    "the paper's own order" and the introduction reads before the figure.
    Instead, order by the layout region the node's first rect starts in
    (`_region_index`). A rect that matches no region sorts after the matched
    nodes on its page, by `(y0, x0)`.
    """
    first = node.data.region.rects[0]
    return _reading_key(doc, first.page, first.rect)


def _mark_key(doc: SourceDocument, highlight: Highlight):
    """A highlight's place in reading order, by the same rule as a node's: its first line."""
    first = highlight.anchor.rects[0]
    return _reading_key(doc, first.page, first.rect)


def _reading_key(doc: SourceDocument, page: int, rect):
    idx = _region_index(doc, page, rect)
    x0, y0, _x1, _y1 = normalise(rect)
    # Within one region, top to bottom then left to right.
    return (page, idx if idx is not None else float("inf"), y0, x0)


Piece = ChunkNode | FigureNode


def _is_slot(node) -> bool:
    """A slot is a group with a prompt (addendum 4.9)."""
    return isinstance(node, GroupNode) and bool(node.data.prompt)


def _slot_of(node, by_id: dict) -> str | None:
    """The id of the nearest slot enclosing `node`, at any depth, or None."""
    parent = node.parentId
    while parent is not None:
        group = by_id[parent]
        if _is_slot(group):
            return group.id
        parent = group.parentId
    return None


def _connected_notes(board: Board) -> dict[str, list[str]]:
    """For each highlight or node id, the notes connected to it in either
    direction, in edge order. Nothing caches this (addendum 4.0, D7)."""
    note_ids = {n.id for n in board.nodes if isinstance(n, NoteNode)}
    out: dict[str, list[str]] = {}
    for edge in board.edges:
        for end, other in ((edge.from_, edge.to), (edge.to, edge.from_)):
            linked = out.setdefault(end, [])
            if other in note_ids and other not in linked:
                linked.append(other)
    return out


def _quoted(text: str) -> str:
    return "\n".join(f"> {line}".rstrip() for line in text.strip().splitlines())


def _page_of(node: Piece) -> int:
    return node.data.region.rects[0].page + 1


class _Writer:
    """One pass over the board. It remembers what it has written, so a highlight
    or a note is written once, at its first place (addendum 6.1)."""

    def __init__(self, doc: SourceDocument, board: Board, notes: dict[str, str],
                 tags: list[str], tag_names: dict[str, str], sketches: AbstractSet[str], ids: bool = False):
        self.doc, self.board, self.notes, self.sketches = doc, board, notes, sketches
        self.ids = ids
        self.tags, self.tag_names = tags, tag_names
        self.out: list[str] = []
        self.written: set[str] = set()
        self.by_id = {n.id: n for n in board.nodes}
        self.notes_for = _connected_notes(board)
        self.pieces = sorted((n for n in board.nodes if isinstance(n, (ChunkNode, FigureNode))),
                             key=lambda n: _order_key(doc, n))
        self.inside = {h.id for p in self.pieces for h in highlights_in(board, p)}

    def para(self, text: str) -> None:
        self.out += [text, ""]

    def id_of(self, thing_id: str) -> None:
        """With `ids`, the id of what was just written, as a comment a reader never sees (board.md)."""
        if self.ids:
            self.para(f"<!-- id: {thing_id} -->")

    def header(self) -> None:
        title = self.doc.sections[0].title if self.doc.sections else self.doc.paper_id
        self.para(f"# {title}")
        if self.board.goal.strip():
            self.para(f"*Reading goal: {self.board.goal.strip()}*")

    def has_content(self, note_id: str) -> bool:
        return bool(self.notes.get(note_id, "").strip()) or note_id in self.sketches

    def note(self, note_id: str) -> None:
        if not self.has_content(note_id) or note_id in self.written:
            return
        # A sketch sits above its note's text, as on the board (D23); export.md is in the paper's folder, beside notes/.
        if note_id in self.sketches:
            self.para(f"![sketch](notes/{note_id}.svg)")
        body = self.notes.get(note_id, "").strip()
        if body:
            # An AI's words are never passed off as the reader's (D14). The reader drew the sketch, so it is unlabelled.
            self.para(f"**AI:** {body}" if self.by_id[note_id].data.origin == "ai" else body)
        self.id_of(note_id)
        self.written.add(note_id)

    def notes_of(self, owner: str) -> None:
        for note_id in self.notes_for.get(owner, []):
            self.note(note_id)

    def mark(self, highlight: Highlight, with_page: bool = False) -> None:
        self.para(_quoted(highlight.anchor.quote.exact))
        names = [self.tag_names[t] for t in highlight.tags if t in self.tag_names]
        meta = [f"p. {highlight.anchor.rects[0].page + 1}"] if with_page else []
        if names:
            meta.append(", ".join(names))
        if meta:
            self.para(f"*{' · '.join(meta)}*")
        self.id_of(highlight.id)
        self.written.add(highlight.id)
        self.notes_of(highlight.id)

    def piece(self, node: Piece, level: int) -> None:
        """A chunk or figure, when it or a highlight inside it carries a wanted
        tag, then its unwritten highlights in paper order, then its notes."""
        inside = highlights_in(self.board, node)
        if not _wanted(self.tags, node.data.tags) and not any(_wanted(self.tags, h.tags) for h in inside):
            return
        self.para(f"{'#' * level} {_title(node)} (p. {_page_of(node)})")
        self.id_of(node.id)
        if isinstance(node, FigureNode):
            if node.data.clip:
                self.para(f"![{_title(node)}]({node.data.clip})")
            if node.data.caption.strip():
                self.para(node.data.caption.strip())
        marks = [h for h in inside if h.id not in self.written and _wanted(self.tags, h.tags)]
        for h in sorted(marks, key=lambda h: _mark_key(self.doc, h)):
            self.mark(h)
        self.notes_of(node.id)

    def paper_body(self, pieces: list[Piece], level: int) -> None:
        """Section 6.1 items 2 to 4: the pieces, the highlights no piece holds,
        then every note not yet written."""
        for node in pieces:
            self.piece(node, level)
        loose = [h for h in self.board.highlights
                 if h.id not in self.inside and h.id not in self.written and _wanted(self.tags, h.tags)]
        if loose:
            self.para(f"{'#' * level} Highlights outside any chunk")
            for h in sorted(loose, key=lambda h: _mark_key(self.doc, h)):
                self.mark(h, with_page=True)
        remaining = [n.id for n in self.board.nodes if isinstance(n, NoteNode) and n.id not in self.written
                     and _wanted(self.tags, n.data.tags) and self.has_content(n.id)]
        if remaining:
            self.para(f"{'#' * level} Notes")
            for note_id in remaining:
                self.note(note_id)

    def template_body(self) -> None:
        """D19: each slot in `nodes` order, with the notes and pieces whose
        nearest slot it is, then everything in no slot in paper order. With a
        filter, a slot's note is written when it or the slot carries a wanted tag
        (section 6.1: "a note when it carries one or is written under something
        that is"); the slot's heading and prompt are always written."""
        home = {n.id: _slot_of(n, self.by_id) for n in self.board.nodes}
        for slot in (n for n in self.board.nodes if _is_slot(n)):
            self.para(f"## {slot.data.name or ''}".rstrip())
            self.para(f"*{slot.data.prompt.strip()}*")
            for n in self.board.nodes:
                if (isinstance(n, NoteNode) and home[n.id] == slot.id
                        and (_wanted(self.tags, n.data.tags) or _wanted(self.tags, slot.data.tags))):
                    self.note(n.id)
            for piece in self.pieces:
                if home[piece.id] == slot.id:
                    self.piece(piece, 3)
        start = len(self.out)
        self.paper_body([p for p in self.pieces if home[p.id] is None], 3)
        if len(self.out) > start:
            self.out[start:start] = ["## Not in a slot", ""]


def export_markdown(doc: SourceDocument, board: Board, notes: dict[str, str], pdf: pymupdf.Document,
                    tags: list[str], order: ExportOrder = "paper",
                    tag_names: dict[str, str] | None = None, sketches: AbstractSet[str] = frozenset(),
                    ids: bool = False) -> str:
    """The literature note (addendum 6.1). `tags` filters; `order` is the paper's
    (default) or the template's (D19). `tag_names` maps tag ids to the names
    written after a quote; an id it lacks is a deleted tag and is left out (4.3).
    `sketches` holds the ids of the notes that have a sketch (D23). `ids` writes each
    highlight's, piece's and note's id after it (board.md, for an agent)."""
    writer = _Writer(doc, board, notes, tags, tag_names or {}, sketches, ids)
    writer.header()
    if order == "template":
        writer.template_body()
    else:
        writer.paper_body(writer.pieces, 2)
    return "\n".join(writer.out).rstrip() + "\n"
