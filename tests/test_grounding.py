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
    good = {"span": "p1-r1", "quote": "BN"}
    _, where = ground_pass(_raw(where=[{"slot": "Problem", "spans": [good] * 5},
                                       {"slot": "Not a slot", "spans": [good]}]), SPANS, SLOTS)
    assert [s.slot for s in where] == ["Problem"] and len(where[0].spans) == 3


def test_a_slot_with_nothing_grounded_is_dropped():
    _, where = ground_pass(_raw(where=[{"slot": "Evidence", "spans": [{"span": "p1-r1", "quote": "nope"}]}]),
                           SPANS, SLOTS)
    assert where == []


def test_a_wrong_shape_is_a_value_error():
    with pytest.raises(ValueError):
        ground_pass({"terms": "nope"}, SPANS, SLOTS)
