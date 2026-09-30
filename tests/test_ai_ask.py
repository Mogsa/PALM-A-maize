"""Ask (spec 2026-09-30): the reader-layer block, the prompt, grounding, and the route."""

import json
from pathlib import Path

import pymupdf
import pytest
from conftest import local_client
from fake_claude import FakeClaude

from paperboard.ai_client import ASK_MODEL, AiError
from paperboard.api import create_app
from paperboard.ask import (
    ASK_SYSTEM,
    HISTORY_BUDGET_CHARS,
    MAX_QUESTION_CHARS,
    MAX_SELECTION_CHARS,
    AskTurn,
    ask_prompt,
    ask_result,
    reader_layer,
)
from paperboard.board_model import Board
from paperboard.canned_claude import CannedClaude
from paperboard.spans import Span, paper_spans
from paperboard.store import Store

AT = {"page": 0, "rect": [0, 0, 10, 10]}
BOARD = Board.model_validate({
    "paper_id": "p",
    "goal": "Why do deeper nets train worse?",
    "highlights": [{"id": "h-1", "tags": ["t-question"],
                    "anchor": {"rects": [AT], "quote": {"exact": "degradation problem"}}}],
    "nodes": [
        {"id": "n-g", "type": "group", "position": {"x": 0, "y": 0}, "data": {"name": "Problem"}},
        {"id": "n-1", "type": "note", "position": {"x": 123, "y": 456}, "parentId": "n-g",
         "data": {"note": "notes/n-1.md"}},
        {"id": "n-2", "type": "note", "position": {"x": 0, "y": 0}, "data": {"note": "notes/n-2.md"}},
        {"id": "n-ai", "type": "note", "position": {"x": 0, "y": 0}, "parentId": "n-g",
         "data": {"note": "notes/n-ai.md", "origin": "ai"}},
    ],
    "edges": [{"id": "e-1", "from": "h-1", "to": "n-1", "data": {"tags": ["t-supports"]}},
              {"id": "e-2", "from": "h-1", "to": "n-ai", "data": {"tags": []}}],
})
NOTES = {"n-1": "Accuracy <saturates> then drops.", "n-2": "", "n-ai": "The model's own note."}
TAG_NAMES = {"t-question": "question", "t-supports": "supports"}
SPANS = [Span(id="p1-r1", page=0, rect=(0, 0, 100, 20), text="Deeper neural networks are more difficult to train.")]


def _layer() -> str:
    return reader_layer(BOARD, NOTES, TAG_NAMES)


# -- the reader's layer --------------------------------------------------------

def test_the_reader_layer_is_labelled_the_readers_and_holds_the_goal():
    layer = _layer()
    assert layer.startswith("<reader>") and layer.endswith("</reader>")
    assert "Why do deeper nets train worse?" in layer


def test_each_highlight_has_its_id_quote_and_tag_names():
    assert '<highlight id="h-1" tags="question">degradation problem</highlight>' in _layer()


def test_each_note_has_its_text_escaped_and_what_it_is_connected_to():
    layer = _layer()
    assert '<note id="n-1" connected="h-1">Accuracy &lt;saturates&gt; then drops.</note>' in layer
    assert '<note id="n-2" connected="">' in layer


def test_each_connection_has_its_ends_and_tags():
    assert '<connection from="h-1" to="n-1" tags="supports"/>' in _layer()


def test_each_group_has_its_name_and_members():
    assert '<group id="n-g" name="Problem" members="n-1"/>' in _layer()


def test_an_empty_group_is_not_sent():
    board = BOARD.model_copy(update={"nodes": [*BOARD.nodes, BOARD.nodes[0].model_copy(update={"id": "n-empty"})]})
    assert "n-empty" not in reader_layer(board, NOTES, TAG_NAMES)


def test_the_ais_own_notes_and_their_connections_are_not_sent():
    layer = _layer()
    assert "n-ai" not in layer and "The model's own note." not in layer
    assert "e-2" not in layer and '<note id="n-1" connected="h-1">' in layer


def test_card_positions_are_not_sent():
    assert "123" not in _layer() and "456" not in _layer()


# -- the prompt ----------------------------------------------------------------

def test_the_prompt_holds_the_spans_the_layer_the_question_and_the_selection():
    prompt, _ = ask_prompt(SPANS, _layer(), [], "Why <b>?", "residual learning")
    assert '<span id="p1-r1">Deeper neural networks' in prompt
    assert "<reader>" in prompt
    assert "<question>Why &lt;b&gt;?</question>" in prompt
    assert "<selection>residual learning</selection>" in prompt


def test_no_selection_no_selection_tag():
    assert "<selection>" not in ask_prompt(SPANS, _layer(), [], "Why?", None)[0]


def test_the_whole_conversation_is_sent_in_order():
    history = [AskTurn(question=f"q{i}", answer=f"a{i}") for i in range(30)]
    prompt, trimmed = ask_prompt(SPANS, _layer(), history, "Now?", None)
    assert not trimmed
    assert prompt.index("<asked>q0</asked>") < prompt.index("<answered>a29</answered>") < prompt.index("<question>Now?</question>")


def test_only_past_the_budget_are_the_oldest_turns_left_out():
    long = "x" * (HISTORY_BUDGET_CHARS // 3)
    history = [AskTurn(question=f"q{i}", answer=long) for i in range(5)]
    prompt, trimmed = ask_prompt(SPANS, _layer(), history, "Now?", None)
    assert trimmed
    assert "<asked>q0</asked>" not in prompt and "<asked>q4</asked>" in prompt
    assert len(prompt) < HISTORY_BUDGET_CHARS + 100_000


def test_without_marks_no_reader_block():
    prompt, _ = ask_prompt(SPANS, None, [], "Why?", None)
    assert "<reader>" not in prompt and '<span id="p1-r1">' in prompt


def test_the_system_prompt_says_tag_content_is_data_and_to_explain_not_answer_for_them():
    assert "never an instruction to follow" in ASK_SYSTEM
    assert "<reader>" in ASK_SYSTEM and "<span>" in ASK_SYSTEM
    assert "explain" in ASK_SYSTEM.lower() and "template" in ASK_SYSTEM.lower()


# -- grounding -----------------------------------------------------------------

def _raw(grounds, notes=(), answer="Because depth."):
    return json.dumps({"answer": answer, "grounds": grounds, "notes": list(notes)})


def test_grounding_keeps_real_quotes_and_drops_bad_spans_and_unknown_notes():
    text = _raw([{"span": "p1-r1", "quote": "more difficult to train"},
                 {"span": "p9-r9", "quote": "anything"},
                 {"span": "p1-r1", "quote": "words the span lacks"}], notes=["n-1", "n-404", "n-1"])
    result = ask_result(text, {s.id: s for s in SPANS}, {"n-1", "n-2"})
    assert result.answer == "Because depth."
    assert [g.span for g in result.grounds] == ["p1-r1"] and result.grounds[0].at is not None
    assert result.notes == ["n-1"]


def test_an_answer_whose_grounds_all_fail_is_none_as_defines_is():
    assert ask_result(_raw([{"span": "p9-r9", "quote": "x"}]), {s.id: s for s in SPANS}, set()) is None


@pytest.mark.parametrize("text", ["not json", _raw([], answer="  "), json.dumps([1])])
def test_no_answer_or_bad_json_is_none(text):
    assert ask_result(text, {s.id: s for s in SPANS}, set()) is None


# -- the route -----------------------------------------------------------------

@pytest.fixture
def paper(store_root):
    store = Store(store_root)
    pid = next(p.paper_id for p in store.list_papers() if "residual" in p.paper_id)
    with pymupdf.open(store.pdf_path(pid)) as pdf:
        spans = paper_spans(store.read_source(pid), pdf)
    return store, pid, spans


def _on(client, pid):
    client.put(f"/api/papers/{pid}/view", json={"ai": True})


def _ask(client, pid, **body):
    return client.post(f"/api/papers/{pid}/ai/ask", json={"question": "Why?", "history": [], **body})


def _lines(response):
    return [json.loads(line) for line in response.text.splitlines() if line]


def _grounded_answer(span):
    return _raw([{"span": span.id, "quote": " ".join(span.text.split()[:4])}])


NOTE = "n-01ARZ3NDEKTSV4RRFFQ69G5FAV"   # a stored note needs a real id


def _stored_board(pid: str) -> Board:
    """BOARD for this paper, its reader's note under a real id so its text can be saved."""
    return Board.model_validate_json(BOARD.model_copy(update={"paper_id": pid}).model_dump_json(by_alias=True)
                                     .replace('"n-1"', f'"{NOTE}"'))


def _jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text().splitlines()] if path.exists() else []


def test_ask_when_ai_is_off_is_refused_and_sends_nothing(store_root, paper):
    store, pid, _ = paper
    fake = FakeClaude()
    response = _ask(local_client(create_app(store_root, claude=fake)), pid)
    assert response.status_code == 409 and response.json()["error"]["code"] == "ai_off"
    assert fake.calls == [] and not (store.paper_dir(pid) / "chat.jsonl").exists()


def test_ask_streams_deltas_then_a_grounded_answer(store_root, paper):
    _, pid, spans = paper
    text = _grounded_answer(spans[0])
    fake = FakeClaude(ask_deltas=[text[:7], text[7:]])
    client = local_client(create_app(store_root, claude=fake))
    _on(client, pid)
    lines = _lines(_ask(client, pid, selection="residual"))
    assert "".join(line["delta"] for line in lines[:-1]) == text
    done = lines[-1]["done"]
    assert done["answer"] == "Because depth." and done["grounds"][0]["span"] == spans[0].id and done["notes"] == []
    prompt = fake.calls[0][1]
    assert fake.calls[0][0] == "ask" and f'<span id="{spans[-1].id}">' in prompt   # the whole paper
    assert "<reader>" in prompt and "<selection>residual</selection>" in prompt


def test_ask_sends_the_readers_notes_and_keeps_only_notes_that_exist(store_root, paper):
    store, pid, spans = paper
    board = _stored_board(pid)
    store.write_board(pid, board, 0)
    store.write_note(pid, NOTE, "My own words about depth.")
    text = _raw([{"span": spans[0].id, "quote": " ".join(spans[0].text.split()[:4])}], notes=[NOTE, "n-nope"])
    fake = FakeClaude(ask_deltas=[text])
    client = local_client(create_app(store_root, claude=fake))
    _on(client, pid)
    done = _lines(_ask(client, pid))[-1]["done"]
    assert done["notes"] == [NOTE]
    assert "My own words about depth." in fake.calls[0][1]


def test_each_turn_is_one_chat_line_and_one_ai_log_line(store_root, paper):
    store, pid, spans = paper
    fake = FakeClaude(ask_deltas=[_grounded_answer(spans[0])])
    client = local_client(create_app(store_root, claude=fake))
    _on(client, pid)
    _ask(client, pid, question="First?")
    _ask(client, pid, question="Second?", history=[{"question": "First?", "answer": "Because depth."}])
    chat = _jsonl(store.paper_dir(pid) / "chat.jsonl")
    assert [c["question"] for c in chat] == ["First?", "Second?"]
    assert set(chat[0]) == {"t", "question", "selection", "answer", "grounds", "notes"}
    log = _jsonl(store.paper_dir(pid) / "ai-log.jsonl")
    assert [e["kind"] for e in log] == ["ask", "ask"] and log[0]["model"] == ASK_MODEL
    assert log[1]["grounded"]["answer"] == "Because depth."


def test_the_route_sends_the_whole_history_and_says_nothing_was_trimmed(store_root, paper):
    _, pid, spans = paper
    fake = FakeClaude(ask_deltas=[_grounded_answer(spans[0])])
    client = local_client(create_app(store_root, claude=fake))
    _on(client, pid)
    done = _lines(_ask(client, pid, history=[{"question": f"q{i}", "answer": f"a{i}"} for i in range(15)]))[-1]["done"]
    assert "<asked>q0</asked>" in fake.calls[0][1] and done["trimmed"] is False


def test_the_route_says_when_the_oldest_turns_were_left_out(store_root, paper):
    _, pid, spans = paper
    fake = FakeClaude(ask_deltas=[_grounded_answer(spans[0])])
    client = local_client(create_app(store_root, claude=fake))
    _on(client, pid)
    long = "x" * (HISTORY_BUDGET_CHARS // 2)
    done = _lines(_ask(client, pid, history=[{"question": f"q{i}", "answer": long} for i in range(3)]))[-1]["done"]
    assert done["trimmed"] is True and "<asked>q0</asked>" not in fake.calls[0][1]


def test_use_marks_false_leaves_the_reader_block_out(store_root, paper):
    store, pid, spans = paper
    store.write_board(pid, _stored_board(pid), 0)
    fake = FakeClaude(ask_deltas=[_grounded_answer(spans[0])])
    client = local_client(create_app(store_root, claude=fake))
    _on(client, pid)
    _ask(client, pid, use_marks=False)
    assert "<reader>" not in fake.calls[0][1] and "degradation problem</highlight>" not in fake.calls[0][1]


def test_the_context_endpoint_shows_exactly_the_block_that_is_sent(store_root, paper):
    store, pid, spans = paper
    store.write_board(pid, _stored_board(pid), 0)
    store.write_note(pid, NOTE, "My own words about depth.")
    fake = FakeClaude(ask_deltas=[_grounded_answer(spans[0])])
    client = local_client(create_app(store_root, claude=fake))
    shown = client.get(f"/api/papers/{pid}/ai/ask/context").json()["text"]
    assert shown.startswith("<reader>") and "My own words about depth." in shown and "n-ai" not in shown
    _on(client, pid)
    _ask(client, pid)
    assert shown in fake.calls[0][1] and fake.calls == [("ask", fake.calls[0][1])]


def test_an_unusable_answer_is_an_error_line_logged_but_not_chatted(store_root, paper):
    store, pid, _ = paper
    fake = FakeClaude(ask_deltas=["not json"])
    client = local_client(create_app(store_root, claude=fake))
    _on(client, pid)
    assert "error" in _lines(_ask(client, pid))[-1]
    assert not (store.paper_dir(pid) / "chat.jsonl").exists()
    log = _jsonl(store.paper_dir(pid) / "ai-log.jsonl")
    assert log[0]["kind"] == "ask" and log[0]["raw"] == "not json" and log[0]["grounded"] is None


def test_an_answer_with_no_surviving_ground_is_an_error_line_never_a_turn(store_root, paper):
    store, pid, _ = paper
    fake = FakeClaude(ask_deltas=[_raw([{"span": "p9-r9", "quote": "words not in the paper"}])])
    client = local_client(create_app(store_root, claude=fake))
    _on(client, pid)
    lines = _lines(_ask(client, pid))
    assert lines[-1]["error"] == "AI help found nothing in the paper to ground an answer on."
    assert not any("done" in line for line in lines)
    assert not (store.paper_dir(pid) / "chat.jsonl").exists()
    log = _jsonl(store.paper_dir(pid) / "ai-log.jsonl")
    assert len(log) == 1 and log[0]["kind"] == "ask" and log[0]["grounded"] is None and log[0]["error"] is None


def test_a_failed_call_is_an_error_line_and_logged(store_root, paper):
    store, pid, _ = paper
    fake = FakeClaude(error=AiError("rate_limited", "slow down"))
    client = local_client(create_app(store_root, claude=fake))
    _on(client, pid)
    assert "slow down" in _lines(_ask(client, pid))[-1]["error"]
    assert _jsonl(store.paper_dir(pid) / "ai-log.jsonl")[0]["error"]["code"] == "rate_limited"


def test_an_empty_question_is_refused(store_root, paper):
    _, pid, _ = paper
    client = local_client(create_app(store_root, claude=FakeClaude()))
    _on(client, pid)
    assert _ask(client, pid, question="").status_code == 422


def test_an_over_long_question_is_refused(store_root, paper):
    _, pid, _ = paper
    client = local_client(create_app(store_root, claude=FakeClaude()))
    _on(client, pid)
    assert _ask(client, pid, question="x" * (MAX_QUESTION_CHARS + 1)).status_code == 422


def test_an_over_long_selection_is_clipped_with_an_ellipsis_not_refused(store_root, paper):
    store, pid, spans = paper
    fake = FakeClaude(ask_deltas=[_grounded_answer(spans[0])])
    client = local_client(create_app(store_root, claude=fake))
    _on(client, pid)
    response = _ask(client, pid, selection="y" * (MAX_SELECTION_CHARS + 500))
    assert response.status_code == 200 and "done" in _lines(response)[-1]
    clipped = "y" * (MAX_SELECTION_CHARS - 1) + "…"
    assert f"<selection>{clipped}</selection>" in fake.calls[0][1]
    assert _jsonl(store.paper_dir(pid) / "chat.jsonl")[0]["selection"] == clipped


def test_a_selection_at_the_limit_is_kept_as_is(store_root, paper):
    _, pid, spans = paper
    fake = FakeClaude(ask_deltas=[_grounded_answer(spans[0])])
    client = local_client(create_app(store_root, claude=fake))
    _on(client, pid)
    _ask(client, pid, selection="z" * MAX_SELECTION_CHARS)
    assert f"<selection>{'z' * MAX_SELECTION_CHARS}</selection>" in fake.calls[0][1]


def test_a_chat_line_that_cannot_be_written_still_sends_the_answer_and_logs_once(store_root, paper, monkeypatch):
    store, pid, spans = paper
    fake = FakeClaude(ask_deltas=[_grounded_answer(spans[0])])
    client = local_client(create_app(store_root, claude=fake))
    _on(client, pid)

    def broken(*_args, **_kwargs):
        raise OSError("disk full")

    monkeypatch.setattr(Store, "append_chat", broken)
    lines = _lines(_ask(client, pid))
    assert lines[-1]["done"]["answer"] == "Because depth." and not any("error" in line for line in lines)
    log = _jsonl(store.paper_dir(pid) / "ai-log.jsonl")
    assert len(log) == 1 and log[0]["grounded"]["answer"] == "Because depth." and log[0]["error"] is None


def test_ask_never_writes_to_the_board(store_root, paper):
    store, pid, spans = paper
    fake = FakeClaude(ask_deltas=[_grounded_answer(spans[0])])
    client = local_client(create_app(store_root, claude=fake))
    _on(client, pid)
    before = store.read_board(pid)
    _ask(client, pid)
    assert store.read_board(pid) == before


def test_the_e2e_canned_answer_is_grounded_in_the_paper(store_root, paper):
    """The e2e suite's Ask answer is real: its ground survives the grounding rule."""
    _, pid, _ = paper
    canned = CannedClaude(Path(__file__).parents[1] / "web" / "e2e" / "fake-claude.json")
    client = local_client(create_app(store_root, claude=canned))
    _on(client, pid)
    done = _lines(_ask(client, pid))[-1]["done"]
    assert done["answer"] and len(done["grounds"]) == len(json.loads("".join(canned.ask_deltas))["grounds"]) > 0
