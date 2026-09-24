"""The chunk routes (addendum 6, section 4.10): stateless, writing nothing, with
their own 422 codes."""

import pytest
from conftest import LOCAL, local_client
from fastapi.testclient import TestClient

from paperboard.api import create_app

SHORTCUTS = "The shortcut connections in Eqn.(1) introduce neither extra parameter nor computation complexity."
IDENTITY = "3.2. Identity Mapping by Shortcuts"


@pytest.fixture
def client(store_root):
    return local_client(create_app(store_root))


@pytest.fixture
def resnet_id(client):
    return next(p["paper_id"] for p in client.get("/api/papers").json() if "residual" in p["paper_id"])


def _section(client, paper_id: str, title: str) -> dict:
    """The chunk data split makes for a section, by its title."""
    source = client.get(f"/api/papers/{paper_id}/source").json()
    section = next(s for s in source["sections"] if s["title"] == title)
    drafts = client.post(f"/api/papers/{paper_id}/split").json()["nodes"]
    return next(d["data"] for d in drafts if d["data"]["source_id"] == section["id"])


@pytest.mark.parametrize("route, body", [
    ("highlight", {"quote": {"exact": "x"}}),
    ("split", {"region": None, "at": {"exact": "x"}, "mode": "split"}),
    ("join", {"regions": []}),
])
def test_a_malformed_request_is_invalid(client, resnet_id, route, body):
    response = client.post(f"/api/papers/{resnet_id}/chunks/{route}", json=body)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid"


def test_a_split_mode_must_be_split_or_cut(client, resnet_id):
    region = _section(client, resnet_id, IDENTITY)["region"]
    response = client.post(f"/api/papers/{resnet_id}/chunks/split", json={"region": region, "at": {"exact": SHORTCUTS}, "mode": "slice"})
    assert response.status_code == 422


def test_the_chunk_routes_need_the_app_header(store_root, resnet_id):
    bare = TestClient(create_app(store_root), base_url=LOCAL)
    assert bare.post(f"/api/papers/{resnet_id}/chunks/join", json={"regions": []}).status_code == 403
