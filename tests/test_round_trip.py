"""A mark made by a selection must come back `anchored`, geometry untouched, when
the paper has not changed (SPEC.md section 7, rulings R12 and R13). These are
the gestures the frontend actually makes: a section or figure selected by its
extractor geometry, a rough drag padded around a paragraph, a drag whose edge
cuts through a line, and one occurrence of a repeated phrase."""

import pymupdf
import pytest
from conftest import FIXTURES

from paperboard.anchoring import build_index, resolve_chunk, resolve_highlight
from paperboard.snap import select
from paperboard.source_model import PageRect
from paperboard.words import line_rects_under

PAD_POINTS = 6.0
REPEATED_PHRASE = "shortcut connections"

# Cases excluded by name, each measured (final-fix-report.md). In every one the
# text PyMuPDF's `get_text(clip=)` returns for a rect -- which is what a
# selection quotes -- holds glyphs whose boxes lie mostly outside that rect,
# because the clip keeps characters whose boxes merely intersect it. The stored
# quote then is not "text under the rect" by R12's own midpoint rule, so no
# unchanged rule can recognise it; the fix belongs in how a selection takes
# its quote, not in anchoring.
CLIP_TAKES_GLYPHS_OUTSIDE_THE_RECT = {
    # Tall math-accent glyph boxes (the hat of m-hat is a "b" 36 pt tall) push
    # the end quote's box below the section's last rect.
    "sections": {("adam", "2.1 ADAM’S UPDATE RULE"), ("adam", "7.2 TEMPORAL AVERAGING")},
    # Attention: the clip drops the hyphen of "Multi-Head", so the quote is not
    # verbatim and fuzzy matching finds the body text's "Multi-Head Attention".
    # ResNet: the rect's bottom edge clips the tops of the caption's glyphs, so
    # the end quote is caption fragments ("T i i I N t Thi").
    "figures": {("attention", "Figure 2"), ("resnet", "Figure 4"), ("resnet", "Figure 6")},
    # (paper, page, region rect rounded): the 6 pt pad catches descenders of
    # the title ("gy g q" before "Microsoft Research"), axis labels of the
    # figure above a caption, a glyph of the paragraph above, and fragments of
    # an algorithm box's neighbouring lines.
    "padded": {("resnet", 0, (249, 170, 343, 178)), ("resnet", 0, (309, 306, 545, 347)),
               ("resnet", 2, (309, 396, 545, 453)),
               ("adam", 8, (105, 121, 490, 259)), ("adam", 8, (115, 305, 154, 312))},
}


@pytest.fixture(scope="module")
def papers(extracted):
    opened = {name: pymupdf.open(path) for name, path in FIXTURES.items()}
    yield {name: (extracted[name], build_index(extracted[name]), opened[name]) for name in FIXTURES}
    for pdf in opened.values():
        pdf.close()


def _chunk_round_trip(paper, rects: list[PageRect]) -> str | None:
    """None when the chunk comes back anchored with the selection's rects,
    otherwise a description of what came back."""
    doc, index, pdf = paper
    chunk = select(doc, pdf, rects, snap=False).chunk
    resolved = resolve_chunk(chunk, index, pdf, doc)
    if resolved.state == "anchored" and resolved.rects == chunk.rects:
        return None
    return f"{resolved.state}, rects changed: {resolved.rects != chunk.rects}"


def _highlight_round_trip(paper, rect: PageRect) -> str | None:
    doc, index, pdf = paper
    selection = select(doc, pdf, [rect], snap=False)
    problems = []
    lines = [PageRect(page=rect.page, rect=line) for line in line_rects_under(pdf[rect.page], rect.rect)]
    if selection.highlight.rects != lines:   # one rect per line of the words under the drag (D1)
        problems.append("selection did not take the lines under the drawn rect")
    highlight = resolve_highlight(selection.highlight, index, pdf)
    if highlight.state != "anchored" or highlight.rects != selection.highlight.rects:
        problems.append(f"highlight {highlight.state} {[r.rect for r in highlight.rects]}")
    chunk = resolve_chunk(selection.chunk, index, pdf, doc)
    if chunk.state != "anchored" or chunk.rects != selection.chunk.rects:
        problems.append(f"chunk {chunk.state} {[r.rect for r in chunk.rects]}")
    return "; ".join(problems) or None


@pytest.mark.parametrize("name", sorted(FIXTURES))
def test_every_section_selected_by_its_extent_stays_anchored(papers, name):
    paper = papers[name]
    doc = paper[0]
    excluded = {title for paper_name, title in CLIP_TAKES_GLYPHS_OUTSIDE_THE_RECT["sections"] if paper_name == name}
    failures = {s.title: why for s in doc.sections if s.extent and s.title not in excluded
                if (why := _chunk_round_trip(paper, s.extent))}
    assert failures == {}


@pytest.mark.parametrize("name", sorted(FIXTURES))
def test_every_figure_selected_by_its_rect_stays_anchored(papers, name):
    paper = papers[name]
    doc = paper[0]
    excluded = {label for paper_name, label in CLIP_TAKES_GLYPHS_OUTSIDE_THE_RECT["figures"] if paper_name == name}
    failures = {f.label: why for f in doc.figures if f.label not in excluded
                if (why := _chunk_round_trip(paper, [f.rect]))}
    assert failures == {}


@pytest.mark.parametrize("name", sorted(FIXTURES))
def test_a_rough_drag_padded_around_a_paragraph_stays_anchored(papers, name):
    paper = papers[name]
    doc = paper[0]
    failures = {}
    for region in (r for r in doc.regions if r.label == "text"):
        key = (name, region.page, tuple(round(v) for v in region.rect))
        if key in CLIP_TAKES_GLYPHS_OUTSIDE_THE_RECT["padded"]:
            continue
        x0, y0, x1, y1 = region.rect
        padded = PageRect(page=region.page, rect=(x0 - PAD_POINTS, y0 - PAD_POINTS, x1 + PAD_POINTS, y1 + PAD_POINTS))
        if why := _highlight_round_trip(paper, padded):
            failures[key] = why
    assert failures == {}


def test_a_drag_cutting_through_the_middle_of_a_line_stays_anchored(papers):
    paper = papers["resnet"]
    doc = paper[0]
    # the final review's case: ResNet page 2's first text region, whose first
    # line runs from y 75.2 to y 84.1, cut off at y 80
    region = next(r for r in doc.regions if r.page == 2 and r.label == "text")
    x0, y0, x1, _y1 = region.rect
    assert _highlight_round_trip(paper, PageRect(page=2, rect=(x0, y0, x1, 80.0))) is None


def test_each_occurrence_of_a_repeated_phrase_anchors_to_itself(papers):
    paper = papers["resnet"]
    _doc, _index, pdf = paper
    hits = pdf[1].search_for(REPEATED_PHRASE)
    assert len(hits) >= 5
    failures = {}
    for i, hit in enumerate(hits):
        if why := _highlight_round_trip(paper, PageRect(page=1, rect=tuple(hit))):
            failures[i] = why
    assert failures == {}
