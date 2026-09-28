import pytest

from paperboard.grounding import ground_all, ground_pass, normalise
from paperboard.spans import Span

SPANS = {
    "p1-r1": Span("p1-r1", 0, (0, 0, 100, 20), "We call this   Batch\nNormalization (BN)."),
    "p2-r3": Span("p2-r3", 1, (0, 40, 100, 60), "BN makes trainﬁng stable; a trade-\noff remains."),
}
SLOTS = ["Problem", "Evidence"]


def _raw(terms=(), where=()):
    return {"terms": list(terms), "where_to_look": list(where)}


def test_normalise_collapses_whitespace_and_ligatures_and_line_hyphens():
    assert normalise("a  \n bﬁ trade-\noff") == "a bfi tradeoff"


def test_a_true_quote_is_kept_with_its_span_rect():
    [g] = ground_all([{"span": "p1-r1", "quote": "Batch Normalization"}], SPANS)
    assert g.at.page == 0 and g.at.rect == (0, 0, 100, 20)


def test_a_quote_not_in_its_span_is_dropped():
    assert ground_all([{"span": "p1-r1", "quote": "makes training stable"}], SPANS) == []


def test_an_unknown_span_is_dropped():
    assert ground_all([{"span": "p9-r9", "quote": "BN"}], SPANS) == []


def test_a_quote_with_a_ligature_survives():
    assert len(ground_all([{"span": "p2-r3", "quote": "makes trainfing stable"}], SPANS)) == 1


def test_a_term_with_no_surviving_grounds_keeps_defined_in_and_loses_its_explanation():
    terms, _ = ground_pass(_raw(terms=[{
        "term": "BN", "defined_in": [{"span": "p1-r1", "quote": "Batch Normalization (BN)"}],
        "explanation": "A layer that rescales.", "grounds": [{"span": "p1-r1", "quote": "not there"}],
    }]), SPANS, SLOTS)
    assert terms[0].explanation is None and len(terms[0].defined_in) == 1


def test_a_term_with_nothing_grounded_at_all_is_dropped():
    terms, _ = ground_pass(_raw(terms=[{"term": "X", "defined_in": [], "explanation": "e",
                                        "grounds": [{"span": "p9-r1", "quote": "x"}]}]), SPANS, SLOTS)
    assert terms == []


def test_a_slot_keeps_at_most_three_spans_and_unknown_slots_are_dropped():
    spans = {f"p1-r{i}": Span(f"p1-r{i}", 0, (0, 20 * i, 100, 20 * i + 20), "BN here.") for i in range(1, 6)}
    grounds = [{"span": sid, "quote": "BN"} for sid in spans]
    _, where = ground_pass(_raw(where=[{"slot": "Problem", "spans": grounds},
                                       {"slot": "Not a slot", "spans": grounds}]), spans, SLOTS)
    assert [s.slot for s in where] == ["Problem"] and [g.span for g in where[0].spans] == ["p1-r1", "p1-r2", "p1-r3"]


def test_a_slot_names_each_span_once_before_it_is_cut():
    same = {"span": "p1-r1", "quote": "BN"}
    other = {"span": "p2-r3", "quote": "BN"}
    _, where = ground_pass(_raw(where=[{"slot": "Problem", "spans": [same] * 4 + [other]}]), SPANS, SLOTS)
    assert [g.span for g in where[0].spans] == ["p1-r1", "p2-r3"]


def test_a_slot_with_nothing_grounded_is_dropped():
    _, where = ground_pass(_raw(where=[{"slot": "Evidence", "spans": [{"span": "p1-r1", "quote": "nope"}]}]),
                           SPANS, SLOTS)
    assert where == []


def test_a_wrong_shape_is_a_value_error():
    with pytest.raises(ValueError):
        ground_pass({"terms": "nope"}, SPANS, SLOTS)
