"""papers/<id>/activity.jsonl (activity log spec): one JSON line per thing the
reader did, appended only, never rewritten."""

import json
import threading

import pytest
from pydantic import ValidationError

from paperboard.activity import MAX_EVENTS, ActivityBatch, ActivityEvent
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
