import pymupdf
import pytest
from conftest import FIXTURES

from paperboard.board_model import (
    Board,
    ChunkAnchor,
    ChunkNode,
    Edge,
    FigureNode,
    Highlight,
    HighlightAnchor,
    NoteNode,
    QuoteSelector,
)
from paperboard.export import export_markdown, highlights_in
from paperboard.geometry import contains_point, midpoint
from paperboard.snap import text_under
from paperboard.source_model import PageRect


@pytest.fixture(scope="module")
def resnet(extracted):
    pdf = pymupdf.open(FIXTURES["resnet"])
    yield extracted["resnet"], pdf
    pdf.close()


def _board(doc):
    intro = next(s for s in doc.sections if s.number == "1")
    method = next(s for s in doc.sections if s.number == "3.1")
    figure = next(f for f in doc.figures if f.label == "Figure 1")

    def region(section):
        return ChunkAnchor(rects=section.extent, start=QuoteSelector(exact=section.title),
                           end=QuoteSelector(exact=section.text[-40:]))

    inside = HighlightAnchor(page=method.extent[0].page,
                             rect=(method.extent[0].rect[0] + 2, method.extent[0].rect[1] + 20,
                                   method.extent[0].rect[2] - 2, method.extent[0].rect[1] + 40),
                             quote=QuoteSelector(exact="a passage inside 3.1"))
    outside = HighlightAnchor(page=9, rect=(60.0, 300.0, 280.0, 320.0), quote=QuoteSelector(exact="a passage on page 10"))
    return Board(
        paper_id=doc.paper_id, goal="understand residual blocks",
        nodes=[
            ChunkNode(id="n-method", type="chunk", position={"x": 0, "y": 0},
                      data={"tags": ["t-method"], "collapsed": False, "region": region(method).model_dump(), "text": method.text}),
            ChunkNode(id="n-intro", type="chunk", position={"x": 0, "y": 0},
                      data={"tags": ["t-claim"], "collapsed": False, "region": region(intro).model_dump(), "text": intro.text}),
            FigureNode(id="n-fig", type="figure", position={"x": 0, "y": 0},
                       data={"tags": ["t-evidence"], "collapsed": False,
                             "region": ChunkAnchor(rects=[figure.rect], start=QuoteSelector(exact=figure.caption), end=QuoteSelector(exact=figure.caption)).model_dump(),
                             "clip": "clips/n-fig.png", "clip_size": {"width": 436, "height": 300}, "caption": figure.caption}),
            NoteNode(id="n-note", type="note", position={"x": 0, "y": 0}, data={"tags": [], "collapsed": False, "note": "notes/n-note.md"}),
            NoteNode(id="n-loose", type="note", position={"x": 0, "y": 0}, data={"tags": ["t-question"], "collapsed": False, "note": "notes/n-loose.md"}),
        ],
        edges=[Edge(id="e-1", source="n-method", sourceHandle="h-in", target="n-note", data={"tags": ["t-supports"]})],
        highlights=[Highlight(id="h-in", tags=["t-question"], note="n-note", anchor=inside),
                    Highlight(id="h-out", tags=[], note=None, anchor=outside)],
    )


NOTES = {"n-note": "The block learns F(x) = H(x) - x.\n", "n-loose": "What is a bottleneck?\n"}


def test_highlights_in_uses_geometry(resnet):
    doc, _ = resnet
    board = _board(doc)
    method = next(n for n in board.nodes if n.id == "n-method")
    intro = next(n for n in board.nodes if n.id == "n-intro")
    assert [h.id for h in highlights_in(board, method)] == ["h-in"]
    assert highlights_in(board, intro) == []


def test_export_follows_the_papers_order_not_the_boards(resnet):
    doc, pdf = resnet
    md = export_markdown(doc, _board(doc), NOTES, pdf, tags=[])
    assert md.index("understand residual blocks") < md.index("1. Introduction")
    assert md.index("1. Introduction") < md.index("Figure 1") < md.index("3.1. Residual Learning")


def test_export_places_highlight_and_its_note_under_the_chunk(resnet):
    doc, pdf = resnet
    md = export_markdown(doc, _board(doc), NOTES, pdf, tags=[])
    section = md[md.index("3.1. Residual Learning"):]
    assert "> a passage inside 3.1" in section
    assert "F(x) = H(x) - x" in section
    assert md.index("a passage inside 3.1") < md.index("F(x) = H(x) - x")


def test_export_has_figure_image_and_loose_sections(resnet):
    doc, pdf = resnet
    md = export_markdown(doc, _board(doc), NOTES, pdf, tags=[])
    assert "![Figure 1](clips/n-fig.png)" in md
    assert "## Highlights outside any chunk" in md and "a passage on page 10" in md
    assert "## Notes" in md and "What is a bottleneck?" in md


def test_tag_filter_keeps_only_tagged_things(resnet):
    doc, pdf = resnet
    md = export_markdown(doc, _board(doc), NOTES, pdf, tags=["t-claim"])
    assert "1. Introduction" in md
    assert "3.1. Residual Learning" not in md
    assert "Figure 1" not in md


def test_highlight_note_field_links_a_note_without_an_edge(resnet):
    doc, pdf = resnet
    anchor = HighlightAnchor(page=9, rect=(60.0, 300.0, 280.0, 320.0),
                              quote=QuoteSelector(exact="a lone highlight"))
    board = Board(
        paper_id=doc.paper_id,
        nodes=[NoteNode(id="n-1", type="note", position={"x": 0, "y": 0},
                         data={"tags": [], "collapsed": False, "note": "notes/n-1.md"})],
        highlights=[Highlight(id="h-x", tags=[], note="n-1", anchor=anchor)],
    )
    notes = {"n-1": "This is the note body.\n"}
    md = export_markdown(doc, board, notes, pdf, tags=[])
    assert md.index("a lone highlight") < md.index("This is the note body.")
    assert md.count("This is the note body.") == 1
    assert "## Notes" not in md


def test_highlight_note_field_and_edge_agreeing_prints_once(resnet):
    doc, pdf = resnet
    method = next(s for s in doc.sections if s.number == "3.1")
    region = ChunkAnchor(rects=method.extent, start=QuoteSelector(exact=method.title),
                          end=QuoteSelector(exact=method.text[-40:]))
    inside = HighlightAnchor(page=method.extent[0].page,
                              rect=(method.extent[0].rect[0] + 2, method.extent[0].rect[1] + 20,
                                    method.extent[0].rect[2] - 2, method.extent[0].rect[1] + 40),
                              quote=QuoteSelector(exact="a passage inside 3.1 again"))
    board = Board(
        paper_id=doc.paper_id,
        nodes=[
            ChunkNode(id="n-method", type="chunk", position={"x": 0, "y": 0},
                      data={"tags": [], "collapsed": False, "region": region.model_dump(), "text": method.text}),
            NoteNode(id="n-1", type="note", position={"x": 0, "y": 0},
                     data={"tags": [], "collapsed": False, "note": "notes/n-1.md"}),
        ],
        edges=[Edge(id="e-1", source="n-method", sourceHandle="h-x", target="n-1")],
        highlights=[Highlight(id="h-x", tags=[], note="n-1", anchor=inside)],
    )
    notes = {"n-1": "Agreeing note body.\n"}
    md = export_markdown(doc, board, notes, pdf, tags=[])
    assert md.index("a passage inside 3.1 again") < md.index("Agreeing note body.")
    assert md.count("Agreeing note body.") == 1
    assert "## Notes" not in md


def test_a_one_line_cut_sorts_by_the_region_it_sits_in(resnet):
    """A cut of one line matches no region by "region midpoint inside the
    node's rect", so it used to sort after everything on its page (final
    review M7). ResNet page 0: the Introduction's first paragraph is in the
    left column and reads before Figure 1 in the right column, although the
    figure sits higher on the page."""
    doc, pdf = resnet
    intro = next(s for s in doc.sections if s.number == "1")
    figure = next(f for f in doc.figures if f.label == "Figure 1")
    paragraph = next(r for r in doc.regions if r.page == 0 and r.label == "text"
                     and contains_point(intro.extent[0].rect, *midpoint(r.rect)))
    first_line = text_under(pdf[0], paragraph.rect).splitlines()[0]
    line = pdf[0].search_for(first_line)[0]
    cut = PageRect(page=0, rect=(paragraph.rect[0], line.y0, paragraph.rect[2], line.y1))
    assert cut.rect[1] > figure.rect.rect[3]  # the cut sits lower on the page than the figure
    board = Board(
        paper_id=doc.paper_id,
        nodes=[
            FigureNode(id="n-fig", type="figure", position={"x": 0, "y": 0},
                       data={"tags": [], "collapsed": False,
                             "region": ChunkAnchor(rects=[figure.rect], start=QuoteSelector(exact=figure.caption), end=QuoteSelector(exact=figure.caption)).model_dump(),
                             "clip": "clips/n-fig.png", "clip_size": {"width": 436, "height": 300}, "caption": figure.caption}),
            ChunkNode(id="n-cut", type="chunk", position={"x": 0, "y": 0},
                      data={"tags": [], "collapsed": False, "text": first_line,
                            "region": ChunkAnchor(rects=[cut], start=QuoteSelector(exact=first_line), end=QuoteSelector(exact=first_line)).model_dump()}),
        ],
    )
    md = export_markdown(doc, board, {}, pdf, tags=[])
    assert md.index(f"## {first_line}") < md.index("## Figure 1")
