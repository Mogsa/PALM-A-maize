import contextlib
import json
import os
import threading

import pytest
from conftest import FIXTURES

from paperboard.board_model import DEFAULT_SLOTS, PRESET_TAGS, Board, NoteNode, ViewState
from paperboard.store import (
    NodeNotFound,
    NoteNotFound,
    PaperNotFound,
    Store,
    VersionConflict,
    atomic_write,
)

NOTE = "n-01J8Z3QABCDEFGHJKMNPQRSTVW"   # a node id as the client mints it (addendum 4.5)
FIG = "n-01J8Z3QABCDEFGHJKMNPQRSTVX"
BARRIER_SECONDS = 1.0  # how long one board write waits for the other to have read


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


@pytest.fixture
def paper_at_the_root(store_root):
    """A paper's files at the store root itself, so `..` from papers/ would find one."""
    folder = next((store_root / "papers").iterdir())
    for name in ("source.json", "paper.pdf"):
        (store_root / name).write_bytes((folder / name).read_bytes())
    return store_root


@pytest.mark.parametrize("paper_id", ["..", "../papers", "a/b", "a\\b", "x..y", "Upper", "-lead", ".hidden", ""])
def test_a_paper_id_no_extraction_could_make_is_not_found(paper_at_the_root, paper_id):
    store = Store(paper_at_the_root)
    with pytest.raises(PaperNotFound):
        store.read_source(paper_id)
    with pytest.raises(PaperNotFound):
        store.write_note(paper_id, NOTE, "x")
    assert not (paper_at_the_root / "notes").exists()


def test_every_fixture_paper_id_is_valid(store_root):
    assert len(Store(store_root).list_papers()) == 3


def test_a_folder_with_an_invalid_name_is_not_listed(store_root):
    folder = next((store_root / "papers").iterdir())
    (store_root / "papers" / "Not A Paper").mkdir()
    (store_root / "papers" / "Not A Paper" / "source.json").write_bytes((folder / "source.json").read_bytes())
    assert "Not A Paper" not in [p.paper_id for p in Store(store_root).list_papers()]


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


def test_two_writes_of_the_same_version_at_once_let_exactly_one_through(store_root):
    """FastAPI runs sync routes in a thread pool, so two tabs' PUTs can arrive
    together. Each write's read of the current version waits (up to a timeout)
    for the other write to read too: without a lock both read version 0 and
    both succeed; with one, the second cannot read until the first has
    written, so the wait times out and the second sees version 1."""
    store = Store(store_root)
    paper_id = store.list_papers()[0].paper_id
    both_read = threading.Barrier(2, timeout=BARRIER_SECONDS)
    real_read = store.read_board

    def read_then_wait(pid):
        board = real_read(pid)
        with contextlib.suppress(threading.BrokenBarrierError):
            both_read.wait()
        return board

    store.read_board = read_then_wait
    outcomes = []

    def write():
        try:
            outcomes.append(store.write_board(paper_id, Board(paper_id=paper_id), expected_version=0))
        except VersionConflict as conflict:
            outcomes.append(f"conflict at {conflict.current}")

    threads = [threading.Thread(target=write) for _ in range(2)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert sorted(outcomes, key=str) == [1, "conflict at 1"]


def test_write_board_with_no_expected_version_is_refused(store_root):
    store = Store(store_root)
    paper_id = store.list_papers()[0].paper_id
    with pytest.raises(VersionConflict):
        store.write_board(paper_id, Board(paper_id=paper_id), expected_version=None)


def test_notes_round_trip_with_front_matter(store_root):
    store = Store(store_root)
    paper_id = store.list_papers()[0].paper_id
    store.write_note(paper_id, NOTE, "Multi-head attention is *h* attentions.\n")
    raw = (store.paper_dir(paper_id) / "notes" / f"{NOTE}.md").read_text()
    assert raw.startswith(f"---\nid: {NOTE}\n---\n")
    assert store.read_note(paper_id, NOTE) == "Multi-head attention is *h* attentions.\n"


def test_a_malformed_node_id_never_reaches_a_filename(store_root):
    store = Store(store_root)
    paper_id = store.list_papers()[0].paper_id
    with pytest.raises(NodeNotFound):
        store.write_note(paper_id, f"{NOTE}\nid: forged", "x")
    with pytest.raises(NodeNotFound):
        store.write_clip(paper_id, "n-../../escape", b"png")
    with pytest.raises(NoteNotFound):
        store.read_note(paper_id, "n-../../escape")
    assert not (store.paper_dir(paper_id) / "notes").exists()


def test_tags_default_to_presets_and_persist(store_root):
    store = Store(store_root)
    assert [t.name for t in store.read_tags().tags] == [t.name for t in PRESET_TAGS]
    tags = store.read_tags()
    tags.tags[0].name = "gap"
    store.write_tags(tags)
    assert store.read_tags().tags[0].name == "gap"


def _add(store, pdf_bytes):
    doc = store.extract_pdf(pdf_bytes)
    store.install_paper(doc, pdf_bytes)
    return doc


def test_extract_then_install_lays_out_the_folder(tmp_path):
    store = Store(tmp_path)
    doc = store.extract_pdf(FIXTURES["resnet"].read_bytes())
    assert not store.has_paper(doc.paper_id)          # extraction alone writes nothing
    assert not (tmp_path / "papers").exists()
    store.install_paper(doc, FIXTURES["resnet"].read_bytes())
    folder = tmp_path / "papers" / doc.paper_id
    assert (folder / "paper.pdf").exists() and (folder / "source.json").exists()
    assert store.has_paper(doc.paper_id)
    assert store.read_source(doc.paper_id).paper_id == doc.paper_id
    # adding the same PDF again is idempotent: same id, one folder
    assert _add(store, FIXTURES["resnet"].read_bytes()).paper_id == doc.paper_id
    assert len(list((tmp_path / "papers").iterdir())) == 1


def test_re_adding_a_newer_version_replaces_the_pdf_with_its_source(tmp_path, monkeypatch, extracted):
    """arXiv v1 and v2 share a paper id (the id carries no version). The folder
    must not end up holding the old PDF beside the new version's source.json."""
    import paperboard.store as store_module

    monkeypatch.setattr(store_module, "extract", lambda _path: extracted["resnet"])
    store = Store(tmp_path)
    v1 = FIXTURES["resnet"].read_bytes()
    v2 = v1 + b"\n% revised\n"
    paper_id = _add(store, v1).paper_id
    assert _add(store, v2).paper_id == paper_id
    assert store.pdf_path(paper_id).read_bytes() == v2


def test_the_folder_name_is_the_paper_id(store_root, extracted):
    """A re-extraction whose extractor names the paper differently (a changed
    title slug) must not change the id: the board lives in the folder."""
    store = Store(store_root)
    paper_id = extracted["resnet"].paper_id
    store.write_source(paper_id, extracted["resnet"].model_copy(update={"paper_id": "renamed"}))
    assert store.read_source(paper_id).paper_id == paper_id

    path = store.paper_dir(paper_id) / "source.json"
    path.write_text(path.read_text().replace(f'"{paper_id}"', '"hand-edited"'))
    assert paper_id in [p.paper_id for p in store.list_papers()]


def test_clip_is_written_under_clips_and_referenced_relatively(store_root):
    store = Store(store_root)
    paper_id = store.list_papers()[0].paper_id
    rel = store.write_clip(paper_id, FIG, b"\x89PNG\r\n\x1a\nfake")
    assert rel == f"clips/{FIG}.png"
    assert (store.paper_dir(paper_id) / rel).read_bytes().startswith(b"\x89PNG")


V1_BOARD = {
    "schema": 1, "paper_id": "p", "version": 3, "goal": "", "active_tags": [], "viewport": {"x": 0, "y": 0, "zoom": 1},
    "nodes": [{"id": "n-n", "type": "note", "position": {"x": 0, "y": 0},
               "data": {"tags": [], "collapsed": False, "note": "notes/n-n.md"}}],
    "edges": [],
    "highlights": [{"id": "h-1", "tags": [], "note": "n-n", "anchor": {
        "page": 2, "rect": [60.0, 100.0, 280.0, 130.0], "quote": {"exact": "x", "prefix": "", "suffix": ""},
        "position": 0, "state": "anchored"}}],
}


def _write_v1(store, paper_id):
    path = store.paper_dir(paper_id) / "board.json"
    path.write_text(json.dumps({**V1_BOARD, "paper_id": paper_id}))
    return path


def test_a_schema_1_board_on_disk_is_read_as_schema_2_and_not_written(store_root):
    store = Store(store_root)
    paper_id = store.list_papers()[0].paper_id
    path = _write_v1(store, paper_id)
    before = path.read_bytes()
    board = store.read_board(paper_id)
    assert board.schema_version == 2 and board.version == 3
    assert board.highlights[0].anchor.rects[0].page == 2
    assert [(e.from_, e.to) for e in board.edges] == [("h-1", "n-n")]
    assert path.read_bytes() == before


def test_the_first_write_over_a_schema_1_board_keeps_one_copy_of_it(store_root):
    store = Store(store_root)
    paper_id = store.list_papers()[0].paper_id
    path = _write_v1(store, paper_id)
    original = path.read_bytes()
    copy = store.paper_dir(paper_id) / "board.v1.json"
    board = store.read_board(paper_id)
    assert not copy.exists()
    assert store.write_board(paper_id, board, expected_version=3) == 4
    assert copy.read_bytes() == original
    assert json.loads(path.read_text())["schema"] == 2
    assert store.write_board(paper_id, store.read_board(paper_id), expected_version=4) == 5
    assert copy.read_bytes() == original


def test_a_missing_view_file_reads_as_the_defaults(store_root):
    store = Store(store_root)
    paper_id = store.list_papers()[0].paper_id
    assert store.read_view(paper_id) == ViewState()


def test_a_view_is_written_to_its_own_file_and_read_back(store_root):
    store = Store(store_root)
    paper_id = store.list_papers()[0].paper_id
    view = ViewState(view="both", split=0.6, active_tags=["t-question"])
    store.write_view(paper_id, view)
    assert (store.paper_dir(paper_id) / "view.json").exists()
    assert store.read_view(paper_id) == view


def test_a_view_file_from_before_the_activity_log_reads_with_the_log_on(store_root):
    store = Store(store_root)
    paper_id = store.list_papers()[0].paper_id
    (store.paper_dir(paper_id) / "view.json").write_text(json.dumps({"view": "both", "ai": True}))
    view = store.read_view(paper_id)
    assert (view.view, view.ai, view.log) == ("both", True, True)


def test_a_view_for_an_unknown_paper_is_refused(store_root):
    with pytest.raises(PaperNotFound):
        Store(store_root).read_view("no-such-paper")
    with pytest.raises(PaperNotFound):
        Store(store_root).write_view("no-such-paper", ViewState())


def test_reading_a_board_with_view_keys_seeds_the_view_file(store_root):
    store = Store(store_root)
    paper_id = store.list_papers()[0].paper_id
    raw = {"schema": 2, "paper_id": paper_id, "version": 5, "view": "board",
           "paper_scroll": {"page": 2, "y": 10.0}, "active_tags": ["t-term"], "viewport": {"x": 1, "y": 2, "zoom": 3}}
    (store.paper_dir(paper_id) / "board.json").write_text(json.dumps(raw))
    assert store.read_board(paper_id).version == 5
    view = store.read_view(paper_id)
    assert (view.view, view.paper_scroll.page, view.active_tags, view.viewport.zoom) == ("board", 2, ["t-term"], 3)


def test_reading_a_board_with_view_keys_keeps_an_existing_view_file(store_root):
    store = Store(store_root)
    paper_id = store.list_papers()[0].paper_id
    store.write_view(paper_id, ViewState(view="both"))
    raw = {"schema": 2, "paper_id": paper_id, "version": 1, "view": "board"}
    (store.paper_dir(paper_id) / "board.json").write_text(json.dumps(raw))
    store.read_board(paper_id)
    assert store.read_view(paper_id).view == "both"


def test_a_schema_1_boards_view_keys_seed_the_view_file(store_root):
    store = Store(store_root)
    paper_id = store.list_papers()[0].paper_id
    _write_v1(store, paper_id)
    store.read_board(paper_id)
    assert store.read_view(paper_id).viewport.zoom == 1


def test_a_schema_2_board_never_gets_a_v1_copy(store_root):
    store = Store(store_root)
    paper_id = store.list_papers()[0].paper_id
    store.write_board(paper_id, Board(paper_id=paper_id), expected_version=0)
    store.write_board(paper_id, store.read_board(paper_id), expected_version=1)
    assert not (store.paper_dir(paper_id) / "board.v1.json").exists()


def test_template_defaults_to_the_nine_slots_and_persists(store_root):
    store = Store(store_root)
    assert store.read_template().slots == DEFAULT_SLOTS
    assert not (store_root / "template.json").exists()
    template = store.read_template()
    template.slots = template.slots[:2]
    store.write_template(template)
    assert [s.name for s in store.read_template().slots] == ["Background", "Problem"]
    assert json.loads((store_root / "template.json").read_text())["schema"] == 1


def test_view_ai_is_off_by_default_and_round_trips(store_root):
    store = Store(store_root)
    paper_id = store.list_papers()[0].paper_id
    assert store.read_view(paper_id).ai is False
    store.write_view(paper_id, ViewState(ai=True))
    assert store.read_view(paper_id).ai is True


def test_a_view_json_written_before_ai_reads_as_off(store_root):
    store = Store(store_root)
    paper_id = store.list_papers()[0].paper_id
    (store.paper_dir(paper_id) / "view.json").write_text('{"view": "both"}')
    assert store.read_view(paper_id).ai is False
