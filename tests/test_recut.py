"""Split here, Cut out and Join (addendum 4.10, D21): pieces between printed lines,
in paper order, and neighbours joined back exactly."""

import pymupdf
import pytest
from conftest import FIXTURES

from paperboard.board_model import Board, ChunkData, ChunkNode, QuoteSelector
from paperboard.chunk_text import QuoteNotFound
from paperboard.recut import recut
from paperboard.split import split

SHORTCUTS = QuoteSelector(exact="The shortcut connections in Eqn.(1) introduce neither extra parameter nor computation complexity.")


@pytest.fixture(scope="module")
def resnet(extracted):
    doc = extracted["resnet"]
    pdf = pymupdf.open(FIXTURES["resnet"])
    yield doc, pdf
    pdf.close()


@pytest.fixture(scope="module")
def sections(resnet):
    doc, pdf = resnet
    drafts = split(doc, Board(paper_id=doc.paper_id), pdf)
    by_number = {s.id: s.number for s in doc.sections}
    return {by_number[d["data"]["source_id"]]: ChunkData.model_validate(d["data"])
            for d in drafts if d["type"] == "chunk" and d["data"]["source_id"] in by_number}


def _text(data: ChunkData) -> str:
    return " ".join(" ".join(b.text.split()) for b in data.blocks if b.kind == "text")


def _pieces(drafts: list[dict]) -> list[ChunkData]:
    for draft in drafts:
        assert set(draft) == {"type", "data"} and draft["type"] == "chunk"     # no id, position or parentId
        ChunkNode.model_validate({**draft, "id": "n-1", "position": {"x": 0, "y": 0}})
    return [ChunkData.model_validate(d["data"]) for d in drafts]


def test_split_here_divides_the_chunk_at_the_line_the_selection_starts_on(resnet, sections):
    doc, pdf = resnet
    whole = sections["3.2"]
    before, after = _pieces(recut(doc, pdf, whole.region, SHORTCUTS, "split"))
    assert _text(after).startswith("The shortcut connections in Eqn.(1)")
    assert _text(before).endswith("after the addition (i.e., σ(y), see Fig. 2).")
    assert f"{_text(before)} {_text(after)}" == _text(whole)          # nothing lost, nothing twice, paper order


def test_cut_out_makes_three_pieces_in_paper_order_and_the_middle_is_the_lines_selected(resnet, sections):
    doc, pdf = resnet
    whole = sections["3.2"]
    before, middle, after = _pieces(recut(doc, pdf, whole.region, SHORTCUTS, "cut"))
    assert _text(middle).startswith("The shortcut connections") and _text(middle).endswith("This is not only")
    assert " ".join(_text(p) for p in (before, middle, after)) == _text(whole)
    for piece in (before, middle, after):
        assert piece.region.start.exact and piece.region.end.exact and piece.region.state == "anchored"


def test_a_selection_on_the_first_line_leaves_nothing_to_divide(resnet, sections):
    """Review Focus 4: one piece back, and the client changes nothing."""
    doc, pdf = resnet
    whole = sections["3.2"]
    assert len(recut(doc, pdf, whole.region, QuoteSelector(exact="3.2. Identity Mapping by Shortcuts"), "split")) == 1


def test_a_cut_of_words_outside_the_chunk_is_refused(resnet, sections):
    doc, pdf = resnet
    with pytest.raises(QuoteNotFound):
        recut(doc, pdf, sections["3.2"].region, QuoteSelector(exact="Let us consider H(x) as an underlying mapping"), "cut")
