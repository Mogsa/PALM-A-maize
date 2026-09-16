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
