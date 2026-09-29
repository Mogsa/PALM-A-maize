"""Schema 1 to schema 2, one step of SPEC-ADDENDUM.md section 4.6 at a time,
each against a hand-written schema 1 board."""

import copy

import pymupdf
import pytest
from conftest import FIXTURES

from paperboard.blocks import chunk_blocks
from paperboard.board_model import Board
from paperboard.migrate import migrate_board, split_view
from paperboard.source_model import PageRect

QUOTE = {"exact": "x", "prefix": "", "suffix": ""}
V1_ANCHOR = {"page": 2, "rect": [60.0, 100.0, 280.0, 130.0], "quote": QUOTE, "position": 7, "state": "relocated"}


@pytest.fixture(scope="module")
def resnet(extracted):
    pdf = pymupdf.open(FIXTURES["resnet"])
    yield extracted["resnet"], pdf
    pdf.close()


def _region(page=2, rect=(60.0, 90.0, 290.0, 300.0)):
    return {"rects": [{"page": page, "rect": list(rect)}], "start": QUOTE, "end": QUOTE, "position": 0, "state": "anchored"}


def _chunk(id="n-c", text="old text", region=None):
    return {"id": id, "type": "chunk", "position": {"x": 0, "y": 0},
            "data": {"tags": [], "collapsed": False, "region": region or _region(), "text": text, "user_sized": False}}


def _note(id="n-n"):
    return {"id": id, "type": "note", "position": {"x": 0, "y": 0}, "data": {"tags": [], "collapsed": False, "note": f"notes/{id}.md"}}


def _highlight(id="h-1", note=None):
    return {"id": id, "tags": [], "note": note, "anchor": dict(V1_ANCHOR)}


def _v1(nodes=(), edges=(), highlights=()):
    return {"schema": 1, "paper_id": "p", "version": 4, "goal": "g", "active_tags": [],
            "viewport": {"x": 0, "y": 0, "zoom": 1}, "anchor_basis": "abc",
            "nodes": list(nodes), "edges": list(edges), "highlights": list(highlights)}


def _migrate(raw, resnet):
    doc, pdf = resnet
    return migrate_board(raw, doc, pdf)


# -- step 1: highlights ------------------------------------------------------

def test_a_highlight_anchors_page_and_rect_become_one_line_rect(resnet):
    out = _migrate(_v1(highlights=[_highlight()]), resnet)
    assert out["highlights"] == [{"id": "h-1", "tags": [], "anchor": {
        "rects": [{"page": 2, "rect": [60.0, 100.0, 280.0, 130.0]}], "quote": QUOTE, "position": 7, "state": "relocated"}}]


# -- step 2: edges ------------------------------------------------------------

@pytest.mark.parametrize("edge, ends", [
    ({"source": "n-c", "sourceHandle": "h-1", "target": "n-n"}, ("h-1", "n-n")),
    ({"source": "n-n", "target": "n-c", "targetHandle": "h-1"}, ("n-n", "h-1")),
    ({"source": "n-c", "sourceHandle": "n-c-out", "target": "n-n", "targetHandle": "n-n-in"}, ("n-c", "n-n")),
    ({"source": "n-c", "target": "n-n"}, ("n-c", "n-n")),
    ({"source": "n-c", "sourceHandle": None, "target": "n-n", "targetHandle": None, "type": "default"}, ("n-c", "n-n")),
], ids=["highlight source handle", "highlight target handle", "node handles", "no handles", "null handles and a type"])
def test_an_edge_keeps_its_ends_by_what_they_are(resnet, edge, ends):
    raw = _v1(nodes=[_chunk(), _note()], edges=[{"id": "e-1", **edge, "data": {"tags": ["t-supports"]}}],
              highlights=[_highlight()])
    out = _migrate(raw, resnet)
    assert out["edges"] == [{"id": "e-1", "from": ends[0], "to": ends[1], "data": {"tags": ["t-supports"]}}]


def test_an_edge_with_no_data_gains_empty_tags(resnet):
    out = _migrate(_v1(nodes=[_note("n-a"), _note("n-b")], edges=[{"id": "e-1", "source": "n-a", "target": "n-b"}]), resnet)
    assert out["edges"] == [{"id": "e-1", "from": "n-a", "to": "n-b", "data": {"tags": []}}]


# -- step 3: the note cache -----------------------------------------------------

@pytest.mark.parametrize("nodes, edges, note, added", [
    ([_note()], [], "n-n", [{"id": "e-01J8Z3S", "from": "h-01J8Z3S", "to": "n-n", "data": {"tags": []}}]),
    ([_chunk(), _note()], [{"id": "e-1", "source": "n-c", "sourceHandle": "h-01J8Z3S", "target": "n-n"}], "n-n", []),
    ([_chunk(), _note()], [{"id": "e-1", "source": "n-n", "target": "n-c", "targetHandle": "h-01J8Z3S"}], "n-n", []),
    ([_note()], [], "n-gone", []),
    ([_chunk()], [], "n-c", []),
    ([_note()], [], None, []),
], ids=["cache with no edge gains one", "an edge already carries it", "an edge the other way carries it",
        "a deleted note is dropped", "a node that is not a note is dropped", "no cache"])
def test_the_note_cache_becomes_an_edge_only_where_none_exists(resnet, nodes, edges, note, added):
    raw = _v1(nodes=nodes, edges=edges, highlights=[_highlight("h-01J8Z3S", note=note)])
    out = _migrate(raw, resnet)
    before = [e["id"] for e in edges]
    assert [e for e in out["edges"] if e["id"] not in before] == added
    assert "note" not in out["highlights"][0]


# -- step 4: chunks -------------------------------------------------------------

def test_a_chunks_text_becomes_blocks_derived_from_its_region(resnet):
    doc, pdf = resnet
    region = next(r for r in doc.regions if r.page == 2 and r.label == "text")
    out = _migrate(_v1(nodes=[_chunk(region=_region(2, region.rect))]), resnet)
    data = out["nodes"][0]["data"]
    assert "text" not in data
    expected = chunk_blocks(doc, pdf, [PageRect(page=2, rect=region.rect)])
    assert expected and data["blocks"] == [b.model_dump() for b in expected]


# -- step 5: notes ----------------------------------------------------------------

def test_every_note_was_the_readers_own(resnet):
    out = _migrate(_v1(nodes=[_note("n-a"), _note("n-b")]), resnet)
    assert [n["data"]["origin"] for n in out["nodes"]] == ["reader", "reader"]


# -- step 6: top level ----------------------------------------------------------------

def test_the_top_level_becomes_schema_2(resnet):
    out = _migrate(_v1(), resnet)
    assert out["schema"] == 2
    assert (out["version"], out["goal"], out["anchor_basis"]) == (4, "g", "abc")


# -- view state moves out of the board --------------------------------------------

def test_split_view_takes_a_schema_1_boards_view_keys(resnet):
    board, view = split_view(_migrate(_v1(), resnet))
    assert view == {"active_tags": [], "viewport": {"x": 0, "y": 0, "zoom": 1}}
    assert not {"view", "paper_scroll", "active_tags", "viewport"} & board.keys()
    Board.model_validate(board)


def test_split_view_takes_a_schema_2_boards_view_keys():
    raw = {"schema": 2, "paper_id": "p", "view": "board", "paper_scroll": {"page": 1, "y": 3.0},
           "active_tags": ["t-x"], "viewport": {"x": 1, "y": 2, "zoom": 3}}
    board, view = split_view(raw)
    assert board == {"schema": 2, "paper_id": "p"}
    assert view == {"view": "board", "paper_scroll": {"page": 1, "y": 3.0},
                    "active_tags": ["t-x"], "viewport": {"x": 1, "y": 2, "zoom": 3}}
    assert "view" in raw   # pure: the input is untouched


def test_split_view_of_a_board_without_view_keys_is_empty():
    assert split_view({"schema": 2, "paper_id": "p"}) == ({"schema": 2, "paper_id": "p"}, {})


# -- the whole ---------------------------------------------------------------------

def _full_v1():
    group = {"id": "n-g", "type": "group", "position": {"x": 0, "y": 0}, "width": 600, "height": 400, "data": {"tags": [], "name": "pile"}}
    figure = {"id": "n-f", "type": "figure", "position": {"x": 0, "y": 0},
              "data": {"tags": [], "collapsed": False, "region": _region(), "caption": "Figure 1"}}
    chunk = {**_chunk(), "parentId": "n-g"}
    return _v1(nodes=[group, chunk, figure, _note()],
               edges=[{"id": "e-1", "source": "n-c", "sourceHandle": "h-1", "target": "n-n", "type": "default"}],
               highlights=[_highlight("h-1", note="n-n"), _highlight("h-2", note="n-n")])


def test_a_migrated_board_is_a_valid_schema_2_board(resnet):
    board = Board.model_validate(_migrate(_full_v1(), resnet))
    assert board.schema_version == 2
    assert [(e.from_, e.to) for e in board.edges] == [("h-1", "n-n"), ("h-2", "n-n")]


def test_migration_is_pure_and_changes_nothing_on_a_schema_2_board(resnet):
    raw = _full_v1()
    kept = copy.deepcopy(raw)
    once = _migrate(raw, resnet)
    assert raw == kept
    assert _migrate(copy.deepcopy(once), resnet) == once
