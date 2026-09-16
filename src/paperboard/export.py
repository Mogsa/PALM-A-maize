"""The board as one Markdown file in the paper's order. SPEC.md section 6: this
is the literature note, and nothing else is ever written by hand."""

import pymupdf

from paperboard.board_model import Board, ChunkNode, FigureNode, Highlight, NoteNode
from paperboard.geometry import contains_point, midpoint, normalise
from paperboard.source_model import SourceDocument

TITLE_CHARS = 80


def highlights_in(board: Board, node: ChunkNode | FigureNode) -> list[Highlight]:
    """Every highlight whose rect midpoint lies inside one of the node's rects.
    Nothing stores the relation (addendum 4.0)."""
    out = []
    for h in board.highlights:
        point = midpoint(h.anchor.rect)
        if any(r.page == h.anchor.page and contains_point(r.rect, *point) for r in node.data.region.rects):
            out.append(h)
    return out


def _wanted(tags: list[str], have: list[str]) -> bool:
    return not tags or bool(set(tags) & set(have))


def _title(node: ChunkNode | FigureNode) -> str:
    if isinstance(node, FigureNode):
        return node.data.caption.split(":")[0].split(".")[0].strip() or node.id
    first = node.data.region.start.exact.strip().splitlines()[0] if node.data.region.start.exact.strip() else node.data.text.strip()[:TITLE_CHARS]
    return first[:TITLE_CHARS]


def _region_index(doc: SourceDocument, page: int, rect) -> int | None:
    """Index in `doc.regions` of the first layout region on `page` whose
    midpoint lies inside `rect`. `doc.regions` is stored in extraction order,
    which is reading order (the same assumption anchoring's `_regions_between`
    makes), so this index doubles as a reading-order position."""
    for i, region in enumerate(doc.regions):
        if region.page == page and contains_point(rect, *midpoint(region.rect)):
            return i
    return None


def _order_key(doc: SourceDocument, node: ChunkNode | FigureNode):
    """Reading order, not board position, not `(page, y0, x0)` (ruling R1).

    On ResNet page 0, the `1. Introduction` heading sits at y0 536 in the
    left column while Figure 1 sits at y0 220 in the right column: sorting by
    `(page, y0, x0)` would put the figure first, but SPEC.md section 6 wants
    "the paper's own order" and the introduction reads before the figure.
    Instead, order by where the node's first rect falls among the page's
    layout regions, which are stored in reading order. A rect that matches no
    region midpoint (its own midpoint may fall in a gap, e.g. a figure clip
    that isn't itself a layout region) sorts after the matched nodes on its
    page, by `(y0, x0)`.
    """
    first = node.data.region.rects[0]
    idx = _region_index(doc, first.page, first.rect)
    x0, y0, _x1, _y1 = normalise(first.rect)
    return (first.page, idx if idx is not None else float("inf"), y0, x0)


def export_markdown(doc: SourceDocument, board: Board, notes: dict[str, str], pdf: pymupdf.Document, tags: list[str]) -> str:
    nodes = {n.id: n for n in board.nodes}
    notes_for: dict[str, list[str]] = {}

    def link_note(owner: str, note_id: str) -> None:
        linked = notes_for.setdefault(owner, [])
        if note_id not in linked:
            linked.append(note_id)

    for edge in board.edges:
        for a, handle, b in ((edge.source, edge.sourceHandle, edge.target), (edge.target, edge.targetHandle, edge.source)):
            other = nodes.get(b)
            if isinstance(other, NoteNode):
                link_note(handle or a, other.id)
    for h in board.highlights:
        # `Highlight.note` is a cache of the edge's note id (addendum 4.0); a
        # highlight can carry it with no matching edge, so it must be
        # consulted directly too, not only reached by walking `board.edges`.
        if h.note is not None:
            link_note(h.id, h.note)
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
