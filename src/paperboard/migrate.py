"""Board schema 1 to schema 2 (SPEC-ADDENDUM.md section 4.6).

A pure function of the board, the source and the PDF, run by the store on load
before re-anchoring. It works on the raw JSON, because a schema 1 board is not a
valid `Board`. The client never sees schema 1; the file on disk becomes schema 2
on the next accepted write.
"""

import copy

import pymupdf

from paperboard.blocks import chunk_blocks
from paperboard.board_model import BOARD_SCHEMA_VERSION, VIEW_KEYS
from paperboard.source_model import PageRect, SourceDocument

V1 = 1


def is_v1(raw: dict) -> bool:
    """A board file with no `schema` predates the field and is schema 1."""
    return raw.get("schema", V1) == V1


def migrate_board(raw: dict, doc: SourceDocument, pdf: pymupdf.Document) -> dict:
    """The schema 2 form of `raw`. A board already at schema 2 comes back as it is."""
    if not is_v1(raw):
        return raw
    board = copy.deepcopy(raw)
    highlight_ids = {h["id"] for h in board.get("highlights", [])}
    board["highlights"] = [_highlight(h) for h in board.get("highlights", [])]       # step 1
    board["edges"] = [_edge(e, highlight_ids) for e in board.get("edges", [])]       # step 2
    board["edges"] += _cache_edges(raw, board["edges"])                              # step 3
    board["nodes"] = [_node(n, doc, pdf) for n in board.get("nodes", [])]           # steps 4, 5
    board["schema"] = BOARD_SCHEMA_VERSION                                           # step 6
    return board


def split_view(raw: dict) -> tuple[dict, dict]:
    """The board without its view keys, and those keys. View state moved from
    board.json to view.json with no schema bump, so a board of either schema may
    still carry them; the store seeds view.json from them once."""
    board = {k: v for k, v in raw.items() if k not in VIEW_KEYS}
    view = {k: v for k, v in raw.items() if k in VIEW_KEYS}
    return board, view


def _highlight(highlight: dict) -> dict:
    """`anchor.page` and `anchor.rect` become one line rect, kept as drawn. `note` goes."""
    anchor = dict(highlight["anchor"])
    rect = {"page": anchor.pop("page"), "rect": anchor.pop("rect")}
    out = {k: v for k, v in highlight.items() if k != "note"}
    out["anchor"] = {"rects": [rect], **anchor}
    return out


def _edge(edge: dict, highlight_ids: set[str]) -> dict:
    """A handle names an end only when it is a highlight; any other handle, such
    as a node's own `${id}-in`, falls back to the node."""
    def end(node: str, handle: str | None) -> str:
        return handle if handle in highlight_ids else node

    return {"id": edge["id"],
            "from": end(edge["source"], edge.get("sourceHandle")),
            "to": end(edge["target"], edge.get("targetHandle")),
            "data": edge.get("data") or {"tags": []}}


def _cache_edges(raw: dict, edges: list[dict]) -> list[dict]:
    """An edge for each `highlights[].note` naming an existing note node that no
    edge already connects to that highlight, in either direction. Its id is
    derived from the highlight's, so the migration stays pure (addendum 4.6)."""
    notes = {n["id"] for n in raw.get("nodes", []) if n.get("type") == "note"}
    connected = {frozenset((e["from"], e["to"])) for e in edges}
    added = []
    for highlight in raw.get("highlights", []):
        note = highlight.get("note")
        if note in notes and frozenset((highlight["id"], note)) not in connected:
            added.append({"id": "e-" + highlight["id"].removeprefix("h-"), "from": highlight["id"],
                          "to": note, "data": {"tags": []}})
    return added


def _node(node: dict, doc: SourceDocument, pdf: pymupdf.Document) -> dict:
    """A chunk's `text` becomes blocks derived from its region; a note gains `origin`."""
    data = node.get("data", {})
    if node.get("type") == "chunk":
        data.pop("text", None)
        rects = [PageRect.model_validate(r) for r in data["region"]["rects"]]
        data["blocks"] = [b.model_dump() for b in chunk_blocks(doc, pdf, rects)]
    elif node.get("type") == "note":
        data["origin"] = "reader"
    return node
