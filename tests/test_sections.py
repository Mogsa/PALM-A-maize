import pytest

from paperboard.extract.pymupdf_layout import (
    _clean_title,
    build_sections,
    parse_number,
    read_regions,
)
from paperboard.geometry import contains_point


@pytest.mark.parametrize(
    ("title", "expected"),
    [
        ("1. Introduction", ("1", 1)),
        ("3.1. Residual Learning", ("3.1", 2)),
        ("3.1.4 Something Deep", ("3.1.4", 3)),
        ("2 Related Work", ("2", 1)),
        ("Abstract", (None, 1)),
        ("A. Appendix", ("A", 1)),
        ("", (None, 1)),
        ("A Simple Framework for Contrastive Learning", (None, 1)),
        ("I Introduction", (None, 1)),
        ("B) Background", ("B", 1)),
    ],
)
def test_parse_number(title, expected):
    assert parse_number(title) == expected


def test_parse_number_ignores_a_trailing_sentence_period():
    assert parse_number("Attention Is All You Need.") == (None, 1)


def test_sections_are_found_and_ordered(paper_path):
    """Sections come back in reading order, not shuffled.

    We deliberately do not assert that heading y is globally non-decreasing: within
    a page, regions are in column-major reading order, so a heading's y legitimately
    decreases at a column break. On ResNet page 2 the left column ends near y=562
    ("3.2 Identity Mapping by Shortcuts") and the right column resumes near y=463
    ("3.3 Network Architectures") -- a real, correct reading-order transition that a
    raw y-sort would reject. The exact within-page ordering is pinned instead by the
    Task 9 golden files.
    """
    pages, regions = read_regions(paper_path)
    sections = build_sections(pages, regions)
    assert len(sections) >= 5
    section_pages = [s.heading_rect.page for s in sections]
    assert section_pages == sorted(section_pages)


def test_section_ids_are_unique(paper_path):
    pages, regions = read_regions(paper_path)
    sections = build_sections(pages, regions)
    ids = [s.id for s in sections]
    assert len(ids) == len(set(ids))


def test_resnet_nesting_matches_its_numbering(paper_path, paper_name):
    if paper_name != "resnet":
        return
    pages, regions = read_regions(paper_path)
    by_title = {s.title: s for s in build_sections(pages, regions)}
    intro = next(s for t, s in by_title.items() if "Introduction" in t)
    sub = next(s for t, s in by_title.items() if "Residual Learning" in t and s.number == "3.1")
    assert intro.depth == 1
    assert sub.depth == 2


def test_every_section_has_an_extent_that_starts_at_its_heading(paper_path):
    pages, regions = read_regions(paper_path)
    for section in build_sections(pages, regions):
        assert section.extent, f"{section.title} has no extent"
        first = section.extent[0]
        assert first.page == section.heading_rect.page
        assert first.rect[1] <= section.heading_rect.rect[1] + 1


def test_running_heads_are_not_mistaken_for_sections(paper_path):
    pages, regions = read_regions(paper_path)
    titles = [s.title.lower() for s in build_sections(pages, regions)]
    assert not any(t.isdigit() for t in titles)


def test_no_heading_starts_lowercase_or_ends_with_a_period(paper_path):
    """ResNet page 0 has a section-header box reading 'greatly benefited from very
    deep models.' -- a body sentence the layout model promoted."""
    pages, regions = read_regions(paper_path)
    for section in build_sections(pages, regions):
        assert not section.title[0].islower(), section.title
        assert not section.title.endswith("."), section.title


def test_unnumbered_abstract_is_depth_one(paper_path):
    """header_level counts the paper title as 1, so Abstract arrives as 2."""
    pages, regions = read_regions(paper_path)
    sections = build_sections(pages, regions)
    abstract = next(s for s in sections if s.title.lower().startswith("abstract"))
    assert abstract.depth == 1


def test_section_titles_have_no_decoding_or_layout_artefacts(paper_path):
    """Titles are user-visible: the export's literature note prints them verbatim.

    get_textbox preserves the PDF's own line breaks and glyph-decoding failures
    (U+FFFD) end up embedded in the raw region text. None of that belongs in a
    title a reader sees.
    """
    pages, regions = read_regions(paper_path)
    for section in build_sections(pages, regions):
        title = section.title
        assert "\n" not in title, title
        assert "\r" not in title, title
        assert "\t" not in title, title
        assert "  " not in title, title
        assert "�" not in title, title


def test_adam_numbered_headings_parse_after_cleaning(paper_path, paper_name):
    if paper_name != "adam":
        return
    pages, regions = read_regions(paper_path)
    sections = build_sections(pages, regions)
    update_rule = next(s for s in sections if "ADAM’S UPDATE RULE" in s.title.upper())
    assert update_rule.number == "2.1"
    assert update_rule.depth == 2
    init_bias = next(s for s in sections if "INITIALIZATION BIAS CORRECTION" in s.title.upper())
    assert init_bias.number == "3"
    assert init_bias.depth == 1


def test_clean_title_strips_replacement_character():
    assert _clean_title("�\n2.1\nADAM’S UPDATE RULE") == "2.1 ADAM’S UPDATE RULE"


def test_clean_title_collapses_multiline_to_one_line():
    assert _clean_title("3.1.\nResidual Learning") == "3.1. Residual Learning"


def test_clean_title_leaves_a_clean_title_unchanged():
    assert _clean_title("1. Introduction") == "1. Introduction"


def test_no_sections_extent_covers_another_sections_heading(paper_path):
    """Regression guard for the two-column hull bug: a section's extent must not
    cover any other section's heading. The check is on the heading's midpoint,
    not full enclosure: on a two-column page a hull that merges a full-width
    figure with the column beneath it reaches across the page and covers most of
    a heading in the other column without enclosing it, and that extent would
    still render the next section inside this one's chunk.
    """
    pages, regions = read_regions(paper_path)
    sections = build_sections(pages, regions)
    violations = []
    for current in sections:
        for other in sections:
            if other is current:
                continue
            heading = other.heading_rect
            hx0, hy0, hx1, hy1 = heading.rect
            midpoint = ((hx0 + hx1) / 2, (hy0 + hy1) / 2)
            for extent_rect in current.extent:
                if extent_rect.page != heading.page:
                    continue
                if contains_point(extent_rect.rect, *midpoint):
                    violations.append((current.title, other.title, heading.page))
    assert not violations, violations
