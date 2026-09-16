from pathlib import Path

import pymupdf

from paperboard.extract.pymupdf_layout import (
    _CAPTION,
    _CAPTION_LABELS,
    _find_artwork,
    build_figures,
    read_regions,
)

ATTENTION_PATH = Path(__file__).parent / "fixtures" / "papers" / "attention.pdf"


def test_captions_are_parsed_into_label_and_kind(paper_path):
    pages, regions = read_regions(paper_path)
    figures = build_figures(paper_path, pages, regions)
    assert figures
    for figure in figures:
        assert figure.kind in {"figure", "table"}
        assert figure.confidence in {"region", "image", "drawings"}
        if figure.label:
            assert figure.label.split()[0] in {"Figure", "Table"}


def test_figure_ids_are_unique(paper_path):
    pages, regions = read_regions(paper_path)
    ids = [f.id for f in build_figures(paper_path, pages, regions)]
    assert len(ids) == len(set(ids))


def test_a_figure_rect_never_contains_its_own_caption(paper_path):
    """The figure rect must not CONTAIN the caption rect.

    Order-agnostic because tables are captioned above and figures below, and
    neither is universal: a rect that swallows its own caption is wrong either
    way, but "does the artwork sit above the caption" is not.
    """
    pages, regions = read_regions(paper_path)
    for figure in build_figures(paper_path, pages, regions):
        if figure.caption_rect is None or figure.caption_rect.page != figure.rect.page:
            continue
        fig_y0, fig_y1 = figure.rect.rect[1], figure.rect.rect[3]
        cap_y0, cap_y1 = figure.caption_rect.rect[1], figure.caption_rect.rect[3]
        assert not (fig_y0 <= cap_y0 and cap_y1 <= fig_y1)


def test_resnet_finds_figure_one_and_most_tables(paper_path, paper_name):
    """Figure 1's caption is labelled `text` by the layout model. Caption-only
    scanning misses it and six others."""
    if paper_name != "resnet":
        return
    pages, regions = read_regions(paper_path)
    figures = build_figures(paper_path, pages, regions)
    assert any(f.label == "Figure 1" for f in figures)
    assert len([f for f in figures if f.kind == "figure"]) >= 4
    assert len([f for f in figures if f.kind == "table"]) >= 8


def test_attention_figure_one_is_recovered_by_the_fallback(paper_path, paper_name):
    """The layout model emits Figure 1's caption but no picture region on page 2.

    This is the documented miss that the fallback chain exists for, so it is the
    single most valuable assertion in this file. See SPEC-ADDENDUM.md section 3.
    """
    if paper_name != "attention":
        return
    pages, regions = read_regions(paper_path)
    figures = build_figures(paper_path, pages, regions)
    first = next(f for f in figures if f.label == "Figure 1")
    assert first.confidence in {"region", "image"}
    x0, y0, x1, y1 = first.rect.rect
    assert (x1 - x0) > 100 and (y1 - y0) > 100


def _attention_caption(regions, page: int):
    captions = [r for r in regions if r.label in _CAPTION_LABELS and _CAPTION.match(r.text)]
    return next(c for c in captions if c.page == page)


def _without_region_and_table_boxes(regions, page: int):
    """Drop the `picture`/`table` layout boxes on one page, forcing `_find_artwork`
    past its first (`region`) branch for that page's caption."""
    return [r for r in regions if not (r.page == page and r.label in {"picture", "table"})]


def test_find_artwork_falls_back_to_image_branch():
    """attention page 2 (Figure 1's caption) has one embedded raster image large
    enough to pass MIN_FIGURE_AREA and no vector-drawing cluster on that page, so
    with the `picture` region removed the `image` branch is the only one that can
    still find anything. Measured directly: `_find_artwork` returns
    confidence == "image" here once the region candidate is filtered out."""
    pages, regions = read_regions(ATTENTION_PATH)
    caption = _attention_caption(regions, page=2)
    filtered = _without_region_and_table_boxes(regions, page=2)
    with pymupdf.open(ATTENTION_PATH) as doc:
        found = _find_artwork(doc, filtered, caption, "figure")
    assert found is not None
    rect, confidence = found
    assert confidence == "image"
    x0, y0, x1, y1 = rect
    assert x1 > x0 and y1 > y0
    assert (x1 - x0) > 50 and (y1 - y0) > 50


def test_find_artwork_falls_back_to_drawings_branch():
    """attention page 8 (Table 3's caption) has no embedded raster image at all but
    does have a vector-drawing cluster large enough to pass MIN_FIGURE_AREA, so with
    the `table` region removed the `image` branch finds nothing and only `drawings`
    can. Measured directly: no monkeypatching was needed, the real page's image list
    is already empty."""
    pages, regions = read_regions(ATTENTION_PATH)
    caption = _attention_caption(regions, page=8)
    filtered = _without_region_and_table_boxes(regions, page=8)
    with pymupdf.open(ATTENTION_PATH) as doc:
        found = _find_artwork(doc, filtered, caption, "table")
    assert found is not None
    rect, confidence = found
    assert confidence == "drawings"
    x0, y0, x1, y1 = rect
    assert x1 > x0 and y1 > y0
    assert (x1 - x0) > 50 and (y1 - y0) > 50


def test_find_artwork_returns_none_when_nothing_matches():
    """attention page 5 (Table 1's caption) has neither an embedded image nor a
    vector-drawing cluster over MIN_FIGURE_AREA in its column, so with the `table`
    region also removed every branch comes up empty. This pins the drop path that
    `build_figures` currently never exercises on the three fixtures (0 captions
    dropped)."""
    pages, regions = read_regions(ATTENTION_PATH)
    caption = _attention_caption(regions, page=5)
    filtered = _without_region_and_table_boxes(regions, page=5)
    with pymupdf.open(ATTENTION_PATH) as doc:
        found = _find_artwork(doc, filtered, caption, "table")
    assert found is None


def test_image_branch_below_caption_picks_nearest_not_first_in_region_order(monkeypatch):
    """No real fixture page has two below-caption image candidates with no
    above-caption candidate, so this doctors `page.get_image_info` (via
    monkeypatch.setattr on `pymupdf.Page`) to return two fake images below
    attention page 2's Figure 1 caption, listed farthest-first. The `region`
    branch already picks nearest-below via `min(candidates, key=lambda r: r.rect[1])`;
    this pins the `image` branch to the same rule instead of `near[0]`
    (first-in-region-order, arbitrary)."""
    pages, regions = read_regions(ATTENTION_PATH)
    caption = _attention_caption(regions, page=2)
    filtered = _without_region_and_table_boxes(regions, page=2)
    cap_x0, _cap_y0, cap_x1, cap_y1 = caption.rect
    nearer = (cap_x0, cap_y1 + 10, cap_x1, cap_y1 + 110)
    farther = (cap_x0, cap_y1 + 200, cap_x1, cap_y1 + 300)

    def fake_get_image_info(self):
        return [{"bbox": farther}, {"bbox": nearer}]

    monkeypatch.setattr(pymupdf.Page, "get_image_info", fake_get_image_info)
    with pymupdf.open(ATTENTION_PATH) as doc:
        found = _find_artwork(doc, filtered, caption, "figure")
    assert found is not None
    rect, confidence = found
    assert confidence == "image"
    assert rect == nearer


def test_drawings_branch_below_caption_picks_nearest_not_first_in_region_order(monkeypatch):
    """Same doctoring as the image-branch pin above, but on `cluster_drawings`
    (also via monkeypatch.setattr on `pymupdf.Page`), with `get_image_info`
    forced empty so the `drawings` branch is the only one left standing. No
    real fixture page combines zero above-caption candidates with two or more
    below-caption vector-drawing clusters."""
    pages, regions = read_regions(ATTENTION_PATH)
    caption = _attention_caption(regions, page=8)
    filtered = _without_region_and_table_boxes(regions, page=8)
    cap_x0, _cap_y0, cap_x1, cap_y1 = caption.rect
    nearer = pymupdf.Rect(cap_x0, cap_y1 + 10, cap_x1, cap_y1 + 110)
    farther = pymupdf.Rect(cap_x0, cap_y1 + 200, cap_x1, cap_y1 + 300)

    def fake_get_image_info(self):
        return []

    def fake_cluster_drawings(self):
        return [farther, nearer]

    monkeypatch.setattr(pymupdf.Page, "get_image_info", fake_get_image_info)
    monkeypatch.setattr(pymupdf.Page, "cluster_drawings", fake_cluster_drawings)
    with pymupdf.open(ATTENTION_PATH) as doc:
        found = _find_artwork(doc, filtered, caption, "table")
    assert found is not None
    rect, confidence = found
    assert confidence == "drawings"
    assert rect == (nearer.x0, nearer.y0, nearer.x1, nearer.y1)
