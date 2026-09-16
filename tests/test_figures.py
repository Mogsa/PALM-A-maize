from paperboard.extract.pymupdf_layout import build_figures, read_regions


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
