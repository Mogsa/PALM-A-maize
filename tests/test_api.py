import json

import pytest
from conftest import FIXTURES
from fastapi.testclient import TestClient

from paperboard.api import create_app


@pytest.fixture
def client(store_root):
    return TestClient(create_app(store_root))


@pytest.fixture
def resnet_id(client):
    papers = client.get("/api/papers").json()
    return next(p["paper_id"] for p in papers if "residual" in p["paper_id"])


def _first_text_region(source, page):
    return next(r for r in source["regions"] if r["page"] == page and r["label"] == "text")


def test_list_and_source(client, resnet_id):
    assert client.get("/api/papers").status_code == 200
    source = client.get(f"/api/papers/{resnet_id}/source").json()
    assert source["schema"] == 1 and source["sections"]


def test_unknown_paper_is_404_with_the_error_shape(client):
    response = client.get("/api/papers/nope/source")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "paper_not_found"


def test_pdf_bytes(client, resnet_id):
    response = client.get(f"/api/papers/{resnet_id}/pdf")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert response.content[:5] == b"%PDF-"


def test_upload_runs_extraction(tmp_path):
    client = TestClient(create_app(tmp_path))
    with FIXTURES["adam"].open("rb") as handle:
        response = client.post("/api/papers", files={"file": ("adam.pdf", handle, "application/pdf")})
    assert response.status_code == 201
    paper_id = response.json()["paper_id"]
    assert "adam" in paper_id
    assert client.get(f"/api/papers/{paper_id}/source").json()["sections"]


def test_text_returns_a_selection_with_anchors(client, resnet_id):
    source = client.get(f"/api/papers/{resnet_id}/source").json()
    region = _first_text_region(source, 2)
    x0, y0, x1, y1 = region["rect"]
    body = {"rects": [{"page": 2, "rect": [x0, y0, x1, y0 + (y1 - y0) * 0.85]}], "snap": True}
    response = client.post(f"/api/papers/{resnet_id}/text", json=body)
    assert response.status_code == 200, response.text
    selection = response.json()
    assert selection["rects"] == [{"page": 2, "rect": region["rect"]}]
    assert selection["highlight"]["quote"]["exact"]
    assert selection["chunk"]["start"]["exact"]


def test_text_rejects_bad_geometry(client, resnet_id):
    response = client.post(f"/api/papers/{resnet_id}/text", json={"rects": [{"page": 2, "rect": [10, 10, 5, 20]}], "snap": True})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid"


def test_text_and_clip_reject_a_page_outside_the_paper(client, resnet_id):
    text_response = client.post(
        f"/api/papers/{resnet_id}/text",
        json={"rects": [{"page": 999, "rect": [0, 0, 10, 10]}], "snap": False},
    )
    assert text_response.status_code == 422
    assert text_response.json()["error"]["code"] == "invalid"

    clip_response = client.put(
        f"/api/papers/{resnet_id}/clips/n-fig",
        json={"page": 999, "rect": [0, 0, 10, 10], "dpi": 100},
    )
    assert clip_response.status_code == 422
    assert clip_response.json()["error"]["code"] == "invalid"


def test_board_put_get_and_version_conflict(client, resnet_id):
    board = client.get(f"/api/papers/{resnet_id}/board").json()
    assert board["version"] == 0 and board["nodes"] == []

    source = client.get(f"/api/papers/{resnet_id}/source").json()
    region = _first_text_region(source, 2)
    selection = client.post(f"/api/papers/{resnet_id}/text", json={"rects": [{"page": 2, "rect": region["rect"]}], "snap": False}).json()
    board["highlights"] = [{"id": "h-1", "tags": ["t-question"], "note": None, "anchor": selection["highlight"]}]
    board["nodes"] = [{"id": "n-1", "type": "note", "position": {"x": 0, "y": 0}, "data": {"tags": [], "collapsed": False, "note": "notes/n-1.md"}}]

    put = client.put(f"/api/papers/{resnet_id}/board", json=board, headers={"If-Match": "0"})
    assert put.status_code == 200, put.text
    assert put.json()["version"] == 1

    stale = client.put(f"/api/papers/{resnet_id}/board", json=board, headers={"If-Match": "0"})
    assert stale.status_code == 409
    assert stale.json()["error"]["code"] == "version_conflict" and stale.json()["error"]["current"] == 1

    missing = client.put(f"/api/papers/{resnet_id}/board", json=board)
    assert missing.status_code == 409

    got = client.get(f"/api/papers/{resnet_id}/board").json()
    assert got["version"] == 1
    assert got["highlights"][0]["anchor"]["state"] == "anchored"


def test_board_with_runtime_fields_is_422(client, resnet_id):
    board = client.get(f"/api/papers/{resnet_id}/board").json()
    board["nodes"] = [{"id": "n-1", "type": "note", "position": {"x": 0, "y": 0}, "selected": True,
                       "data": {"tags": [], "collapsed": False, "note": "notes/n-1.md"}}]
    response = client.put(f"/api/papers/{resnet_id}/board", json=board, headers={"If-Match": "0"})
    assert response.status_code == 422


def test_notes_round_trip_and_404(client, resnet_id):
    assert client.get(f"/api/papers/{resnet_id}/notes/n-9").status_code == 404
    assert client.put(f"/api/papers/{resnet_id}/notes/n-9", json={"markdown": "hello *there*\n"}).status_code == 204
    assert client.get(f"/api/papers/{resnet_id}/notes/n-9").json() == {"markdown": "hello *there*\n"}


def test_questions_lists_unanswered_marks_and_pieces(client, resnet_id):
    test_board_put_get_and_version_conflict(client, resnet_id)
    questions = client.get(f"/api/papers/{resnet_id}/questions").json()
    assert [q["id"] for q in questions] == ["h-1"]
    assert questions[0]["kind"] == "highlight" and questions[0]["text"]

    # Connecting a note clears it. With no chunk on the board there is no node to
    # hang an edge on, so the highlight's own `note` field carries the link; the
    # frontend keeps that field in step with edges (addendum 4.0).
    board = client.get(f"/api/papers/{resnet_id}/board").json()
    board["highlights"][0]["note"] = "n-1"
    assert client.put(f"/api/papers/{resnet_id}/board", json=board, headers={"If-Match": str(board["version"])}).status_code == 200
    assert client.get(f"/api/papers/{resnet_id}/questions").json() == []


def test_a_question_tagged_note_is_a_question_until_a_note_answers_it(client, resnet_id):
    def note(node_id, tags):
        return {"id": node_id, "type": "note", "position": {"x": 0, "y": 0},
                "data": {"tags": tags, "collapsed": False, "note": f"notes/{node_id}.md"}}

    board = client.get(f"/api/papers/{resnet_id}/board").json()
    board["nodes"] = [note("n-ask", ["t-question"]), note("n-reply", [])]
    _put(client, resnet_id, board)
    client.put(f"/api/papers/{resnet_id}/notes/n-ask", json={"markdown": "Why does depth hurt?\n"})
    assert client.get(f"/api/papers/{resnet_id}/questions").json() == [
        {"id": "n-ask", "kind": "note", "text": "Why does depth hurt?"}]

    board = client.get(f"/api/papers/{resnet_id}/board").json()
    board["edges"] = [{"id": "e-1", "source": "n-reply", "target": "n-ask"}]
    _put(client, resnet_id, board)
    assert client.get(f"/api/papers/{resnet_id}/questions").json() == []


def test_clip_put_and_get(client, resnet_id):
    source = client.get(f"/api/papers/{resnet_id}/source").json()
    figure = source["figures"][0]
    response = client.put(f"/api/papers/{resnet_id}/clips/n-fig", json={**figure["rect"], "dpi": 100})
    assert response.status_code == 200, response.text
    assert response.json()["clip"] == "clips/n-fig.png"
    assert response.json()["clip_size"]["width"] > 0
    png = client.get(f"/api/papers/{resnet_id}/clips/n-fig.png")
    assert png.status_code == 200 and png.content.startswith(b"\x89PNG")


def test_export_writes_a_file_and_returns_it(client, resnet_id, store_root):
    test_board_put_get_and_version_conflict(client, resnet_id)
    client.put(f"/api/papers/{resnet_id}/notes/n-1", json={"markdown": "my words\n"})
    response = client.post(f"/api/papers/{resnet_id}/export", json={"tags": []})
    assert response.status_code == 200
    payload = response.json()
    assert payload["path"].endswith("export.md")
    assert (store_root / "papers" / resnet_id / "export.md").read_text() == payload["markdown"]
    assert "# " in payload["markdown"]


def test_tags_default_and_update(client):
    tags = client.get("/api/tags").json()
    assert len(tags["tags"]) == 10
    tags["tags"].append({"id": "t-mine", "name": "mine", "colour": "#123456"})
    assert client.put("/api/tags", json=tags).status_code == 200
    assert len(client.get("/api/tags").json()["tags"]) == 11


def test_reextract_reports_states_and_touches_only_source(client, resnet_id, store_root):
    test_board_put_get_and_version_conflict(client, resnet_id)
    board_before = (store_root / "papers" / resnet_id / "board.json").read_bytes()
    response = client.post(f"/api/papers/{resnet_id}/extract")
    assert response.status_code == 200
    assert response.json()["states"] == {"h-1": "anchored"}
    assert (store_root / "papers" / resnet_id / "board.json").read_bytes() == board_before


def test_reextract_keeps_the_folder_name_as_the_paper_id(client, resnet_id, monkeypatch, extracted):
    import paperboard.api as api_module

    renamed = extracted["resnet"].model_copy(update={"paper_id": "a-new-slug"})
    monkeypatch.setattr(api_module, "extract", lambda _path: renamed)
    assert client.post(f"/api/papers/{resnet_id}/extract").status_code == 200
    assert client.get(f"/api/papers/{resnet_id}/source").json()["paper_id"] == resnet_id
    assert resnet_id in [p["paper_id"] for p in client.get("/api/papers").json()]


def _board_with_misplaced_highlight(client, resnet_id):
    """A board holding one highlight whose quote is on page 2 but whose stored rect
    is deliberately somewhere else. Re-finding it would move it; returning it as
    stored would not. That difference is what these tests observe."""
    source = client.get(f"/api/papers/{resnet_id}/source").json()
    region = _first_text_region(source, 2)
    selection = client.post(f"/api/papers/{resnet_id}/text", json={"rects": [{"page": 2, "rect": region["rect"]}], "snap": False}).json()
    anchor = {**selection["highlight"], "rect": [60.0, 700.0, 200.0, 710.0]}
    board = client.get(f"/api/papers/{resnet_id}/board").json()
    board["highlights"] = [{"id": "h-1", "tags": [], "note": None, "anchor": anchor}]
    return board, anchor


def _put(client, resnet_id, board):
    response = client.put(f"/api/papers/{resnet_id}/board", json=board, headers={"If-Match": str(board["version"])})
    assert response.status_code == 200, response.text


def test_export_reads_the_board_with_anchors_resolved(client, resnet_id):
    """The same board GET /board returns: a highlight stored at a stale rect is
    re-found inside its chunk first, so the export places it under that chunk."""
    board, anchor = _board_with_misplaced_highlight(client, resnet_id)
    source = client.get(f"/api/papers/{resnet_id}/source").json()
    region = _first_text_region(source, 2)
    chunk = client.post(f"/api/papers/{resnet_id}/text", json={"rects": [{"page": 2, "rect": region["rect"]}], "snap": False}).json()["chunk"]
    board["nodes"] = [{"id": "n-chunk", "type": "chunk", "position": {"x": 0, "y": 0},
                       "data": {"tags": [], "collapsed": False, "region": chunk, "text": "chunk"}}]
    board.pop("anchor_basis", None)
    _put(client, resnet_id, board)
    markdown = client.post(f"/api/papers/{resnet_id}/export", json={"tags": []}).json()["markdown"]
    assert anchor["quote"]["exact"].strip()[:40] in markdown
    assert "Highlights outside any chunk" not in markdown


def test_loading_a_board_re_finds_nothing_when_the_source_is_unchanged(client, resnet_id):
    board, anchor = _board_with_misplaced_highlight(client, resnet_id)
    basis = client.get(f"/api/papers/{resnet_id}/board").json()["anchor_basis"]
    assert basis
    board["anchor_basis"] = basis
    _put(client, resnet_id, board)
    got = client.get(f"/api/papers/{resnet_id}/board").json()
    assert got["highlights"][0]["anchor"]["rect"] == anchor["rect"]
    assert got["highlights"][0]["anchor"]["state"] == "anchored"
    assert got["anchor_basis"] == basis


def test_loading_a_board_with_no_basis_re_finds_once_and_stamps_it(client, resnet_id):
    board, anchor = _board_with_misplaced_highlight(client, resnet_id)
    board.pop("anchor_basis", None)
    _put(client, resnet_id, board)
    got = client.get(f"/api/papers/{resnet_id}/board").json()
    assert got["highlights"][0]["anchor"]["state"] == "relocated"
    assert got["highlights"][0]["anchor"]["rect"] != anchor["rect"]
    assert got["anchor_basis"]


def test_loading_a_board_re_finds_when_the_source_text_changed(client, resnet_id, store_root):
    board, _anchor = _board_with_misplaced_highlight(client, resnet_id)
    board["anchor_basis"] = client.get(f"/api/papers/{resnet_id}/board").json()["anchor_basis"]
    _put(client, resnet_id, board)
    path = store_root / "papers" / resnet_id / "source.json"
    source = json.loads(path.read_text())
    source["page_text"][0]["text"] += " "
    path.write_text(json.dumps(source))
    got = client.get(f"/api/papers/{resnet_id}/board").json()
    assert got["highlights"][0]["anchor"]["state"] == "relocated"
    assert got["anchor_basis"] != board["anchor_basis"]


def test_reextracting_an_unchanged_paper_re_finds_nothing(client, resnet_id):
    board, anchor = _board_with_misplaced_highlight(client, resnet_id)
    board["anchor_basis"] = client.get(f"/api/papers/{resnet_id}/board").json()["anchor_basis"]
    _put(client, resnet_id, board)
    assert client.post(f"/api/papers/{resnet_id}/extract").json()["states"] == {"h-1": "anchored"}
    assert client.get(f"/api/papers/{resnet_id}/board").json()["highlights"][0]["anchor"]["rect"] == anchor["rect"]
