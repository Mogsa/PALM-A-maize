import json

import pytest
from pydantic import ValidationError

from paperboard.board_model import (
    BOARD_SCHEMA_VERSION,
    DEFAULT_SLOTS,
    PRESET_TAGS,
    TAGS_SCHEMA_VERSION,
    Board,
    ChunkAnchor,
    ChunkNode,
    Edge,
    FigureNode,
    GroupNode,
    Highlight,
    HighlightAnchor,
    NoteNode,
    QuoteSelector,
    TagFile,
    TemplateFile,
    dump_board,
)

ANCHOR = HighlightAnchor(
    rects=[{"page": 2, "rect": (108.0, 280.0, 504.0, 291.0)}, {"page": 2, "rect": (108.0, 292.0, 390.0, 303.0)}],
    quote=QuoteSelector(exact="Attention mechanisms", prefix="however, ", suffix=" have"),
)
REGION = ChunkAnchor(
    rects=[{"page": 2, "rect": (108.0, 280.0, 504.0, 720.0)}],
    start=QuoteSelector(exact="The Transformer"), end=QuoteSelector(exact="section 3.2."),
)
BLOCKS = [
    {"kind": "text", "page": 2, "rect": (108.0, 280.0, 504.0, 400.0), "text": "The Transformer ..."},
    {"kind": "clip", "page": 2, "rect": (215.0, 410.0, 396.0, 430.0), "label": "formula"},
]


def _group(id="n-g", **data):
    return GroupNode(id=id, type="group", position={"x": 0, "y": 0}, width=600, height=400,
                     data={"tags": [], "name": "pile", **data})


def _chunk(id="n-c", parent=None):
    node = {"id": id, "type": "chunk", "position": {"x": 24, "y": 40}, "width": 320,
            "data": {"tags": ["t-claim"], "collapsed": False, "region": REGION.model_dump(),
                     "blocks": BLOCKS, "user_sized": True}}
    if parent:
        node["parentId"] = parent
        node["extent"] = "parent"
    return ChunkNode.model_validate(node)


def _note(id="n-n", **data):
    return NoteNode(id=id, type="note", position={"x": 900, "y": 40}, initialWidth=280,
                    data={"tags": [], "collapsed": False, "note": f"notes/{id}.md", **data})


def _highlight(id="h-1"):
    return Highlight(id=id, tags=["t-question"], anchor=ANCHOR)


def test_the_board_and_tags_schemas_are_numbered_independently():
    assert BOARD_SCHEMA_VERSION == 2
    assert TAGS_SCHEMA_VERSION == 1
    assert Board(paper_id="p").schema_version == 2
    assert TagFile().schema_version == 1


def test_a_schema_1_board_is_rejected():
    with pytest.raises(ValidationError):
        Board.model_validate({"schema": 1, "paper_id": "p"})


def test_runtime_fields_are_rejected():
    with pytest.raises(ValidationError):
        ChunkNode.model_validate({**_chunk().model_dump(), "selected": True})
    with pytest.raises(ValidationError):
        ChunkNode.model_validate({**_chunk().model_dump(), "measured": {"width": 1, "height": 1}})


def test_ids_must_carry_their_prefix():
    with pytest.raises(ValidationError):
        _note(id="note-1")
    with pytest.raises(ValidationError):
        Highlight(id="n-x", tags=[], anchor=ANCHOR)
    with pytest.raises(ValidationError):
        Edge(id="x", **{"from": "n-a", "to": "n-b"}, data={"tags": []})


def test_a_chunk_shows_blocks_not_text():
    blocks = _chunk().data.blocks
    assert [b.kind for b in blocks] == ["text", "clip"]
    assert blocks[0].text.startswith("The Transformer") and blocks[1].label == "formula"
    with pytest.raises(ValidationError):
        ChunkNode.model_validate({**_chunk().model_dump(), "data": {**_chunk().model_dump()["data"], "text": "old"}})


def test_a_clip_block_may_have_no_label_and_a_block_needs_a_known_kind():
    node = _chunk().model_dump()
    node["data"]["blocks"] = [{"kind": "clip", "page": 0, "rect": (1.0, 1.0, 2.0, 2.0), "label": None}]
    assert ChunkNode.model_validate(node).data.blocks[0].label is None
    node["data"]["blocks"] = [{"kind": "table", "page": 0, "rect": (1.0, 1.0, 2.0, 2.0)}]
    with pytest.raises(ValidationError):
        ChunkNode.model_validate(node)


def test_a_highlight_has_line_rects_and_no_note():
    assert [r.page for r in _highlight().anchor.rects] == [2, 2]
    with pytest.raises(ValidationError):
        Highlight(id="h-1", tags=[], note="n-n", anchor=ANCHOR)
    with pytest.raises(ValidationError):
        HighlightAnchor(rects=[], quote=QuoteSelector(exact="x"))


def test_a_note_records_who_wrote_it_and_is_reader_by_default():
    assert _note().data.origin == "reader"
    assert _note(origin="ai").data.origin == "ai"
    with pytest.raises(ValidationError):
        _note(origin="someone")
    payload = json.loads(dump_board(Board(paper_id="p", nodes=[_note()])))
    assert payload["nodes"][0]["data"]["origin"] == "reader"


def test_a_note_and_a_figure_can_be_user_sized():
    assert _note(user_sized=True).data.user_sized is True
    figure = FigureNode(id="n-f", type="figure", position={"x": 0, "y": 0},
                        data={"tags": [], "collapsed": False, "region": REGION.model_dump(), "caption": "Figure 1",
                              "user_sized": True})
    assert figure.data.user_sized is True


def test_a_group_may_be_the_tray_or_a_slot_and_says_so_only_when_it_is():
    tray = _group("n-t", tray=True)
    slot = _group("n-s", prompt="What problem is this solving?")
    plain = _group("n-p")
    payload = json.loads(dump_board(Board(paper_id="p", nodes=[tray, slot, plain])))
    datas = [n["data"] for n in payload["nodes"]]
    assert datas[0]["tray"] is True and "prompt" not in datas[0]
    assert datas[1]["prompt"] == "What problem is this solving?" and "tray" not in datas[1]
    assert "tray" not in datas[2] and "prompt" not in datas[2]


def test_view_state_defaults_to_the_paper_at_the_top():
    board = Board(paper_id="p")
    assert board.view == "paper" and board.paper_scroll is None
    board = Board(paper_id="p", view="board", paper_scroll={"page": 3, "y": 212.5})
    assert board.paper_scroll.page == 3 and board.paper_scroll.y == 212.5
    with pytest.raises(ValidationError):
        Board(paper_id="p", view="split")


def test_an_edge_connects_nodes_or_highlights_by_id():
    board = Board(paper_id="p", nodes=[_chunk(), _note()], highlights=[_highlight("h-1"), _highlight("h-2")],
                  edges=[Edge(id="e-1", **{"from": "h-1", "to": "n-n"}),
                         Edge(id="e-2", **{"from": "h-1", "to": "h-2"}),
                         Edge(id="e-3", **{"from": "n-c", "to": "n-n"}, data={"tags": ["t-supports"]})])
    assert [(e.from_, e.to) for e in board.edges] == [("h-1", "n-n"), ("h-1", "h-2"), ("n-c", "n-n")]


@pytest.mark.parametrize("ends", [("n-n", "n-zz"), ("h-zz", "n-n"), ("n-n", "h-zz")])
def test_board_rejects_an_edge_to_something_that_is_not_there(ends):
    with pytest.raises(ValidationError, match="unknown"):
        Board(paper_id="p", nodes=[_note()], highlights=[_highlight()],
              edges=[Edge(id="e-1", **{"from": ends[0], "to": ends[1]})])


def test_an_edge_stores_no_react_flow_fields():
    with pytest.raises(ValidationError):
        Edge.model_validate({"id": "e-1", "from": "n-a", "to": "n-b", "source": "n-a", "target": "n-b"})
    with pytest.raises(ValidationError):
        Edge.model_validate({"id": "e-1", "from": "n-a", "to": "n-b", "type": "default"})


def test_board_rejects_a_child_before_its_parent():
    with pytest.raises(ValidationError, match="before its parent"):
        Board(paper_id="p", nodes=[_chunk(parent="n-g"), _group()])


def test_board_rejects_a_parent_that_is_not_a_group():
    with pytest.raises(ValidationError, match="not a group"):
        Board(paper_id="p", nodes=[_chunk("n-a"), _chunk("n-b", parent="n-a")])


def test_board_rejects_duplicate_ids():
    with pytest.raises(ValidationError, match="duplicate"):
        Board(paper_id="p", nodes=[_note(), _note()])


def test_a_valid_board_round_trips_byte_for_byte():
    board = Board(
        paper_id="p", goal="why", view="board", paper_scroll={"page": 1, "y": 40.0},
        nodes=[_group(tray=True), _chunk(parent="n-g"), _note()],
        edges=[Edge(id="e-1", **{"from": "h-1", "to": "n-n"}, data={"tags": ["t-supports"]})],
        highlights=[_highlight("h-1")],
    )
    text = dump_board(board)
    again = Board.model_validate_json(text)
    assert again == board
    assert dump_board(again) == text
    payload = json.loads(text)
    assert payload["schema"] == 2 and payload["version"] == 0
    assert payload["edges"] == [{"id": "e-1", "from": "h-1", "to": "n-n", "data": {"tags": ["t-supports"]}}]
    assert "selected" not in json.dumps(payload)


def test_empty_board_has_sane_defaults():
    board = Board(paper_id="p")
    assert board.version == 0 and board.nodes == [] and board.highlights == []
    assert board.viewport.zoom == 1


def test_presets_are_the_eleven_from_the_spec():
    assert [t.name for t in PRESET_TAGS] == [
        "problem", "claim", "method", "evidence", "assumption",
        "pass 1", "pass 2", "supports", "contradicts", "question", "term",
    ]
    assert PRESET_TAGS[-1].id == "t-term"   # the client finds a term mark by this id (D27)
    assert TagFile(tags=PRESET_TAGS).tags[0].colour.startswith("#")


def test_the_template_defaults_are_the_nine_slots_of_the_spec():
    template = TemplateFile(slots=DEFAULT_SLOTS)
    assert template.schema_version == 1
    assert [s.name for s in template.slots] == [
        "Background", "Problem", "Prior work & gap", "Main point", "How it works",
        "Evidence", "Limits", "My take", "Open questions",
    ]
    assert template.slots[3].prompt == "In your own words: what is the one thing this paper shows?"
    assert all(s.prompt.endswith("?") for s in template.slots)
