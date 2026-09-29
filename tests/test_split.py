"""Split (D16, addendum section 6): a draft piece for every section and figure the
board is missing, anchored per section 5.1, in paper order, writing nothing."""

import pymupdf
import pytest
from conftest import FIXTURES

from paperboard.anchoring import build_index, resolve_chunk
from paperboard.board_model import Board, ChunkAnchor, ChunkNode, FigureNode
from paperboard.geometry import contains_point, midpoint
from paperboard.split import TRAY_STEP, TRAY_TOP, split


@pytest.fixture(scope="module")
def papers(extracted):
    opened = {name: pymupdf.open(path) for name, path in FIXTURES.items()}
    yield {name: (extracted[name], opened[name]) for name in FIXTURES}
    for pdf in opened.values():
        pdf.close()


def _empty(doc) -> Board:
    return Board(paper_id=doc.paper_id)


def _node(draft: dict, node_id: str):
    model = ChunkNode if draft["type"] == "chunk" else FigureNode
    return model.model_validate({**draft, "id": node_id})


def test_an_empty_board_gets_every_section_and_figure_once_as_a_collapsed_draft(papers):
    doc, pdf = papers["resnet"]
    drafts = split(doc, _empty(doc), pdf)
    ids = [d["data"]["source_id"] for d in drafts]
    assert sorted(ids) == sorted([s.id for s in doc.sections] + [f.id for f in doc.figures])
    for i, draft in enumerate(drafts):
        assert "id" not in draft and "parentId" not in draft
        assert draft["data"]["collapsed"] is True
        assert draft["position"]["y"] == TRAY_TOP + i * TRAY_STEP
        _node(draft, f"n-{i}")   # a valid node once the client mints its id


def test_drafts_are_in_paper_order_across_sections_and_figures(papers):
    doc, pdf = papers["resnet"]
    ids = [d["data"]["source_id"] for d in split(doc, _empty(doc), pdf)]
    sections = [s.id for s in doc.sections]
    assert [i for i in ids if i in sections] == sections   # sections keep their own order
    assert ids.index("fig-1") < ids.index("sec-3")          # Figure 1 is on page 0, section 2 on page 1


def test_a_section_draft_is_a_chunk_of_its_extent_anchored_on_its_heading_and_end(papers):
    doc, pdf = papers["resnet"]
    section = next(s for s in doc.sections if s.number == "3.1")
    draft = next(d for d in split(doc, _empty(doc), pdf) if d["data"]["source_id"] == section.id)
    node = _node(draft, "n-1")
    assert node.type == "chunk"
    region = node.data.region
    assert region.rects == section.extent
    assert region.start.exact.split()[-2:] == section.title.split()[-2:]
    assert region.start.suffix and region.end.exact and region.end.prefix
    assert region.end.exact.split()[-1] in doc.page_text[section.extent[-1].page].text
    assert node.data.blocks and node.data.blocks[0].kind == "text"


def test_a_figure_draft_is_one_rect_holding_the_figure_and_its_caption(papers):
    doc, pdf = papers["resnet"]
    figure = next(f for f in doc.figures if f.id == "fig-1")
    draft = next(d for d in split(doc, _empty(doc), pdf) if d["data"]["source_id"] == figure.id)
    assert draft["type"] == "figure"
    assert draft["data"]["clip"] is None and draft["data"]["clip_size"] is None
    node = _node(draft, "n-1")
    [rect] = node.data.region.rects
    assert rect.page == figure.rect.page
    assert contains_point(rect.rect, *midpoint(figure.rect.rect)) and contains_point(rect.rect, *midpoint(figure.caption_rect.rect))
    assert node.data.caption == figure.caption
    assert node.data.region.start.exact.startswith("Figure 1")
    assert node.data.region.end.exact == ""


@pytest.mark.parametrize("name", sorted(FIXTURES))
def test_every_draft_stays_anchored_on_the_unchanged_paper(papers, name):
    doc, pdf = papers[name]
    index = build_index(doc)
    failures = {}
    for draft in split(doc, _empty(doc), pdf):
        region = ChunkAnchor.model_validate(draft["data"]["region"])
        resolved = resolve_chunk(region, index, pdf, doc)
        if resolved.state != "anchored" or resolved.rects != region.rects:
            failures[draft["data"]["source_id"]] = resolved.state
    assert failures == {}


def test_pieces_already_on_the_board_are_left_out_and_the_rest_keep_their_place(papers):
    doc, pdf = papers["resnet"]
    everything = split(doc, _empty(doc), pdf)
    board = Board(paper_id=doc.paper_id, nodes=[_node(everything[1], "n-a"), _node(everything[3], "n-b")])
    rest = split(doc, board, pdf)
    assert rest == [d for i, d in enumerate(everything) if i not in (1, 3)]
