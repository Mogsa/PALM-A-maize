import pytest
from conftest import local_client
from fake_claude import FakeClaude

from paperboard.ai import quote_lines
from paperboard.ai_client import AiError
from paperboard.ai_model import Ground
from paperboard.anchoring import build_index
from paperboard.api import create_app
from paperboard.source_model import PageRect
from paperboard.spans import paper_spans
from paperboard.store import Store


@pytest.fixture
def paper(store_root):
    store = Store(store_root)
    pid = next(p.paper_id for p in store.list_papers() if "residual" in p.paper_id)
    import pymupdf
    with pymupdf.open(store.pdf_path(pid)) as pdf:
        spans = paper_spans(store.read_source(pid), pdf)
    return store, pid, spans


def _client(store_root, claude):
    return local_client(create_app(store_root, claude=claude))


def _turn_on(client, pid):
    client.put(f"/api/papers/{pid}/view", json={"ai": True})


def _answer(span):
    words = span.text.split()[:3]
    return {"terms": [{"term": words[0], "defined_in": [], "explanation": "Plain words.",
                       "grounds": [{"span": span.id, "quote": " ".join(words)}]}],
            "where_to_look": [{"slot": "Problem", "spans": [{"span": span.id, "quote": " ".join(words)}]},
                              {"slot": "Problem", "spans": [{"span": "p99-r1", "quote": "x"}]}]}


def test_no_ai_json_is_404(store_root, paper):
    _, pid, _ = paper
    response = _client(store_root, FakeClaude()).get(f"/api/papers/{pid}/ai")
    assert response.status_code == 404 and response.json()["error"]["code"] == "ai_not_found"


def test_ai_off_makes_no_call(store_root, paper):
    _, pid, _ = paper
    fake = FakeClaude()
    response = _client(store_root, fake).post(f"/api/papers/{pid}/ai")
    assert response.status_code == 409 and response.json()["error"]["code"] == "ai_off"
    assert fake.calls == []


def test_a_pass_saves_the_grounded_answer(store_root, paper):
    store, pid, spans = paper
    fake = FakeClaude(paper=_answer(spans[0]))
    client = _client(store_root, fake)
    _turn_on(client, pid)
    body = client.post(f"/api/papers/{pid}/ai").json()
    assert body["status"] == "done" and body["stale"] is False
    reader = body["ai"]["reader"]
    assert reader["model"] == "claude-opus-5-5"
    assert reader["terms"][0]["explanation"] == "Plain words." and reader["terms"][0]["occurrences"]
    assert [s["slot"] for s in reader["where_to_look"]] == ["Problem"]
    assert f'<span id="{spans[0].id}">' in fake.calls[0][1]
    assert client.get(f"/api/papers/{pid}/ai").json()["status"] == "done"
    assert store.read_ai(pid).extracted_at == store.read_source(pid).extracted_at


@pytest.mark.parametrize("code", ["no_key", "network", "refused", "rate_limited", "api_error", "too_long", "invalid_output"])
def test_a_failed_pass_is_one_plain_line_and_turns_ai_off(store_root, paper, code):
    store, pid, _ = paper
    client = _client(store_root, FakeClaude(error=AiError(code, "a reason")))
    _turn_on(client, pid)
    response = client.post(f"/api/papers/{pid}/ai")
    assert response.status_code == 502
    assert response.json()["error"] == {"code": "ai_failed", "message": "AI help could not run: a reason"}
    assert store.read_view(pid).ai is False and store.read_ai(pid) is None
    # The failure is told once, in the POST's answer; afterwards the paper has no pass, so turning AI on runs it again.
    assert client.get(f"/api/papers/{pid}/ai").json()["error"]["code"] == "ai_not_found"


def test_after_a_failure_a_saved_definition_reports_none_not_failed(store_root, paper):
    store, pid, _ = paper
    from paperboard.ai_model import AiFile
    store.update_ai(pid, lambda _: AiFile(extracted_at=store.read_source(pid).extracted_at, reader=None, defined={}))
    client = _client(store_root, FakeClaude(error=AiError("network", "a reason")))
    _turn_on(client, pid)
    assert client.post(f"/api/papers/{pid}/ai").status_code == 502
    status = client.get(f"/api/papers/{pid}/ai").json()
    assert status["status"] == "none" and status["message"] is None


def test_an_answer_of_the_wrong_shape_fails_plainly(store_root, paper):
    _, pid, _ = paper
    client = _client(store_root, FakeClaude(paper={"terms": "nope"}))
    _turn_on(client, pid)
    assert client.post(f"/api/papers/{pid}/ai").json()["error"]["code"] == "ai_failed"


def test_a_second_pass_while_one_runs_is_refused(store_root, paper):
    import threading
    _, pid, _spans = paper
    entered, release = threading.Event(), threading.Event()

    class Slow(FakeClaude):
        def read_paper(self, system, prompt, schema):
            entered.set()
            release.wait(5)
            return super().read_paper(system, prompt, schema)

    client = _client(store_root, Slow())
    _turn_on(client, pid)
    first = threading.Thread(target=client.post, args=(f"/api/papers/{pid}/ai",))
    first.start()
    entered.wait(5)
    assert client.get(f"/api/papers/{pid}/ai").json()["status"] == "running"
    assert client.post(f"/api/papers/{pid}/ai").json()["error"]["code"] == "ai_running"
    release.set()
    first.join()
    assert client.get(f"/api/papers/{pid}/ai").json()["status"] == "done"


def test_a_pass_never_touches_the_board(store_root, paper):
    store, pid, spans = paper
    before = store.read_board(pid)
    client = _client(store_root, FakeClaude(paper=_answer(spans[0])))
    _turn_on(client, pid)
    client.post(f"/api/papers/{pid}/ai")
    assert store.read_board(pid) == before


def test_an_answer_of_the_wrong_shape_is_reported_as_invalid_output(store_root, paper):
    """ground_pass's ValueError on a bad shape must become AiError('invalid_output', ...),
    never surface as a raw 422 from the app-wide ValueError handler."""
    _, pid, _ = paper
    client = _client(store_root, FakeClaude(paper={"terms": "nope"}))
    _turn_on(client, pid)
    response = client.post(f"/api/papers/{pid}/ai")
    assert response.status_code == 502
    assert response.json()["error"]["code"] == "ai_failed"
    assert response.json()["error"]["message"].startswith("AI help could not run:")


def test_update_ai_never_runs_claude_while_holding_the_lock(store_root, paper):
    """A pass calls Claude, then merges into ai.json with a fast, in-memory
    update: update_ai's single lock must never be held across a network call."""
    store, pid, spans = paper
    calls = []

    class Recording(FakeClaude):
        def read_paper(self, system, prompt, schema):
            # The store's ai lock must be free here: acquiring it must not block.
            acquired = store._ai_lock.acquire(blocking=False)
            calls.append(acquired)
            if acquired:
                store._ai_lock.release()
            return super().read_paper(system, prompt, schema)

    client = _client(store_root, Recording(paper=_answer(spans[0])))
    _turn_on(client, pid)
    client.post(f"/api/papers/{pid}/ai")
    assert calls == [True]


def test_an_unexpected_error_clears_running_instead_of_sticking(store_root, paper, monkeypatch):
    """An exception the handler never anticipated (not AiError, not ValueError) must
    still clear the in-memory "running" state, not leave it stuck: a
    second POST right after must be allowed to try again, not refused as ai_running."""
    _, pid, spans = paper
    client = local_client(create_app(store_root, claude=FakeClaude(paper=_answer(spans[0]))), raise_server_exceptions=False)
    _turn_on(client, pid)

    real_read_source = Store.read_source
    calls = {"n": 0}

    def boom(self, paper_id):
        calls["n"] += 1
        if calls["n"] == 1:
            raise RuntimeError("disk exploded")
        return real_read_source(self, paper_id)

    monkeypatch.setattr(Store, "read_source", boom)

    first = client.post(f"/api/papers/{pid}/ai")
    assert first.status_code == 500

    assert client.get(f"/api/papers/{pid}/ai").status_code == 404

    # The failure also turned view.ai off (as any AI failure does); turn it back on,
    # as the reader would, and confirm the retry is not refused as still "running".
    _turn_on(client, pid)
    second = client.post(f"/api/papers/{pid}/ai")
    assert second.json().get("error", {}).get("code") != "ai_running"
    assert second.json()["status"] == "done"


def test_ai_output_is_never_exported(store_root, paper):
    _, pid, spans = paper
    client = _client(store_root, FakeClaude(paper=_answer(spans[0])))
    _turn_on(client, pid)
    client.post(f"/api/papers/{pid}/ai")
    markdown = client.post(f"/api/papers/{pid}/export", json={"tags": []}).json()["markdown"]
    assert "Plain words." not in markdown


LIGATURE = "Deeper neural networks are more difficult to train."   # printed "difﬁcult"
WRAPPED = ("We explicitly reformulate the layers as learning residual functions with reference to the layer "
           "inputs, instead of learning unreferenced functions.")   # three lines, two of them hyphenated


def _lines(store, pid, spans, quote, span_id="p1-r8"):
    by_id = {s.id: s for s in spans}
    ground = Ground(span=span_id, quote=quote, at=PageRect(page=by_id[span_id].page, rect=by_id[span_id].rect))
    import pymupdf
    with pymupdf.open(store.pdf_path(pid)) as pdf:
        return quote_lines(ground, build_index(store.read_source(pid)), pdf)


def test_a_one_line_quote_with_a_ligature_has_its_line(store_root, paper):
    store, pid, spans = paper
    [line] = _lines(store, pid, spans, LIGATURE)
    span = next(s for s in spans if s.id == "p1-r8")
    assert line.page == 0 and span.rect[1] <= line.rect[1] < line.rect[3] <= span.rect[3]


def test_a_quote_that_wraps_has_one_rect_per_line_in_reading_order(store_root, paper):
    store, pid, spans = paper
    lines = _lines(store, pid, spans, WRAPPED)
    assert len(lines) == 3 and {line.page for line in lines} == {0}
    assert [line.rect[1] for line in lines] == sorted(line.rect[1] for line in lines)
    span = next(s for s in spans if s.id == "p1-r8")
    # It starts after "previously." and stops before "We provide": the sentence's words, not whole lines.
    assert lines[0].rect[0] > span.rect[0] + 20 and lines[-1].rect[2] < span.rect[2] - 20


def test_a_quote_the_paper_does_not_have_has_no_lines(store_root, paper):
    store, pid, spans = paper
    assert _lines(store, pid, spans, "Protein folding is solved by attention alone, we claim.") == []


def _key_sentence_answer():
    return {"terms": [], "where_to_look": [{"slot": "Problem", "spans": [{"span": "p1-r8", "quote": WRAPPED}]}]}


def test_a_pass_saves_each_key_sentence_with_its_lines(store_root, paper):
    store, pid, _ = paper
    client = _client(store_root, FakeClaude(paper=_key_sentence_answer()))
    _turn_on(client, pid)
    [ground] = client.post(f"/api/papers/{pid}/ai").json()["ai"]["reader"]["where_to_look"][0]["spans"]
    assert len(ground["lines"]) == 3
    assert len(store.read_ai(pid).reader.where_to_look[0].spans[0].lines) == 3


def test_get_fills_lines_for_a_pass_saved_without_them_and_writes_nothing(store_root, paper):
    store, pid, _ = paper
    import pymupdf

    from paperboard.ai import run_pass
    from paperboard.ai_model import AiFile
    doc = store.read_source(pid)
    with pymupdf.open(store.pdf_path(pid)) as pdf:
        reader = run_pass(doc, pdf, ["Problem"], FakeClaude(paper=_key_sentence_answer()))
    old = reader.model_copy(update={"where_to_look": [s.model_copy(update={
        "spans": [g.model_copy(update={"lines": []}) for g in s.spans]}) for s in reader.where_to_look]})
    store.update_ai(pid, lambda _: AiFile(extracted_at=doc.extracted_at, reader=old))
    fake = FakeClaude()
    body = _client(store_root, fake).get(f"/api/papers/{pid}/ai").json()
    assert len(body["ai"]["reader"]["where_to_look"][0]["spans"][0]["lines"]) == 3
    assert fake.calls == [] and store.read_ai(pid).reader.where_to_look[0].spans[0].lines == []


def test_an_ai_pass_never_clears_a_question(store_root, paper):
    _, pid, spans = paper
    client = _client(store_root, FakeClaude(paper=_answer(spans[0])))
    before = client.get(f"/api/papers/{pid}/questions").json()
    _turn_on(client, pid)
    client.post(f"/api/papers/{pid}/ai")
    assert client.get(f"/api/papers/{pid}/questions").json() == before
