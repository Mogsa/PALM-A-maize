import pymupdf
import pytest
from conftest import FIXTURES

from paperboard.clips import DEFAULT_DPI, MAX_DPI, render_clip


@pytest.fixture(scope="module")
def resnet(extracted):
    pdf = pymupdf.open(FIXTURES["resnet"])
    yield extracted["resnet"], pdf
    pdf.close()


def test_renders_a_figure_to_png_at_the_expected_size(resnet):
    doc, pdf = resnet
    figure = next(f for f in doc.figures if f.label == "Figure 1")
    png, width, height = render_clip(pdf, figure.rect, dpi=DEFAULT_DPI)
    assert png.startswith(b"\x89PNG\r\n\x1a\n")
    x0, y0, x1, y1 = figure.rect.rect
    assert width == pytest.approx((x1 - x0 + 8) * DEFAULT_DPI / 72, abs=3)
    assert height == pytest.approx((y1 - y0 + 8) * DEFAULT_DPI / 72, abs=3)


def test_dpi_is_clamped(resnet):
    doc, pdf = resnet
    figure = doc.figures[0]
    _, w_big, _ = render_clip(pdf, figure.rect, dpi=10_000)
    _, w_max, _ = render_clip(pdf, figure.rect, dpi=MAX_DPI)
    assert w_big == w_max


def test_rect_is_clipped_to_the_page(resnet):
    doc, pdf = resnet
    off_page = doc.figures[0].rect.model_copy(update={"rect": (500.0, 700.0, 900.0, 1000.0)})
    png, width, height = render_clip(pdf, off_page)
    assert png and width > 0 and height > 0


def test_a_page_outside_the_document_is_rejected(resnet):
    doc, pdf = resnet
    figure = doc.figures[0].rect.model_copy(update={"page": 999})
    with pytest.raises(ValueError):
        render_clip(pdf, figure)


def test_a_rect_wholly_outside_the_page_is_rejected(resnet):
    doc, pdf = resnet
    off_page = doc.figures[0].rect.model_copy(update={"rect": (5000.0, 5000.0, 5100.0, 5100.0)})
    with pytest.raises(ValueError):
        render_clip(pdf, off_page)
