"""papers/<id>/activity.jsonl (activity log spec): one JSON line per thing the
reader did, appended only, never rewritten."""

import json
import threading

import pytest
from conftest import local_client
from pydantic import ValidationError

from paperboard.activity import MAX_ACTIVITY_BYTES, MAX_EVENTS, ActivityBatch, ActivityEvent
from paperboard.api import create_app
from paperboard.store import PaperNotFound, Store

T = "2026-09-30T10:42:03.120Z"


def _event(n: int = 0, **change) -> dict:
    return {"t": T, "kind": "build", "action": "note", "detail": {"id": f"n-{n}", "text": "the learner drives"}, **change}


@pytest.fixture
def store(store_root):
    return Store(store_root)


@pytest.fixture
def pid(store):
    return next(p.paper_id for p in store.list_papers() if "residual" in p.paper_id)


@pytest.fixture
def client(store_root):
    return local_client(create_app(store_root))


def _lines(store, pid) -> list[dict]:
    return [json.loads(line) for line in (store.paper_dir(pid) / "activity.jsonl").read_text().splitlines()]


# -- the model -------------------------------------------------------------------

def test_an_event_keeps_its_four_keys():
    event = ActivityEvent.model_validate(_event())
    assert (event.kind, event.action, event.detail["text"]) == ("build", "note", "the learner drives")


@pytest.mark.parametrize("change", [
    {"kind": "mouse"}, {"action": ""}, {"action": "x" * 33}, {"detail": ["not", "an", "object"]},
    {"t": "yesterday"}, {"extra": 1},
])
def test_a_malformed_event_is_refused(change):
    with pytest.raises(ValidationError):
        ActivityEvent.model_validate(_event(**change))


def test_a_missing_key_is_refused():
    event = _event()
    del event["detail"]
    with pytest.raises(ValidationError):
        ActivityEvent.model_validate(event)


def test_a_batch_holds_at_most_the_limit():
    ActivityBatch.model_validate({"events": [_event(n) for n in range(MAX_EVENTS)]})
    with pytest.raises(ValidationError):
        ActivityBatch.model_validate({"events": [_event(n) for n in range(MAX_EVENTS + 1)]})


# -- the store -------------------------------------------------------------------

def test_events_are_appended_and_read_back_in_order(store, pid):
    store.append_activity(pid, [ActivityEvent.model_validate(_event(0))])
    store.append_activity(pid, [ActivityEvent.model_validate(_event(n)) for n in (1, 2)])
    assert [e["detail"]["id"] for e in store.read_activity(pid, limit=10)] == ["n-0", "n-1", "n-2"]
    assert len(_lines(store, pid)) == 3


def test_reading_gives_the_last_lines(store, pid):
    store.append_activity(pid, [ActivityEvent.model_validate(_event(n)) for n in range(5)])
    assert [e["detail"]["id"] for e in store.read_activity(pid, limit=2)] == ["n-3", "n-4"]


def test_a_damaged_line_is_skipped_with_a_warning_and_the_rest_read(store, pid, caplog):
    store.append_activity(pid, [ActivityEvent.model_validate(_event(0))])
    with (store.paper_dir(pid) / "activity.jsonl").open("a", encoding="utf-8") as f:
        f.write('{"t": "2026-09-30T10:4\n')   # a torn line, as a crash mid-write could leave
    store.append_activity(pid, [ActivityEvent.model_validate(_event(1))])
    assert [e["detail"]["id"] for e in store.read_activity(pid, limit=10)] == ["n-0", "n-1"]
    assert "activity.jsonl" in caplog.text


def test_a_paper_without_a_log_reads_as_empty(store, pid):
    assert store.read_activity(pid, limit=10) == []


def test_an_unknown_paper_has_no_log(store):
    with pytest.raises(PaperNotFound):
        store.read_activity("no-such-paper", limit=10)
    with pytest.raises(PaperNotFound):
        store.append_activity("no-such-paper", [ActivityEvent.model_validate(_event())])


def test_concurrent_appends_do_not_interleave(store, pid):
    def batch(n):
        return [ActivityEvent.model_validate(_event(n, detail={"id": f"n-{n}-{i}", "text": "w" * 2000}))
                for i in range(10)]

    threads = [threading.Thread(target=store.append_activity, args=(pid, batch(n))) for n in range(20)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    lines = _lines(store, pid)   # every line parses on its own: none is a fragment of another
    assert len(lines) == 200
    # A batch is written in one go: its ten lines sit together.
    for start in range(0, 200, 10):
        assert len({line["detail"]["id"].rsplit("-", 1)[0] for line in lines[start:start + 10]}) == 1


# -- the routes ------------------------------------------------------------------

def test_post_then_get(client, pid):
    response = client.post(f"/api/papers/{pid}/activity", json={"events": [_event(0), _event(1)]})
    assert response.status_code == 204
    events = client.get(f"/api/papers/{pid}/activity").json()["events"]
    assert [e["detail"]["id"] for e in events] == ["n-0", "n-1"]
    assert events[0]["kind"] == "build" and events[0]["action"] == "note"


def test_get_without_a_log_is_empty(client, pid):
    assert client.get(f"/api/papers/{pid}/activity").json() == {"events": []}


def test_get_gives_the_last_limit_events(client, pid):
    client.post(f"/api/papers/{pid}/activity", json={"events": [_event(n) for n in range(7)]})
    events = client.get(f"/api/papers/{pid}/activity", params={"limit": 3}).json()["events"]
    assert [e["detail"]["id"] for e in events] == ["n-4", "n-5", "n-6"]


def test_get_caps_the_limit(client, pid, store):
    store.append_activity(pid, [ActivityEvent.model_validate(_event(n)) for n in range(5001)])
    assert len(client.get(f"/api/papers/{pid}/activity", params={"limit": 9999}).json()["events"]) == 5000


@pytest.mark.parametrize("body", [
    {"events": [_event(kind="mouse")]},
    {"events": [_event(action="a-verb-far-longer-than-thirty-two-characters")]},
    {"events": [{"t": T, "kind": "read"}]},
    {"events": [_event(n) for n in range(MAX_EVENTS + 1)]},
    {"events": "not a list"},
    {},
])
def test_a_malformed_post_is_400_and_writes_nothing(client, pid, store, body):
    response = client.post(f"/api/papers/{pid}/activity", json=body)
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "invalid"
    assert not (store.paper_dir(pid) / "activity.jsonl").exists()


def test_a_body_that_is_not_json_is_400(client, pid):
    response = client.post(f"/api/papers/{pid}/activity", content=b"{not json",
                           headers={"content-type": "application/json"})
    assert response.status_code == 400


def test_a_post_over_the_size_limit_is_400(client, pid, store):
    body = {"events": [_event(detail={"text": "w" * MAX_ACTIVITY_BYTES})]}
    response = client.post(f"/api/papers/{pid}/activity", json=body)
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "too_large"
    assert not (store.paper_dir(pid) / "activity.jsonl").exists()


def test_activity_of_an_unknown_paper_is_404(client):
    assert client.get("/api/papers/no-such-paper/activity").status_code == 404
    response = client.post("/api/papers/no-such-paper/activity", json={"events": [_event()]})
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "paper_not_found"


def test_a_post_without_the_app_header_is_refused(store_root, pid):
    from conftest import LOCAL
    from fastapi.testclient import TestClient

    bare = TestClient(create_app(store_root), base_url=LOCAL)
    assert bare.post(f"/api/papers/{pid}/activity", json={"events": [_event()]}).status_code == 403
