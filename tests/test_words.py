"""The whole-word rule and a highlight's line rects (addendum 5.1)."""

import pymupdf
import pytest
from conftest import FIXTURES

from paperboard.geometry import contains_point, midpoint
from paperboard.words import line_rects_under, lines_under, text_under


@pytest.fixture(scope="module")
def resnet(extracted):
    pdf = pymupdf.open(FIXTURES["resnet"])
    yield extracted["resnet"], pdf
    pdf.close()


def _paragraph(doc, page=2, nth=2):
    return [r for r in doc.regions if r.page == page and r.label == "text"][nth]


def test_one_line_rect_per_printed_line_of_the_words_under_the_rect(resnet):
    """PyMuPDF reports "part." and "The degradation problem ..." on this paragraph's
    sixth printed line as two lines; they paint as one rect, with no gap between."""
    doc, pdf = resnet
    region = _paragraph(doc)
    rects = line_rects_under(pdf[2], region.rect)
    lines = text_under(pdf[2], region.rect).strip().split("\n")
    assert len(rects) == len(lines) - 1 > 3
    tops = [r[1] for r in rects]
    assert tops == sorted(tops)
    assert all(b[1] - a[1] > 8 for a, b in zip(rects, rects[1:]))   # 12 pt leading, no two on one row
    for rect in rects:
        assert contains_point(region.rect, *midpoint(rect))
        assert rect[3] - rect[1] < 15   # a line, not a paragraph


def test_a_line_rect_covers_only_the_words_selected_on_it(resnet):
    """A drag that starts halfway along a paragraph's first line paints from there,
    never the unselected start of that line."""
    doc, pdf = resnet
    x0, y0, x1, y1 = _paragraph(doc).rect
    half = (x0 + x1) / 2
    first_line = line_rects_under(pdf[2], (x0, y0, x1, y1))[0]
    partial = line_rects_under(pdf[2], (half, y0, x1, y0 + (first_line[3] - first_line[1])))
    assert len(partial) == 1
    assert partial[0][0] >= half - 30 and partial[0][2] == pytest.approx(first_line[2])
    kept = [w[4] for w in lines_under(pdf[2], (half, y0, x1, first_line[3]))[0]]
    assert kept and kept[-1] == text_under(pdf[2], first_line).split()[-1]


def test_no_line_rects_where_there_are_no_words(resnet):
    _doc, pdf = resnet
    assert line_rects_under(pdf[2], (0.0, 0.0, 5.0, 5.0)) == []
