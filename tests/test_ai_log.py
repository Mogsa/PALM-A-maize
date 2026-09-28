"""papers/<id>/ai-log.jsonl (spec B3): one JSON line per call to Claude,
appended only, never rewritten."""

import json
import threading

import pymupdf
import pytest
from conftest import local_client
from fake_claude import FakeClaude

from paperboard.ai_client import AiError
from paperboard.ai_model import AiLogEntry
from paperboard.api import create_app
from paperboard.spans import paper_spans
from paperboard.store import Store
from paperboard.words import page_words


@pytest.fixture
def paper(store_root):
    store = Store(store_root)
    pid = next(p.paper_id for p in store.list_papers() if "residual" in p.paper_id)
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
            "where_to_look": [{"slot": "Problem", "spans": [{"span": span.id, "quote": " ".join(words)}]}]}


def _lines(store, pid):
    path = store.paper_dir(pid) / "ai-log.jsonl"
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line]


# -- the pass ------------------------------------------------------------------

def test_a_pass_writes_one_line_with_its_prompt_raw_grounded_and_route(store_root, paper):
    store, pid, spans = paper
    fake = FakeClaude(paper=_answer(spans[0]))
    client = _client(store_root, fake)
    _turn_on(client, pid)
    client.post(f"/api/papers/{pid}/ai")

    lines = _lines(store, pid)
    assert len(lines) == 1
    entry = AiLogEntry.model_validate(lines[0])
    assert entry.kind == "read" and entry.route == "api" and entry.model == "claude-opus-5-5"
    assert entry.error is None
    assert f'<span id="{spans[0].id}">' in entry.prompt.user
    assert entry.prompt.system.startswith("You help a person read a research paper")
    assert json.loads(entry.raw) == fake.paper
    assert entry.grounded["terms"][0]["explanation"] == "Plain words."


def test_a_failed_pass_writes_a_line_with_an_error(store_root, paper):
    store, pid, _ = paper
    client = _client(store_root, FakeClaude(error=AiError("network", "could not reach the API")))
    _turn_on(client, pid)
    client.post(f"/api/papers/{pid}/ai")

    lines = _lines(store, pid)
    assert len(lines) == 1
    entry = AiLogEntry.model_validate(lines[0])
    assert entry.kind == "read" and entry.grounded is None
    assert entry.error.code == "network" and entry.error.message == "could not reach the API"


# -- define ----------------------------------------------------------------------

@pytest.fixture
def define_setup(store_root):
    store = Store(store_root)
    pid = next(p.paper_id for p in store.list_papers() if "residual" in p.paper_id)
    with pymupdf.open(store.pdf_path(pid)) as pdf:
        spans = paper_spans(store.read_source(pid), pdf)
        span = next(s for s in spans if s.page == 0 and len(s.text.split()) > 20)
        word = next(w for w in page_words(pdf[span.page])
                    if w[4].isalpha() and len(w[4]) > 6 and span.rect[1] <= w[1] and w[3] <= span.rect[3])
    return store, pid, span, word


def _post(client, pid, word):
    return client.post(f"/api/papers/{pid}/ai/define",
                       json={"word": word[4], "page": 0, "rect": list(word[:4]), "definition": None})


def _define_answer(span):
    quote = " ".join(span.text.split()[:4])
    return json.dumps({"explanation": "Plain.", "grounds": [{"span": span.id, "quote": quote}]})


def test_a_define_writes_one_line(store_root, define_setup):
    store, pid, span, word = define_setup
    fake = FakeClaude(deltas=[_define_answer(span)])
    client = _client(store_root, fake)
    _turn_on(client, pid)
    _post(client, pid, word)

    lines = _lines(store, pid)
    assert len(lines) == 1
    entry = AiLogEntry.model_validate(lines[0])
    assert entry.kind == "define" and entry.route == "api" and entry.model == "claude-sonnet-5"
    assert entry.error is None
    assert entry.raw == _define_answer(span)
    assert entry.grounded["explanation"] == "Plain."
    assert word[4] in entry.prompt.user


def test_a_cached_define_writes_no_line(store_root, define_setup):
    store, pid, span, word = define_setup
    fake = FakeClaude(deltas=[_define_answer(span)])
    client = _client(store_root, fake)
    _turn_on(client, pid)
    _post(client, pid, word)
    assert len(_lines(store, pid)) == 1

    _post(client, pid, word)   # answered from the cache: no second call, no second line
    assert len(fake.calls) == 1
    assert len(_lines(store, pid)) == 1


def test_a_failed_define_writes_a_line_with_an_error(store_root, define_setup):
    store, pid, _, word = define_setup
    client = _client(store_root, FakeClaude(error=AiError("timeout", "took too long")))
    _turn_on(client, pid)
    _post(client, pid, word)

    lines = _lines(store, pid)
    assert len(lines) == 1
    entry = AiLogEntry.model_validate(lines[0])
    assert entry.kind == "define" and entry.grounded is None
    assert entry.error.code == "timeout" and entry.error.message == "took too long"


# -- secrets never reach the file -------------------------------------------------

def test_no_key_or_env_value_ever_appears_in_the_log(store_root, paper, monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-not-a-real-key-0451")
    store, pid, spans = paper
    client = _client(store_root, FakeClaude(paper=_answer(spans[0])))
    _turn_on(client, pid)
    client.post(f"/api/papers/{pid}/ai")

    text = (store.paper_dir(pid) / "ai-log.jsonl").read_text(encoding="utf-8")
    assert "sk-not-a-real-key-0451" not in text


# -- concurrency -----------------------------------------------------------------

def test_two_concurrent_appends_do_not_interleave(store_root, paper):
    from datetime import UTC, datetime

    from paperboard.ai_model import AiLogPrompt

    store, pid, _ = paper
    extracted_at = store.read_source(pid).extracted_at

    def entry(n):
        return AiLogEntry(time=datetime.now(UTC), kind="define", model="claude-sonnet-5", route="api",
                          prompt=AiLogPrompt(system="s", user="u" * 500 + str(n)), raw="r" * 500,
                          grounded=None, error=None, extracted_at=extracted_at)

    threads = [threading.Thread(target=store.append_ai_log, args=(pid, entry(n))) for n in range(20)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    lines = (store.paper_dir(pid) / "ai-log.jsonl").read_text(encoding="utf-8").splitlines()
    assert len(lines) == 20
    for line in lines:
        json.loads(line)   # every line parses on its own: none is a fragment of another


def test_a_pass_and_a_define_running_concurrently_each_log_their_own_raw(store_root, define_setup):
    """The client is shared across requests. A Define for one word must never
    end up logging the whole-paper pass's raw answer, or vice versa, even when
    the two run at the same time on that one client instance."""
    from paperboard.ai_client import ReadResult

    store, pid, span, word = define_setup
    with pymupdf.open(store.pdf_path(pid)) as pdf:
        spans = paper_spans(store.read_source(pid), pdf)
    pass_span = next(s for s in spans if s.id != span.id)
    pass_answer = _answer(pass_span)
    define_answer = _define_answer(span)

    entered, release = threading.Event(), threading.Event()

    class Interleaved:
        route = "api"

        def read_paper(self, system, prompt, schema):
            entered.set()
            release.wait(5)   # blocked here while the Define below runs to completion
            return ReadResult(pass_answer, json.dumps(pass_answer))

        def define(self, system, prompt, schema):
            yield define_answer

    claude = Interleaved()
    client = _client(store_root, claude)
    _turn_on(client, pid)

    pass_thread = threading.Thread(target=client.post, args=(f"/api/papers/{pid}/ai",))
    pass_thread.start()
    assert entered.wait(5)

    _post(client, pid, word)   # completes, and logs, while the pass is still inside read_paper

    release.set()
    pass_thread.join(5)

    lines = _lines(store, pid)
    assert len(lines) == 2
    by_kind = {entry["kind"]: entry for entry in lines}
    assert json.loads(by_kind["read"]["raw"]) == pass_answer
    assert by_kind["define"]["raw"] == define_answer
