"""A chunk's blocks (addendum 4.0). For now one text block per chunk rect, by the
whole-word rule; the mixed text-and-clip rule over layout regions is a later task."""

import pymupdf
import pytest
from conftest import FIXTURES

from paperboard.blocks import chunk_blocks
from paperboard.source_model import PageRect
from paperboard.words import text_under


@pytest.fixture(scope="module")
def resnet(extracted):
    pdf = pymupdf.open(FIXTURES["resnet"])
    yield extracted["resnet"], pdf
    pdf.close()


def test_one_text_block_per_rect_in_order_holding_the_words_under_it(resnet):
    doc, pdf = resnet
    texts = [r for r in doc.regions if r.page == 2 and r.label == "text"][:2]
    rects = [PageRect(page=2, rect=r.rect) for r in texts]
    blocks = chunk_blocks(doc, pdf, rects)
    assert [(b.kind, b.page, b.rect) for b in blocks] == [("text", 2, r.rect) for r in texts]
    assert [b.text for b in blocks] == [text_under(pdf[2], r.rect) for r in texts]


def test_a_rect_with_no_whole_line_inside_contributes_nothing(resnet):
    doc, pdf = resnet
    assert chunk_blocks(doc, pdf, [PageRect(page=2, rect=(0.0, 0.0, 5.0, 5.0))]) == []
