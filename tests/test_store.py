import os

import pytest

from paperboard.board_model import Board, NoteNode, PRESET_TAGS
from paperboard.store import PaperNotFound, Store, VersionConflict, atomic_write
from conftest import FIXTURES


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


def test_write_board_with_no_expected_version_is_refused(store_root):
    store = Store(store_root)
    paper_id = store.list_papers()[0].paper_id
    with pytest.raises(VersionConflict):
        store.write_board(paper_id, Board(paper_id=paper_id), expected_version=None)


def test_notes_round_trip_with_front_matter(store_root):
    store = Store(store_root)
    paper_id = store.list_papers()[0].paper_id
    store.write_note(paper_id, "n-01", "Multi-head attention is *h* attentions.\n")
    raw = (store.paper_dir(paper_id) / "notes" / "n-01.md").read_text()
    assert raw.startswith("---\nid: n-01\n---\n")
    assert store.read_note(paper_id, "n-01") == "Multi-head attention is *h* attentions.\n"


def test_tags_default_to_presets_and_persist(store_root):
    store = Store(store_root)
    assert [t.name for t in store.read_tags().tags] == [t.name for t in PRESET_TAGS]
    tags = store.read_tags()
    tags.tags[0].name = "gap"
    store.write_tags(tags)
    assert store.read_tags().tags[0].name == "gap"


def test_add_paper_extracts_and_lays_out_the_folder(tmp_path):
    store = Store(tmp_path)
    doc = store.add_paper(FIXTURES["resnet"].read_bytes())
    folder = tmp_path / "papers" / doc.paper_id
    assert (folder / "paper.pdf").exists() and (folder / "source.json").exists()
    assert store.read_source(doc.paper_id).paper_id == doc.paper_id
    # adding the same PDF again is idempotent: same id, one folder
    assert store.add_paper(FIXTURES["resnet"].read_bytes()).paper_id == doc.paper_id
    assert len(list((tmp_path / "papers").iterdir())) == 1


def test_clip_is_written_under_clips_and_referenced_relatively(store_root):
    store = Store(store_root)
    paper_id = store.list_papers()[0].paper_id
    rel = store.write_clip(paper_id, "n-fig", b"\x89PNG\r\n\x1a\nfake")
    assert rel == "clips/n-fig.png"
    assert (store.paper_dir(paper_id) / rel).read_bytes().startswith(b"\x89PNG")
