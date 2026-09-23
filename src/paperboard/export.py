"""The board as one Markdown file in the paper's order. SPEC.md section 6: this
is the literature note, and nothing else is ever written by hand."""

from typing import Literal

import pymupdf

from paperboard.board_model import Board, ChunkNode, FigureNode, Highlight, NoteNode, TextBlock
from paperboard.geometry import contains_point, midpoint, normalise
from paperboard.source_model import SourceDocument

TITLE_CHARS = 80
TOP_INSET_POINTS = 1.0   # how far below a rect's top edge its "top-centre" point sits

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


def _title(node: ChunkNode | FigureNode) -> str:
    if isinstance(node, FigureNode):
        return node.data.caption.split(":")[0].split(".")[0].strip() or node.id
    if node.data.region.start.exact.strip():
        return node.data.region.start.exact.strip().splitlines()[0][:TITLE_CHARS]
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


def export_markdown(doc: SourceDocument, board: Board, notes: dict[str, str], pdf: pymupdf.Document, tags: list[str],
                    order: ExportOrder = "paper") -> str:
    """The literature note. `order="template"` (addendum 6.1, D19) is the
    export task's; until it lands every export is in paper order."""
    nodes = {n.id: n for n in board.nodes}
    notes_for: dict[str, list[str]] = {}

    def link_note(owner: str, note_id: str) -> None:
        linked = notes_for.setdefault(owner, [])
        if note_id not in linked:
            linked.append(note_id)

    # A note belongs to whatever it is connected to, a highlight or a node, in
    # either direction; nothing caches it (addendum 4.0, D7).
    for edge in board.edges:
        for end, other in ((edge.from_, edge.to), (edge.to, edge.from_)):
            if isinstance(nodes.get(other), NoteNode):
                link_note(end, other)
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
    pieces = sorted((n for n in board.nodes if isinstance(n, (ChunkNode, FigureNode))),
                     key=lambda n: _order_key(doc, n))
    for node in pieces:
        # A mark inside overlapping chunks is printed once, under the first in paper order.
        marks = sorted((h for h in highlights_in(board, node) if h.id not in placed),
                       key=lambda h: _mark_key(doc, h))
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
        for h in sorted(loose, key=lambda h: _mark_key(doc, h)):
            out += [f"> {h.anchor.quote.exact.strip()}  (page {h.anchor.rects[0].page + 1})"]
            out += note_lines(h.id)
            out += [""]

    remaining = [n for n in board.nodes if isinstance(n, NoteNode) and n.id not in used_notes
                 and _wanted(tags, n.data.tags) and notes.get(n.id, "").strip()]
    if remaining:
        out += ["## Notes", ""]
        for n in remaining:
            out += [notes[n.id].strip(), ""]

    return "\n".join(out).rstrip() + "\n"
