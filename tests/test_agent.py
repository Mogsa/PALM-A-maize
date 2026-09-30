"""Bring your own agent (spec 2026-09-30): the library as a workspace for any AI agent.
Instruction files at the root, paper.md and board.md beside each paper, and the agent's
own notes in papers/<id>/agent/, placed on the board only when the reader chooses."""

import os
import re

import pytest
from conftest import local_client

from paperboard.agent import (
    INSTRUCTION_FILES,
    list_agent_notes,
    mark_placed,
    paper_markdown,
    write_instructions,
)
from paperboard.api import create_app

READER_NOTE = "n-01J8Z3QABCDEFGHJKMNPQRSTVW"
AI_NOTE = "n-01J8Z3QABCDEFGHJKMNPQRSTVX"
AT = {"page": 0, "rect": [60, 300, 280, 320]}


def _board(paper_id: str) -> dict:
    return {
        "paper_id": paper_id,
        "highlights": [{"id": "h-01J8Z3QABCDEFGHJKMNPQRSTVY", "tags": [],
                        "anchor": {"rects": [AT], "quote": {"exact": "degradation problem"}}}],
        "nodes": [
            {"id": READER_NOTE, "type": "note", "position": {"x": 0, "y": 0},
             "data": {"note": f"notes/{READER_NOTE}.md"}},
            {"id": AI_NOTE, "type": "note", "position": {"x": 0, "y": 0},
             "data": {"note": f"notes/{AI_NOTE}.md", "origin": "ai"}},
        ],
        "edges": [{"id": "e-1", "from": "h-01J8Z3QABCDEFGHJKMNPQRSTVY", "to": READER_NOTE, "data": {"tags": []}},
                  {"id": "e-2", "from": "h-01J8Z3QABCDEFGHJKMNPQRSTVY", "to": AI_NOTE, "data": {"tags": []}}],
    }


@pytest.fixture
def client(store_root):
    return local_client(create_app(store_root))


@pytest.fixture
def resnet_id(client):
    return next(p["paper_id"] for p in client.get("/api/papers").json() if "residual" in p["paper_id"])


# -- instruction files ---------------------------------------------------------

def test_instruction_files_are_written_at_the_root_when_the_server_starts(tmp_path):
    create_app(tmp_path)
    assert set(INSTRUCTION_FILES) == {"AGENTS.md", "GEMINI.md", "CLAUDE.md"}
    agents = (tmp_path / "AGENTS.md").read_text()
    assert "papers/<id>/agent/" in agents
    for pointer in ("GEMINI.md", "CLAUDE.md"):
        assert "Read AGENTS.md" in (tmp_path / pointer).read_text()


def test_an_existing_instruction_file_is_never_overwritten(tmp_path):
    (tmp_path / "AGENTS.md").write_text("my own rules\n")
    (tmp_path / "CLAUDE.md").write_text("mine too\n")
    write_instructions(tmp_path)
    write_instructions(tmp_path)
    assert (tmp_path / "AGENTS.md").read_text() == "my own rules\n"
    assert (tmp_path / "CLAUDE.md").read_text() == "mine too\n"
    assert "Read AGENTS.md" in (tmp_path / "GEMINI.md").read_text()


# -- paper.md ------------------------------------------------------------------

def test_paper_md_has_every_section_in_order_with_its_pages(extracted):
    doc = extracted["resnet"]
    markdown = paper_markdown(doc)
    assert markdown.startswith(f"# {doc.sections[0].title}\n")
    headings = [line for line in markdown.splitlines() if re.match(r"#{2,} .* \(pp?\. [0-9–]+\)$", line)]
    assert [h.split(" ", 1)[1].rsplit(" (p", 1)[0] for h in headings] == [s.title for s in doc.sections[1:]]
    places = [markdown.index(f"\n{h}\n") for h in headings]
    assert places == sorted(places)
    assert "## 1. Introduction (pp. 1–2)" in markdown
    assert "### 3.1. Residual Learning (p. 3)" in markdown
    assert "Let us consider H(x) as an underlying mapping" in markdown


def test_paper_md_is_written_for_older_papers_on_start_and_again_on_extraction(store_root, extracted):
    folder = store_root / "papers" / extracted["resnet"].paper_id
    assert not (folder / "paper.md").exists()   # an older paper: the fixture lays out only the PDF and source
    client = local_client(create_app(store_root))
    assert (folder / "paper.md").read_text() == paper_markdown(extracted["resnet"])
    (folder / "paper.md").unlink()
    assert client.post(f"/api/papers/{folder.name}/extract").status_code == 200
    assert (folder / "paper.md").exists()


def test_a_stale_paper_md_is_rewritten_on_start(store_root, extracted):
    folder = store_root / "papers" / extracted["resnet"].paper_id
    (folder / "paper.md").write_text("old")
    old = (folder / "source.json").stat().st_mtime - 100
    os.utime(folder / "paper.md", (old, old))
    create_app(store_root)
    assert (folder / "paper.md").read_text() != "old"


# -- board.md ------------------------------------------------------------------

def test_board_md_is_the_readers_layer_after_a_board_save_and_a_note_save(client, resnet_id, store_root):
    board_md = store_root / "papers" / resnet_id / "board.md"
    assert client.put(f"/api/papers/{resnet_id}/board", json=_board(resnet_id), headers={"If-Match": "0"}).status_code == 200
    text = board_md.read_text()
    assert "> degradation problem" in text
    assert "<!-- id: h-01J8Z3QABCDEFGHJKMNPQRSTVY -->" in text

    client.put(f"/api/papers/{resnet_id}/notes/{READER_NOTE}", json={"markdown": "Why does depth hurt?"})
    client.put(f"/api/papers/{resnet_id}/notes/{AI_NOTE}", json={"markdown": "The model's own note."})
    text = board_md.read_text()
    assert "Why does depth hurt?" in text
    assert f"<!-- id: {READER_NOTE} -->" in text
    assert "The model's own note." not in text and AI_NOTE not in text


# -- agent notes ---------------------------------------------------------------

def _agent_dir(store_root, paper_id):
    folder = store_root / "papers" / paper_id / "agent"
    folder.mkdir(exist_ok=True)
    return folder


def _write(folder, name, text, age):
    path = folder / name
    path.write_text(text)
    when = 1_700_000_000 - age
    os.utime(path, (when, when))


def test_agent_notes_are_listed_newest_first_with_their_front_matter(client, resnet_id, store_root):
    folder = _agent_dir(store_root, resnet_id)
    _write(folder, "old.md", "---\non: h-01ABC   # a comment\ntitle: \"Why lava\"\nmood: calm\n---\nBecause (p. 2, §1).\n", 20)
    _write(folder, "new.md", "Just text.\n", 10)
    _write(folder, "broken.md", "---\nthis is not front matter\n---\nBody.\n", 30)
    _write(folder, "unclosed.md", "---\ntitle: never closed\n", 40)
    _write(folder, "skip.txt", "not a note", 0)
    (folder / "placed").mkdir()
    _write(folder / "placed", "done.md", "placed already", 0)

    notes = client.get(f"/api/papers/{resnet_id}/agent-notes").json()
    assert [n["file"] for n in notes] == ["new.md", "old.md", "broken.md", "unclosed.md"]
    assert notes[0] == {"file": "new.md", "title": None, "on": None, "text": "Just text.\n",
                        "modified": notes[0]["modified"]}
    assert (notes[1]["title"], notes[1]["on"], notes[1]["text"]) == ("Why lava", "h-01ABC", "Because (p. 2, §1).\n")
    assert (notes[2]["title"], notes[2]["on"]) == (None, None)
    assert notes[2]["text"] == "---\nthis is not front matter\n---\nBody.\n"
    assert notes[3]["text"] == "---\ntitle: never closed\n"
    assert notes[0]["modified"] > notes[1]["modified"]


def test_no_agent_folder_is_no_notes(client, resnet_id):
    assert client.get(f"/api/papers/{resnet_id}/agent-notes").json() == []


def test_list_agent_notes_reads_a_bare_folder(tmp_path):
    assert list_agent_notes(tmp_path) == []


def test_placed_moves_the_file_into_placed(client, resnet_id, store_root):
    folder = _agent_dir(store_root, resnet_id)
    _write(folder, "why.md", "A note.\n", 0)
    response = client.post(f"/api/papers/{resnet_id}/agent-notes/why.md/placed")
    assert response.status_code == 204
    assert not (folder / "why.md").exists()
    assert (folder / "placed" / "why.md").read_text() == "A note.\n"
    assert client.get(f"/api/papers/{resnet_id}/agent-notes").json() == []


@pytest.mark.parametrize("name", ["why.txt", ".hidden.md", "a\\b.md", "..", "%2E%2E%2Fboard.md"])
def test_placed_refuses_a_bad_file_name(client, resnet_id, store_root, name):
    _agent_dir(store_root, resnet_id)
    response = client.post(f"/api/papers/{resnet_id}/agent-notes/{name}/placed")
    assert response.status_code in (404, 422)
    assert (store_root / "papers" / resnet_id / "source.json").exists()


def test_placed_on_a_missing_note_is_404(client, resnet_id):
    response = client.post(f"/api/papers/{resnet_id}/agent-notes/nope.md/placed")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "agent_note_not_found"


@pytest.mark.parametrize("name", ["why.txt", ".hidden.md", "a\\b.md", "../board.md", "placed/x.md", ""])
def test_mark_placed_refuses_anything_but_a_plain_md_name(tmp_path, name):
    with pytest.raises(ValueError):
        mark_placed(tmp_path, name)


def test_a_board_md_that_cannot_be_written_does_not_fail_the_save(client, resnet_id, store_root, caplog):
    (store_root / "tags.json").write_text("not json")
    response = client.put(f"/api/papers/{resnet_id}/board", json=_board(resnet_id), headers={"If-Match": "0"})
    assert response.status_code == 200
    assert "could not write board.md" in caplog.text
