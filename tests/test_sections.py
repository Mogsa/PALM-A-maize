import pytest

from paperboard.extract.pymupdf_layout import build_sections, parse_number, read_regions


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
