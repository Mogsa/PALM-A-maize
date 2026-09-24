"""Sketch notes (D23): freehand ink on a note, stored beside its text as
`notes/<id>.sketch.json` and `notes/<id>.svg`. The server builds the SVG from
path strings it has checked, so no markup from the client reaches the file."""

import json
import xml.etree.ElementTree as ET

import pytest
from conftest import LOCAL, local_client
from fastapi.testclient import TestClient

from paperboard.api import create_app

NOTE = "n-01J8Z3QABCDEFGHJKMNPQRSTVW"
SVG_NS = "{http://www.w3.org/2000/svg}"
SKETCH = {
    "width": 600, "height": 400,
    "strokes": [{"points": [[10, 20, 0.5], [30, 40, 0.5]], "size": 4}],
    "paths": ["M10.5,20 L30,40.25 Q31,41 32,42 Z", "M 1 2 l -3e-2 4 z"],
}


@pytest.fixture
def client(store_root):
    return local_client(create_app(store_root))


@pytest.fixture
def paper(client):
    papers = client.get("/api/papers").json()
    return next(p["paper_id"] for p in papers if "residual" in p["paper_id"])


def _base(paper: str, node_id: str = NOTE) -> str:
    return f"/api/papers/{paper}/notes/{node_id}"


def test_a_sketch_round_trips_and_is_removed(client, paper, store_root):
    notes = store_root / "papers" / paper / "notes"
    assert client.get(f"{_base(paper)}/sketch").status_code == 404
    assert client.put(f"{_base(paper)}/sketch", json=SKETCH).status_code == 204
    got = client.get(f"{_base(paper)}/sketch").json()
    assert got == {"width": 600, "height": 400, "strokes": SKETCH["strokes"]}
    assert json.loads((notes / f"{NOTE}.sketch.json").read_text()) == got
    assert (notes / f"{NOTE}.svg").exists()

    assert client.delete(f"{_base(paper)}/sketch").status_code == 204
    assert client.get(f"{_base(paper)}/sketch").status_code == 404
    assert client.get(f"{_base(paper)}/sketch.svg").status_code == 404
    assert not (notes / f"{NOTE}.sketch.json").exists() and not (notes / f"{NOTE}.svg").exists()


def test_deleting_a_sketch_that_is_not_there_is_fine(client, paper):
    assert client.delete(f"{_base(paper)}/sketch").status_code == 204


def test_the_svg_holds_only_an_svg_and_its_paths(client, paper):
    client.put(f"{_base(paper)}/sketch", json=SKETCH)
    response = client.get(f"{_base(paper)}/sketch.svg")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("image/svg+xml")
    root = ET.fromstring(response.content)
    assert root.tag == f"{SVG_NS}svg"
    assert root.get("viewBox") == "0 0 600 400"
    assert {el.tag for el in root.iter()} == {f"{SVG_NS}svg", f"{SVG_NS}path"}
    assert [p.get("d") for p in root.iter(f"{SVG_NS}path")] == SKETCH["paths"]


def test_the_svg_is_served_with_a_policy_that_runs_nothing(client, paper):
    client.put(f"{_base(paper)}/sketch", json=SKETCH)
    response = client.get(f"{_base(paper)}/sketch.svg")
    assert response.headers["content-security-policy"] == "default-src 'none'; style-src 'unsafe-inline'"


@pytest.mark.parametrize("path", [
    'M0 0"/><script>alert(1)</script><path d="',
    "M0 0 url(#x)",
    "M0 0 L10 10 onload",
    "M0 0\x00",
    "M0 0 <",
])
def test_a_path_that_is_not_only_path_syntax_is_refused(client, paper, store_root, path):
    response = client.put(f"{_base(paper)}/sketch", json={**SKETCH, "paths": [path]})
    assert response.status_code == 422
    assert not (store_root / "papers" / paper / "notes").exists()


@pytest.mark.parametrize("change", [{"width": 0}, {"height": -5}, {"width": 100_000}, {"strokes": [{"points": [[1, 2]], "size": 4}]}])
def test_a_sketch_of_the_wrong_shape_is_refused(client, paper, change):
    assert client.put(f"{_base(paper)}/sketch", json={**SKETCH, **change}).status_code == 422


def test_a_note_says_whether_it_has_a_sketch(client, paper):
    client.put(_base(paper), json={"markdown": "words\n"})
    assert client.get(_base(paper)).json() == {"markdown": "words\n", "has_sketch": False}
    client.put(f"{_base(paper)}/sketch", json=SKETCH)
    assert client.get(_base(paper)).json() == {"markdown": "words\n", "has_sketch": True}


def test_a_note_with_only_a_sketch_is_not_missing(client, paper):
    client.put(f"{_base(paper)}/sketch", json=SKETCH)
    assert client.get(_base(paper)).json() == {"markdown": "", "has_sketch": True}


@pytest.mark.parametrize("node_id", ["n-9", "n-01J8Z3QABCDEFGHJKMNPQRSTVW%0Aid:%20x", "h-01J8Z3QABCDEFGHJKMNPQRSTVW"])
def test_a_sketch_for_an_id_no_client_could_mint_is_404(client, paper, store_root, node_id):
    base = _base(paper, node_id)
    for response in [client.put(f"{base}/sketch", json=SKETCH), client.get(f"{base}/sketch"),
                     client.get(f"{base}/sketch.svg"), client.delete(f"{base}/sketch")]:
        assert response.status_code == 404, response.text
    assert not (store_root / "papers" / paper / "notes").exists()


def test_a_sketch_for_an_escaping_paper_id_is_404(client, store_root):
    assert client.put(f"/api/papers/%2e%2e/notes/{NOTE}/sketch", json=SKETCH).status_code == 404
    assert client.get(f"/api/papers/%2e%2e/notes/{NOTE}/sketch.svg").status_code == 404
    assert not (store_root / "notes").exists()


def test_a_sketch_write_without_the_app_header_is_refused(store_root, paper):
    bare = TestClient(create_app(store_root), base_url=LOCAL)
    assert bare.put(f"{_base(paper)}/sketch", json=SKETCH).status_code == 403
    assert bare.delete(f"{_base(paper)}/sketch").status_code == 403
    assert not (store_root / "papers" / paper / "notes").exists()


def test_export_puts_a_notes_sketch_above_its_text(client, paper):
    board = client.get(f"/api/papers/{paper}/board").json()
    board["nodes"] = [{"id": NOTE, "type": "note", "position": {"x": 0, "y": 0},
                       "data": {"tags": [], "collapsed": False, "note": f"notes/{NOTE}.md"}}]
    client.put(f"/api/papers/{paper}/board", json=board, headers={"If-Match": str(board["version"])})
    client.put(_base(paper), json={"markdown": "The drawing shows $x^2$.\n"})
    client.put(f"{_base(paper)}/sketch", json=SKETCH)
    for order in ["paper", "template"]:
        markdown = client.post(f"/api/papers/{paper}/export", json={"tags": [], "order": order}).json()["markdown"]
        assert f"![sketch](notes/{NOTE}.svg)\n\nThe drawing shows $x^2$." in markdown
