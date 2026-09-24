import hashlib
import json

import pytest
from conftest import FIXTURES, LOCAL
from fastapi.testclient import TestClient

from paperboard.api import create_app

# Node ids as the client mints them: n- and a ULID (addendum 4.5).
NOTE = "n-01J8Z3QABCDEFGHJKMNPQRSTVW"
FIG = "n-01J8Z3QABCDEFGHJKMNPQRSTVX"
ASK = "n-01J8Z3QABCDEFGHJKMNPQRSTVY"
REPLY = "n-01J8Z3QABCDEFGHJKMNPQRSTVZ"


@pytest.fixture
def client(store_root):
    return TestClient(create_app(store_root), base_url=LOCAL)


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


@pytest.mark.parametrize("host", ["localhost", "127.0.0.1:8765", "localhost:5173"])
def test_localhost_is_served(client, host):
    assert client.get("/api/papers", headers={"host": host}).status_code == 200


@pytest.mark.parametrize("host", ["evil.example", "testserver", "192.168.1.9:8765"])
def test_a_request_for_another_host_is_refused(client, host):
    """DNS rebinding: a page on another origin that resolves to 127.0.0.1 still
    sends its own name as Host."""
    assert client.get("/api/papers", headers={"host": host}).status_code == 400


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
    client = TestClient(create_app(tmp_path), base_url=LOCAL)
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
    lines = selection["highlight"]["rects"]   # one per line (D1)
    assert len(lines) > 1 and all(line["page"] == 2 for line in lines)
    assert selection["highlight"]["quote"]["exact"]
    assert selection["chunk"]["start"]["exact"]
    assert [(b["kind"], b["page"]) for b in selection["blocks"]] == [("text", 2)]


@pytest.mark.parametrize("name, route", [("board.json", "board"), ("source.json", "source")])
def test_a_corrupt_file_on_disk_is_a_500_not_the_clients_fault(store_root, resnet_id, name, route):
    (store_root / "papers" / resnet_id / name).write_text('{"schema": 1, "paper_id": ')
    client = TestClient(create_app(store_root), base_url=LOCAL, raise_server_exceptions=False)
    response = client.get(f"/api/papers/{resnet_id}/{route}")
    assert response.status_code == 500
    assert response.json()["error"]["code"] == "corrupt_data"


def test_any_other_server_failure_keeps_the_error_shape(store_root, resnet_id):
    (store_root / "papers" / resnet_id / "paper.pdf").write_bytes(b"not a pdf at all")
    client = TestClient(create_app(store_root), base_url=LOCAL, raise_server_exceptions=False)
    response = client.post(f"/api/papers/{resnet_id}/text", json={"rects": [{"page": 0, "rect": [0, 0, 10, 10]}]})
    assert response.status_code == 500
    assert response.json()["error"]["code"] == "internal"


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
        f"/api/papers/{resnet_id}/clips/{FIG}",
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
    board["highlights"] = [{"id": "h-1", "tags": ["t-question"], "anchor": selection["highlight"]}]
    board["nodes"] = [{"id": NOTE, "type": "note", "position": {"x": 0, "y": 0}, "data": {"tags": [], "collapsed": False, "note": f"notes/{NOTE}.md"}}]

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
    assert client.get(f"/api/papers/{resnet_id}/notes/{NOTE}").status_code == 404
    assert client.put(f"/api/papers/{resnet_id}/notes/{NOTE}", json={"markdown": "hello *there*\n"}).status_code == 204
    assert client.get(f"/api/papers/{resnet_id}/notes/{NOTE}").json() == {"markdown": "hello *there*\n"}


def test_questions_lists_unanswered_marks_and_pieces(client, resnet_id):
    test_board_put_get_and_version_conflict(client, resnet_id)
    questions = client.get(f"/api/papers/{resnet_id}/questions").json()
    assert [q["id"] for q in questions] == ["h-1"]
    assert questions[0]["kind"] == "highlight" and questions[0]["text"]

    # A connection to a note the reader wrote clears it, whether or not any chunk
    # holds the highlight: edges connect the things themselves (addendum 4.0).
    board = client.get(f"/api/papers/{resnet_id}/board").json()
    board["edges"] = [{"id": "e-1", "from": NOTE, "to": "h-1", "data": {"tags": []}}]
    _put(client, resnet_id, board)
    assert client.get(f"/api/papers/{resnet_id}/questions").json() == []


@pytest.mark.parametrize("node_id", ["n-9", "n-01J8Z3QABCDEFGHJKMNPQRSTVW%0Aid:%20x", "n-01j8z3qabcdefghjkmnpqrstvw", "h-01J8Z3QABCDEFGHJKMNPQRSTVW"])
def test_a_node_id_the_client_could_not_have_minted_is_404(client, resnet_id, store_root, node_id):
    """A newline in the id used to reach the note's filename and front matter."""
    base = f"/api/papers/{resnet_id}"
    responses = [
        client.get(f"{base}/notes/{node_id}"),
        client.put(f"{base}/notes/{node_id}", json={"markdown": "x"}),
        client.put(f"{base}/clips/{node_id}", json={"page": 0, "rect": [0, 0, 10, 10], "dpi": 72}),
        client.get(f"{base}/clips/{node_id}.png"),
    ]
    codes = ["note_not_found", "node_not_found", "node_not_found", "node_not_found"]
    for response, code in zip(responses, codes, strict=True):
        assert response.status_code == 404, response.text
        assert response.json()["error"]["code"] == code
    folder = store_root / "papers" / resnet_id
    assert not (folder / "notes").exists() and not (folder / "clips").exists()


def test_a_question_tagged_note_is_a_question_until_a_note_answers_it(client, resnet_id):
    def note(node_id, tags):
        return {"id": node_id, "type": "note", "position": {"x": 0, "y": 0},
                "data": {"tags": tags, "collapsed": False, "note": f"notes/{node_id}.md"}}

    board = client.get(f"/api/papers/{resnet_id}/board").json()
    board["nodes"] = [note(ASK, ["t-question"]), note(REPLY, [])]
    _put(client, resnet_id, board)
    client.put(f"/api/papers/{resnet_id}/notes/{ASK}", json={"markdown": "Why does depth hurt?\n"})
    assert client.get(f"/api/papers/{resnet_id}/questions").json() == [
        {"id": ASK, "kind": "note", "text": "Why does depth hurt?"}]

    board = client.get(f"/api/papers/{resnet_id}/board").json()
    board["edges"] = [{"id": "e-1", "from": REPLY, "to": ASK}]
    _put(client, resnet_id, board)
    assert client.get(f"/api/papers/{resnet_id}/questions").json() == []


def test_clip_put_and_get(client, resnet_id):
    source = client.get(f"/api/papers/{resnet_id}/source").json()
    figure = source["figures"][0]
    response = client.put(f"/api/papers/{resnet_id}/clips/{FIG}", json={**figure["rect"], "dpi": 100})
    assert response.status_code == 200, response.text
    assert response.json()["clip"] == f"clips/{FIG}.png"
    assert response.json()["clip_size"]["width"] > 0
    png = client.get(f"/api/papers/{resnet_id}/clips/{FIG}.png")
    assert png.status_code == 200 and png.content.startswith(b"\x89PNG")


def test_export_writes_a_file_and_returns_it(client, resnet_id, store_root):
    test_board_put_get_and_version_conflict(client, resnet_id)
    client.put(f"/api/papers/{resnet_id}/notes/{NOTE}", json={"markdown": "my words\n"})
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
    assert response.json() == {"changed": [], "states": {"h-1": "anchored"}}
    assert (store_root / "papers" / resnet_id / "board.json").read_bytes() == board_before


def test_reextract_reports_what_changed(client, resnet_id, monkeypatch, extracted):
    import paperboard.api as api_module

    test_board_put_get_and_version_conflict(client, resnet_id)
    doc = extracted["resnet"]
    pages = [p.model_copy(update={"text": ""}) if p.page == 2 else p for p in doc.page_text]
    monkeypatch.setattr(api_module, "extract", lambda _path: doc.model_copy(update={"page_text": pages}))
    response = client.post(f"/api/papers/{resnet_id}/extract")
    assert response.json() == {"changed": ["h-1"], "states": {"h-1": "orphaned"}}


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
    anchor = {**selection["highlight"], "rects": [{"page": 2, "rect": [60.0, 700.0, 200.0, 710.0]}]}
    board = client.get(f"/api/papers/{resnet_id}/board").json()
    board["highlights"] = [{"id": "h-1", "tags": [], "anchor": anchor}]
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
                       "data": {"tags": [], "collapsed": False, "region": chunk, "blocks": []}}]
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
    assert got["highlights"][0]["anchor"]["rects"] == anchor["rects"]
    assert got["highlights"][0]["anchor"]["state"] == "anchored"
    assert got["anchor_basis"] == basis


def test_loading_a_board_with_no_basis_re_finds_once_and_stamps_it(client, resnet_id):
    board, anchor = _board_with_misplaced_highlight(client, resnet_id)
    board.pop("anchor_basis", None)
    _put(client, resnet_id, board)
    got = client.get(f"/api/papers/{resnet_id}/board").json()
    assert got["highlights"][0]["anchor"]["state"] == "relocated"
    assert got["highlights"][0]["anchor"]["rects"] != anchor["rects"]
    assert got["anchor_basis"]


def _board_with_misplaced_chunk(client, resnet_id, blocks):
    """A chunk cut from a page 2 paragraph, its rects then moved elsewhere on
    the page: re-finding it relocates it."""
    source = client.get(f"/api/papers/{resnet_id}/source").json()
    region = _first_text_region(source, 2)
    chunk = client.post(f"/api/papers/{resnet_id}/text", json={"rects": [{"page": 2, "rect": region["rect"]}], "snap": False}).json()["chunk"]
    moved = {**chunk, "rects": [{"page": 2, "rect": [60.0, 700.0, 200.0, 710.0]}]}
    board = client.get(f"/api/papers/{resnet_id}/board").json()
    board["nodes"] = [{"id": "n-chunk", "type": "chunk", "position": {"x": 0, "y": 0},
                       "data": {"tags": [], "collapsed": False, "region": moved, "blocks": blocks}}]
    board.pop("anchor_basis", None)
    return board


def test_a_chunk_that_re_anchoring_moves_gets_its_blocks_recomputed(client, resnet_id):
    stale = [{"kind": "text", "page": 2, "rect": [60.0, 700.0, 200.0, 710.0], "text": "stale words"}]
    board = _board_with_misplaced_chunk(client, resnet_id, stale)
    _put(client, resnet_id, board)
    chunk = client.get(f"/api/papers/{resnet_id}/board").json()["nodes"][0]["data"]
    assert chunk["region"]["state"] == "relocated"
    assert chunk["blocks"] and chunk["blocks"] != stale
    assert all(b["page"] == 2 for b in chunk["blocks"])


def test_a_chunk_that_holds_keeps_its_blocks(client, resnet_id):
    source = client.get(f"/api/papers/{resnet_id}/source").json()
    region = _first_text_region(source, 2)
    chunk = client.post(f"/api/papers/{resnet_id}/text", json={"rects": [{"page": 2, "rect": region["rect"]}], "snap": False}).json()["chunk"]
    kept = [{"kind": "text", "page": 2, "rect": region["rect"], "text": "as the reader cut it"}]
    board = client.get(f"/api/papers/{resnet_id}/board").json()
    board["nodes"] = [{"id": "n-chunk", "type": "chunk", "position": {"x": 0, "y": 0},
                       "data": {"tags": [], "collapsed": False, "region": chunk, "blocks": kept}}]
    board.pop("anchor_basis", None)
    _put(client, resnet_id, board)
    got = client.get(f"/api/papers/{resnet_id}/board").json()["nodes"][0]["data"]
    assert got["region"]["state"] == "anchored"
    assert got["blocks"] == kept


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
    assert client.get(f"/api/papers/{resnet_id}/board").json()["highlights"][0]["anchor"]["rects"] == anchor["rects"]


# -- schema 2 ------------------------------------------------------------------


def test_a_schema_1_board_is_refused_on_put(client, resnet_id):
    board = client.get(f"/api/papers/{resnet_id}/board").json()
    board["schema"] = 1
    response = client.put(f"/api/papers/{resnet_id}/board", json=board, headers={"If-Match": "0"})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid"


def test_a_schema_1_board_on_disk_is_served_as_schema_2(client, resnet_id, store_root):
    v1 = {"schema": 1, "paper_id": resnet_id, "version": 2, "nodes": [], "edges": [], "highlights": [
        {"id": "h-1", "tags": [], "note": None, "anchor": {"page": 2, "rect": [60.0, 100.0, 280.0, 130.0],
                                                            "quote": {"exact": "x"}, "position": 0, "state": "anchored"}}]}
    (store_root / "papers" / resnet_id / "board.json").write_text(json.dumps(v1))
    got = client.get(f"/api/papers/{resnet_id}/board").json()
    assert (got["schema"], got["view"], got["version"]) == (2, "paper", 2)
    assert len(got["highlights"][0]["anchor"]["rects"]) == 1   # re-found on load: no anchor_basis yet
    assert "note" not in got["highlights"][0]
    _put(client, resnet_id, got)
    assert (store_root / "papers" / resnet_id / "board.v1.json").exists()


def test_only_a_note_the_reader_wrote_answers_a_question(client, resnet_id):
    def note(node_id, tags, origin):
        return {"id": node_id, "type": "note", "position": {"x": 0, "y": 0},
                "data": {"tags": tags, "collapsed": False, "note": f"notes/{node_id}.md", "origin": origin}}

    board = client.get(f"/api/papers/{resnet_id}/board").json()
    board["nodes"] = [note(ASK, ["t-question"], "reader"), note(REPLY, [], "ai")]
    board["edges"] = [{"id": "e-1", "from": ASK, "to": REPLY}]
    _put(client, resnet_id, board)
    assert [q["id"] for q in client.get(f"/api/papers/{resnet_id}/questions").json()] == [ASK]


@pytest.mark.parametrize("mode", ["text", "area"])
def test_text_takes_a_mode(client, resnet_id, mode):
    source = client.get(f"/api/papers/{resnet_id}/source").json()
    region = _first_text_region(source, 2)
    response = client.post(f"/api/papers/{resnet_id}/text",
                           json={"rects": [{"page": 2, "rect": region["rect"]}], "snap": False, "mode": mode})
    assert response.status_code == 200, response.text
    assert response.json()["highlight"]["rects"]


@pytest.mark.parametrize("body", [
    {"rects": [{"page": 2, "rect": [60, 100, 280, 130]}, {"page": 2, "rect": [320, 100, 540, 130]}], "mode": "area"},
    {"rects": [{"page": 2, "rect": [60, 100, 280, 130]}], "mode": "lasso"},
], ids=["area with two rects", "unknown mode"])
def test_text_refuses_a_malformed_mode(client, resnet_id, body):
    response = client.post(f"/api/papers/{resnet_id}/text", json=body)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid"


def _render(client, resnet_id, **params):
    query = {"page": 2, "x0": 60, "y0": 100, "x1": 280, "y1": 130, **params}
    return client.get(f"/api/papers/{resnet_id}/render", params=query)


def test_render_returns_a_png_at_216_dpi_by_default_and_writes_nothing(client, resnet_id, store_root):
    folder = store_root / "papers" / resnet_id
    before = sorted(p.name for p in folder.rglob("*"))
    response = _render(client, resnet_id)
    assert response.status_code == 200, response.text
    assert response.headers["content-type"] == "image/png"
    assert response.content.startswith(b"\x89PNG")
    width = int.from_bytes(response.content[16:20], "big")
    assert width == pytest.approx((280 - 60 + 8) * 216 / 72, abs=3)
    assert sorted(p.name for p in folder.rglob("*")) == before


def test_render_etag_follows_the_pdf_and_the_query(client, resnet_id, store_root):
    first = _render(client, resnet_id).headers["etag"]
    assert first == _render(client, resnet_id).headers["etag"]
    assert first != _render(client, resnet_id, dpi=100).headers["etag"]
    sha = hashlib.sha256((store_root / "papers" / resnet_id / "paper.pdf").read_bytes()).hexdigest()
    assert sha[:16] in first


def test_render_answers_a_matching_if_none_match_with_304(client, resnet_id):
    etag = _render(client, resnet_id).headers["etag"]
    query = {"page": 2, "x0": 60, "y0": 100, "x1": 280, "y1": 130}
    response = client.get(f"/api/papers/{resnet_id}/render", params=query, headers={"If-None-Match": etag})
    assert response.status_code == 304 and response.content == b""


@pytest.mark.parametrize("params", [{"x1": 10}, {"page": 999}, {"page": -1}], ids=["inverted", "past the end", "negative page"])
def test_render_refuses_bad_geometry(client, resnet_id, params):
    response = _render(client, resnet_id, **params)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid"


def test_render_of_an_unknown_paper_is_404(client):
    response = client.get("/api/papers/nope/render", params={"page": 0, "x0": 0, "y0": 0, "x1": 10, "y1": 10})
    assert response.status_code == 404


def test_split_returns_draft_nodes_and_writes_nothing(client, resnet_id, store_root):
    source = client.get(f"/api/papers/{resnet_id}/source").json()
    response = client.post(f"/api/papers/{resnet_id}/split")
    assert response.status_code == 200
    drafts = response.json()["nodes"]
    assert len(drafts) == len(source["sections"]) + len(source["figures"])
    assert all("id" not in d and d["data"]["collapsed"] for d in drafts)
    assert not (store_root / "papers" / resnet_id / "board.json").exists()


def test_an_area_selection_over_a_figure_snaps_to_it_and_is_one_clip(client, resnet_id):
    source = client.get(f"/api/papers/{resnet_id}/source").json()
    picture = next(r for r in source["regions"] if r["page"] == 3 and r["label"] == "picture")
    x0, y0, x1, y1 = picture["rect"]
    body = {"rects": [{"page": 3, "rect": [x0 - 10, y0 - 10, x1 + 10, y0 + (y1 - y0) * 0.7]}], "mode": "area"}
    selection = client.post(f"/api/papers/{resnet_id}/text", json=body).json()
    assert selection["region_label"] == "picture"
    assert [(b["kind"], b["label"]) for b in selection["blocks"]] == [("clip", "picture")]
    assert selection["highlight"]["rects"] == selection["rects"]


def test_template_defaults_to_nine_slots_and_can_be_replaced(client, store_root):
    template = client.get("/api/template").json()
    assert template["schema"] == 1 and len(template["slots"]) == 9
    assert template["slots"][0] == {"name": "Background", "prompt": "What do you need to know first: terms, notation, setup?"}
    template["slots"] = template["slots"][:3]
    response = client.put("/api/template", json=template)
    assert response.status_code == 200 and len(response.json()["slots"]) == 3
    assert len(client.get("/api/template").json()["slots"]) == 3
    assert (store_root / "template.json").exists()


def test_a_malformed_template_is_refused(client):
    assert client.put("/api/template", json={"schema": 1, "slots": [{"name": "x"}]}).status_code == 422


@pytest.mark.parametrize("order, status", [("paper", 200), ("template", 200), ("random", 422)])
def test_export_takes_an_order(client, resnet_id, order, status):
    response = client.post(f"/api/papers/{resnet_id}/export", json={"tags": [], "order": order})
    assert response.status_code == status


def test_a_clip_renders_at_216_dpi_by_default(client, resnet_id):
    response = client.put(f"/api/papers/{resnet_id}/clips/{FIG}", json={"page": 2, "rect": [60, 100, 280, 130]})
    assert response.status_code == 200, response.text
    assert response.json()["clip_size"]["width"] == pytest.approx((280 - 60 + 8) * 216 / 72, abs=3)


# -- D6: export names tags ------------------------------------------------------


def test_export_writes_a_highlights_tags_by_their_current_names(client, resnet_id):
    test_board_put_get_and_version_conflict(client, resnet_id)   # h-1 carries t-question
    tags = client.get("/api/tags").json()
    tags["tags"] = [{**t, "name": "open question"} if t["id"] == "t-question" else t for t in tags["tags"]]
    client.put("/api/tags", json=tags)
    markdown = client.post(f"/api/papers/{resnet_id}/export", json={"tags": []}).json()["markdown"]
    assert "*p. 3 · open question*" in markdown


# -- D9: re-upload replaces -------------------------------------------------------


def _upload(client, pdf_bytes):
    return client.post("/api/papers", files={"file": ("paper.pdf", pdf_bytes, "application/pdf")})


def _paper_files(store_root, paper_id):
    folder = store_root / "papers" / paper_id
    return {name: (folder / name).read_bytes() for name in ("paper.pdf", "source.json", "board.json")}


def test_re_uploading_a_paper_replaces_it_and_reports_what_changed(client, resnet_id, store_root, monkeypatch, extracted):
    import paperboard.store as store_module

    test_board_put_get_and_version_conflict(client, resnet_id)   # h-1 on page 2
    before = _paper_files(store_root, resnet_id)
    doc = extracted["resnet"]
    pages = [p.model_copy(update={"text": ""}) if p.page == 2 else p for p in doc.page_text]
    monkeypatch.setattr(store_module, "extract", lambda _path: doc.model_copy(update={"page_text": pages}))
    revised = FIXTURES["resnet"].read_bytes() + b"\n% revised\n"

    response = _upload(client, revised)
    assert response.status_code == 200, response.text
    assert response.json() == {"paper_id": resnet_id, "changed": ["h-1"], "states": {"h-1": "orphaned"}}
    after = _paper_files(store_root, resnet_id)
    assert after["paper.pdf"] == revised
    assert after["source.json"] != before["source.json"]
    assert after["board.json"] == before["board.json"]   # the board is kept, never written


def test_re_uploading_the_same_paper_changes_nothing(client, resnet_id, monkeypatch, extracted):
    import paperboard.store as store_module

    test_board_put_get_and_version_conflict(client, resnet_id)
    monkeypatch.setattr(store_module, "extract", lambda _path: extracted["resnet"])
    response = _upload(client, FIXTURES["resnet"].read_bytes())
    assert response.status_code == 200, response.text
    assert response.json() == {"paper_id": resnet_id, "changed": [], "states": {"h-1": "anchored"}}


def test_a_failed_re_upload_leaves_the_paper_as_it_was(client, resnet_id, store_root, monkeypatch):
    import paperboard.store as store_module

    test_board_put_get_and_version_conflict(client, resnet_id)
    before = _paper_files(store_root, resnet_id)

    def fail(_path):
        raise RuntimeError("layout model crashed")

    monkeypatch.setattr(store_module, "extract", fail)
    response = _upload(client, FIXTURES["resnet"].read_bytes() + b"\n% revised\n")
    assert response.status_code == 500
    assert response.json()["error"] == {"code": "extraction_failed", "message": "RuntimeError: layout model crashed"}
    assert _paper_files(store_root, resnet_id) == before


# -- D12, D14: the question list --------------------------------------------------


def test_a_question_note_is_listed_by_its_first_line(client, resnet_id):
    board = client.get(f"/api/papers/{resnet_id}/board").json()
    board["nodes"] = [{"id": ASK, "type": "note", "position": {"x": 0, "y": 0},
                       "data": {"tags": ["t-question"], "collapsed": False, "note": f"notes/{ASK}.md"}}]
    _put(client, resnet_id, board)
    client.put(f"/api/papers/{resnet_id}/notes/{ASK}", json={"markdown": "\nWhy does depth hurt?\nMore on that.\n"})
    assert client.get(f"/api/papers/{resnet_id}/questions").json() == [
        {"id": ASK, "kind": "note", "text": "Why does depth hurt?"}]
