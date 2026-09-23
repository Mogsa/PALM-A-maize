import pymupdf
import pytest
from conftest import FIXTURES

from paperboard.board_model import (
    Board,
    ChunkAnchor,
    ChunkNode,
    Edge,
    FigureNode,
    GroupNode,
    Highlight,
    HighlightAnchor,
    NoteNode,
    QuoteSelector,
)
from paperboard.export import export_markdown, highlights_in
from paperboard.geometry import contains_point, midpoint
from paperboard.source_model import PageRect
from paperboard.words import text_under


@pytest.fixture(scope="module")
def resnet(extracted):
    pdf = pymupdf.open(FIXTURES["resnet"])
    yield extracted["resnet"], pdf
    pdf.close()


def _anchor(page, rect, exact):
    return HighlightAnchor(rects=[PageRect(page=page, rect=rect)], quote=QuoteSelector(exact=exact))


def _blocks(text):
    return [{"kind": "text", "page": 0, "rect": (0.0, 0.0, 1.0, 1.0), "text": text}]


def _board(doc):
    intro = next(s for s in doc.sections if s.number == "1")
    method = next(s for s in doc.sections if s.number == "3.1")
    figure = next(f for f in doc.figures if f.label == "Figure 1")

    def region(section):
        return ChunkAnchor(rects=section.extent, start=QuoteSelector(exact=section.title),
                           end=QuoteSelector(exact=section.text[-40:]))

    inside = _anchor(method.extent[0].page,
                     (method.extent[0].rect[0] + 2, method.extent[0].rect[1] + 20,
                      method.extent[0].rect[2] - 2, method.extent[0].rect[1] + 40),
                     "a passage inside 3.1")
    outside = _anchor(9, (60.0, 300.0, 280.0, 320.0), "a passage on page 10")
    return Board(
        paper_id=doc.paper_id, goal="understand residual blocks",
        nodes=[
            ChunkNode(id="n-method", type="chunk", position={"x": 0, "y": 0},
                      data={"tags": ["t-method"], "collapsed": False, "region": region(method).model_dump(), "blocks": _blocks(method.text)}),
            ChunkNode(id="n-intro", type="chunk", position={"x": 0, "y": 0},
                      data={"tags": ["t-claim"], "collapsed": False, "region": region(intro).model_dump(), "blocks": _blocks(intro.text)}),
            FigureNode(id="n-fig", type="figure", position={"x": 0, "y": 0},
                       data={"tags": ["t-evidence"], "collapsed": False,
                             "region": ChunkAnchor(rects=[figure.rect], start=QuoteSelector(exact=figure.caption), end=QuoteSelector(exact=figure.caption)).model_dump(),
                             "clip": "clips/n-fig.png", "clip_size": {"width": 436, "height": 300}, "caption": figure.caption}),
            NoteNode(id="n-note", type="note", position={"x": 0, "y": 0}, data={"tags": [], "collapsed": False, "note": "notes/n-note.md"}),
            NoteNode(id="n-loose", type="note", position={"x": 0, "y": 0}, data={"tags": ["t-question"], "collapsed": False, "note": "notes/n-loose.md"}),
        ],
        edges=[Edge(id="e-1", **{"from": "h-in", "to": "n-note"}, data={"tags": ["t-supports"]})],
        highlights=[Highlight(id="h-in", tags=["t-question"], anchor=inside),
                    Highlight(id="h-out", tags=[], anchor=outside)],
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


def test_a_note_connected_to_a_highlight_in_no_chunk_is_written_under_it(resnet):
    doc, pdf = resnet
    anchor = _anchor(9, (60.0, 300.0, 280.0, 320.0), "a lone highlight")
    board = Board(
        paper_id=doc.paper_id,
        nodes=[NoteNode(id="n-1", type="note", position={"x": 0, "y": 0},
                         data={"tags": [], "collapsed": False, "note": "notes/n-1.md"})],
        edges=[Edge(id="e-1", **{"from": "n-1", "to": "h-x"})],
        highlights=[Highlight(id="h-x", tags=[], anchor=anchor)],
    )
    notes = {"n-1": "This is the note body.\n"}
    md = export_markdown(doc, board, notes, pdf, tags=[])
    assert md.index("a lone highlight") < md.index("This is the note body.")
    assert md.count("This is the note body.") == 1
    assert "## Notes" not in md


def test_a_note_connected_twice_to_a_highlight_prints_once(resnet):
    doc, pdf = resnet
    method = next(s for s in doc.sections if s.number == "3.1")
    region = ChunkAnchor(rects=method.extent, start=QuoteSelector(exact=method.title),
                          end=QuoteSelector(exact=method.text[-40:]))
    inside = _anchor(method.extent[0].page,
                     (method.extent[0].rect[0] + 2, method.extent[0].rect[1] + 20,
                      method.extent[0].rect[2] - 2, method.extent[0].rect[1] + 40),
                     "a passage inside 3.1 again")
    board = Board(
        paper_id=doc.paper_id,
        nodes=[
            ChunkNode(id="n-method", type="chunk", position={"x": 0, "y": 0},
                      data={"tags": [], "collapsed": False, "region": region.model_dump(), "blocks": _blocks(method.text)}),
            NoteNode(id="n-1", type="note", position={"x": 0, "y": 0},
                     data={"tags": [], "collapsed": False, "note": "notes/n-1.md"}),
        ],
        edges=[Edge(id="e-1", **{"from": "h-x", "to": "n-1"}), Edge(id="e-2", **{"from": "n-1", "to": "h-x"})],
        highlights=[Highlight(id="h-x", tags=[], anchor=inside)],
    )
    notes = {"n-1": "Agreeing note body.\n"}
    md = export_markdown(doc, board, notes, pdf, tags=[])
    assert md.index("a passage inside 3.1 again") < md.index("Agreeing note body.")
    assert md.count("Agreeing note body.") == 1
    assert "## Notes" not in md


def _mark(id, page, rect, quote):
    return Highlight(id=id, tags=[], anchor=_anchor(page, rect, quote))


def _chunk(id, rects):
    region = ChunkAnchor(rects=rects, start=QuoteSelector(exact=id), end=QuoteSelector(exact=id))
    return ChunkNode(id=id, type="chunk", position={"x": 0, "y": 0},
                     data={"tags": [], "collapsed": False, "region": region.model_dump(), "blocks": _blocks(id)})


def test_highlights_in_a_chunk_follow_the_paper_not_the_board(resnet):
    doc, pdf = resnet
    method = next(s for s in doc.sections if s.number == "3.1")
    x0, y0, x1, _ = method.extent[0].rect
    first = _mark("h-first", method.extent[0].page, (x0 + 2, y0 + 20, x1 - 2, y0 + 40), "the earlier passage")
    later = _mark("h-later", method.extent[0].page, (x0 + 2, y0 + 100, x1 - 2, y0 + 120), "the later passage")
    board = Board(paper_id=doc.paper_id, nodes=[_chunk("n-method", method.extent)], highlights=[later, first])
    md = export_markdown(doc, board, {}, pdf, tags=[])
    assert md.index("the earlier passage") < md.index("the later passage")


def test_loose_highlights_follow_reading_order_on_a_two_column_page(resnet):
    """ResNet page 2: a mark high in the right column reads after one lower in
    the left column; sorting by (page, y0) put it first."""
    doc, pdf = resnet
    texts = [r for r in doc.regions if r.page == 2 and r.label == "text"]
    left = next(r for r in texts if r.rect[0] < 100 and r.rect[1] > 140)
    right = next(r for r in texts if r.rect[0] > 300)
    lx0, ly0, lx1, _ = left.rect
    rx0, ry0, rx1, _ = right.rect
    assert ry0 + 5 < ly0 + 40
    board = Board(paper_id=doc.paper_id, highlights=[
        _mark("h-right", 2, (rx0 + 2, ry0 + 5, rx1 - 2, ry0 + 15), "right column mark"),
        _mark("h-left", 2, (lx0 + 2, ly0 + 40, lx1 - 2, ly0 + 50), "left column mark"),
    ])
    md = export_markdown(doc, board, {}, pdf, tags=[])
    assert md.index("left column mark") < md.index("right column mark")


def test_a_highlight_in_overlapping_chunks_is_printed_once_under_the_first(resnet):
    doc, pdf = resnet
    method = next(s for s in doc.sections if s.number == "3.1")
    page, (x0, y0, x1, _) = method.extent[0].page, method.extent[0].rect
    inner = PageRect(page=page, rect=(x0, y0 + 10, x1, y0 + 60))
    mark = _mark("h-shared", page, (x0 + 2, y0 + 20, x1 - 2, y0 + 40), "a shared passage")
    board = Board(paper_id=doc.paper_id, nodes=[_chunk("n-inner", [inner]), _chunk("n-method", method.extent)],
                  highlights=[mark])
    md = export_markdown(doc, board, {}, pdf, tags=[])
    assert md.count("a shared passage") == 1
    assert md.index("## n-method") < md.index("a shared passage") < md.index("## n-inner")


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
                      data={"tags": [], "collapsed": False, "blocks": _blocks(first_line),
                            "region": ChunkAnchor(rects=[cut], start=QuoteSelector(exact=first_line), end=QuoteSelector(exact=first_line)).model_dump()}),
        ],
    )
    md = export_markdown(doc, board, {}, pdf, tags=[])
    assert md.index(f"## {first_line}") < md.index("## Figure 1")


def test_a_highlight_is_in_a_chunk_when_any_of_its_lines_is(resnet):
    """Containment is per line (addendum 4.0): a highlight whose first line is
    outside the chunk and whose second is inside belongs to it."""
    doc, _pdf = resnet
    method = next(s for s in doc.sections if s.number == "3.1")
    page, (x0, y0, x1, _y1) = method.extent[0].page, method.extent[0].rect
    lines = [PageRect(page=9, rect=(60.0, 300.0, 280.0, 310.0)), PageRect(page=page, rect=(x0 + 2, y0 + 20, x1 - 2, y0 + 30))]
    mark = Highlight(id="h-two", tags=[], anchor=HighlightAnchor(rects=lines, quote=QuoteSelector(exact="two lines")))
    board = Board(paper_id=doc.paper_id, nodes=[_chunk("n-method", method.extent)], highlights=[mark])
    assert [h.id for h in highlights_in(board, board.nodes[0])] == ["h-two"]


# -- D6, D14: the paper-order file, piece by piece (addendum 6.1) -------------

TAG_NAMES = {"t-question": "question", "t-method": "method", "t-supports": "supports"}


def _note_node(id, tags=(), origin="reader", parent=None):
    return NoteNode(id=id, type="note", position={"x": 0, "y": 0}, parentId=parent,
                    data={"tags": list(tags), "collapsed": False, "note": f"notes/{id}.md", "origin": origin})


def _group(id, name, prompt=None, parent=None):
    return GroupNode(id=id, type="group", position={"x": 0, "y": 0}, parentId=parent,
                     data={"tags": [], "name": name, "prompt": prompt})


def _in(section, top, bottom):
    """A one-line rect inside a section's first extent rect, `top` to `bottom` points down it."""
    extent = section.extent[0]
    x0, y0, x1, _ = extent.rect
    return extent.page, (x0 + 2, y0 + top, x1 - 2, y0 + bottom)


def test_a_piece_heading_names_its_page(resnet):
    doc, pdf = resnet
    md = export_markdown(doc, _board(doc), NOTES, pdf, tags=[], tag_names=TAG_NAMES)
    method = next(s for s in doc.sections if s.number == "3.1")
    figure = next(f for f in doc.figures if f.label == "Figure 1")
    assert f"## 3.1. Residual Learning (p. {method.extent[0].page + 1})" in md
    assert f"## Figure 1 (p. {figure.rect.page + 1})" in md
    assert md.index("## Figure 1") < md.index("![Figure 1](clips/n-fig.png)") < md.index(figure.caption.strip())


def test_a_highlight_is_followed_by_its_tag_names_in_italics(resnet):
    doc, pdf = resnet
    board = _board(doc)
    board.highlights[0].tags = ["t-question", "t-method", "t-deleted"]
    md = export_markdown(doc, board, NOTES, pdf, tags=[], tag_names=TAG_NAMES)
    assert md.index("> a passage inside 3.1") < md.index("*question, method*") < md.index("F(x) = H(x) - x")
    assert "t-deleted" not in md


def test_a_highlight_outside_any_chunk_names_its_page(resnet):
    doc, pdf = resnet
    md = export_markdown(doc, _board(doc), NOTES, pdf, tags=[], tag_names=TAG_NAMES)
    loose = md[md.index("## Highlights outside any chunk"):]
    assert loose.index("> a passage on page 10") < loose.index("*p. 10*")


def test_a_multi_line_quote_stays_one_quote(resnet):
    doc, pdf = resnet
    anchor = _anchor(9, (60.0, 300.0, 280.0, 320.0), "first line\nsecond line")
    board = Board(paper_id=doc.paper_id, highlights=[Highlight(id="h-x", anchor=anchor)])
    md = export_markdown(doc, board, {}, pdf, tags=[])
    assert "> first line\n> second line" in md


def test_an_ai_note_is_labelled_wherever_it_is_written(resnet):
    doc, pdf = resnet
    method = next(s for s in doc.sections if s.number == "3.1")
    page, rect = _in(method, 20, 40)
    board = Board(
        paper_id=doc.paper_id,
        nodes=[_chunk("n-method", method.extent), _note_node("n-ai", origin="ai"),
               _note_node("n-loose-ai", origin="ai")],
        edges=[Edge(id="e-1", **{"from": "h-x", "to": "n-ai"})],
        highlights=[_mark("h-x", page, rect, "a marked passage")],
    )
    md = export_markdown(doc, board, {"n-ai": "An answer.\n", "n-loose-ai": "Another answer.\n"}, pdf, tags=[])
    assert md.index("a marked passage") < md.index("**AI:** An answer.")
    assert "**AI:** Another answer." in md[md.index("## Notes"):]


def test_a_note_connected_to_two_highlights_is_written_once_under_the_first(resnet):
    doc, pdf = resnet
    method = next(s for s in doc.sections if s.number == "3.1")
    page, first = _in(method, 20, 30)
    _, second = _in(method, 100, 110)
    board = Board(
        paper_id=doc.paper_id,
        nodes=[_chunk("n-method", method.extent), _note_node("n-1")],
        edges=[Edge(id="e-1", **{"from": "h-2", "to": "n-1"}), Edge(id="e-2", **{"from": "n-1", "to": "h-1"})],
        highlights=[_mark("h-2", page, second, "the second mark"), _mark("h-1", page, first, "the first mark")],
    )
    md = export_markdown(doc, board, {"n-1": "One note for both.\n"}, pdf, tags=[])
    assert md.count("One note for both.") == 1
    assert md.index("the first mark") < md.index("One note for both.") < md.index("the second mark")


def test_a_note_connected_only_to_a_note_or_a_group_goes_under_notes(resnet):
    doc, pdf = resnet
    board = Board(
        paper_id=doc.paper_id,
        nodes=[_group("n-g", "a group"), _note_node("n-1"), _note_node("n-2")],
        edges=[Edge(id="e-1", **{"from": "n-1", "to": "n-2"}), Edge(id="e-2", **{"from": "n-g", "to": "n-1"})],
    )
    md = export_markdown(doc, board, {"n-1": "Note one.\n", "n-2": "Note two.\n"}, pdf, tags=[])
    notes = md[md.index("## Notes"):]
    assert "Note one." in notes and "Note two." in notes
    assert md.count("Note one.") == 1


# -- D19: template order (addendum 6.1) -----------------------------------------


def _template_board(doc):
    """A slot holding a note and a plain group, with a second slot nested in
    that group around 3.1; an empty slot; a tray holding Figure 1; the
    introduction at the top level. Chunk headings are their ids (`_chunk`)."""
    intro = next(s for s in doc.sections if s.number == "1")
    method = next(s for s in doc.sections if s.number == "3.1")
    figure = next(f for f in doc.figures if f.label == "Figure 1")
    page, rect = _in(method, 20, 30)
    fig_region = ChunkAnchor(rects=[figure.rect], start=QuoteSelector(exact=figure.caption),
                             end=QuoteSelector(exact=figure.caption)).model_dump()
    method_chunk = _chunk("n-method", method.extent).model_copy(update={"parentId": "n-deep"})
    return Board(
        paper_id=doc.paper_id, goal="read it",
        nodes=[
            _group("n-tray", "Paper"),
            FigureNode(id="n-fig", type="figure", position={"x": 0, "y": 0}, parentId="n-tray",
                       data={"tags": [], "collapsed": True, "region": fig_region, "caption": figure.caption}),
            _group("n-main", "Main point", prompt="What is the one thing?"),
            _note_node("n-answer", parent="n-main"),
            _group("n-sub", "a plain group", parent="n-main"),
            _group("n-deep", "How it works", prompt="What are the key parts?", parent="n-sub"),
            method_chunk,
            _note_node("n-sub-note", parent="n-sub"),
            _group("n-empty", "Limits", prompt="Where does it stop holding?"),
            _chunk("n-intro", intro.extent),
            _note_node("n-mark-note"),
            _note_node("n-loose"),
        ],
        edges=[Edge(id="e-1", **{"from": "h-1", "to": "n-mark-note"})],
        highlights=[_mark("h-1", page, rect, "a mark in 3.1"),
                    _mark("h-out", 9, (60.0, 300.0, 280.0, 320.0), "a mark in no chunk")],
    )


TEMPLATE_NOTES = {"n-answer": "It adds identity shortcuts.\n", "n-sub-note": "A note in a plain group.\n",
                  "n-mark-note": "Why does this help?\n", "n-loose": "A loose thought.\n"}


def _sections(md):
    """The file's `##` headings, in order."""
    return [line for line in md.splitlines() if line.startswith("## ")]


def test_template_order_writes_each_slot_in_nodes_order_then_the_rest(resnet):
    doc, pdf = resnet
    md = export_markdown(doc, _template_board(doc), TEMPLATE_NOTES, pdf, tags=[], order="template")
    assert _sections(md) == ["## Main point", "## How it works", "## Limits", "## Not in a slot"]
    assert md.index("read it") < md.index("## Main point")


def test_a_slot_is_its_name_its_prompt_its_notes_then_its_pieces(resnet):
    doc, pdf = resnet
    md = export_markdown(doc, _template_board(doc), TEMPLATE_NOTES, pdf, tags=[], order="template")
    main = md[md.index("## Main point"):md.index("## How it works")]
    assert main.index("*What is the one thing?*") < main.index("It adds identity shortcuts.")
    # a note in a plain group inside the slot is the slot's, not lost
    assert "A note in a plain group." in main
    # the chunk is in a nested slot, so it is written there, not here
    assert "n-method" not in main


def test_a_piece_in_a_slot_is_one_heading_level_down_with_its_marks_and_notes(resnet):
    doc, pdf = resnet
    md = export_markdown(doc, _template_board(doc), TEMPLATE_NOTES, pdf, tags=[], order="template")
    deep = md[md.index("## How it works"):md.index("## Limits")]
    assert "### n-method (p." in deep
    assert deep.index("> a mark in 3.1") < deep.index("Why does this help?")
    assert md.count("Why does this help?") == 1


def test_an_empty_slot_is_still_written(resnet):
    doc, pdf = resnet
    md = export_markdown(doc, _template_board(doc), TEMPLATE_NOTES, pdf, tags=[], order="template")
    limits = md[md.index("## Limits"):md.index("## Not in a slot")]
    assert limits.strip() == "## Limits\n\n*Where does it stop holding?*"


def test_everything_in_no_slot_follows_in_paper_order(resnet):
    doc, pdf = resnet
    md = export_markdown(doc, _template_board(doc), TEMPLATE_NOTES, pdf, tags=[], order="template")
    rest = md[md.index("## Not in a slot"):]
    assert rest.index("### n-intro (p.") < rest.index("### Figure 1") < rest.index("### Highlights outside any chunk")
    assert rest.index("a mark in no chunk") < rest.index("### Notes") < rest.index("A loose thought.")
    assert "It adds identity shortcuts." not in rest


def test_paper_order_ignores_slots(resnet):
    doc, pdf = resnet
    md = export_markdown(doc, _template_board(doc), TEMPLATE_NOTES, pdf, tags=[])
    assert "## Main point" not in md and "What is the one thing?" not in md
    assert md.index("## n-intro") < md.index("## Figure 1") < md.index("## n-method")


def test_the_tag_filter_applies_in_template_order(resnet):
    doc, pdf = resnet
    board = _template_board(doc)
    board.highlights[1].tags = ["t-question"]
    md = export_markdown(doc, board, TEMPLATE_NOTES, pdf, tags=["t-question"], order="template")
    assert "## Limits" in md                          # a slot is always written ...
    assert "It adds identity shortcuts." in md        # ... with the notes written under it
    assert "n-method" not in md and "n-intro" not in md
    assert "a mark in no chunk" in md
    assert "A loose thought." not in md
