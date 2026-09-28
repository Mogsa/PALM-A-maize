from datetime import UTC, datetime

import pymupdf
import pytest

from paperboard.source_model import LayoutRegion, PageInfo, SourceDocument
from paperboard.spans import paper_spans, span_ids, term_occurrences, words_by_page


def _doc(regions):
    return SourceDocument(paper_id="x", extractor="t", extracted_at=datetime(2026, 9, 27, tzinfo=UTC),
                          pages=[PageInfo(index=0, width=600, height=800), PageInfo(index=1, width=600, height=800)],
                          regions=[LayoutRegion(page=p, rect=r, label=label) for p, r, label in regions])


def test_span_ids_count_non_furniture_regions_per_page_from_one():
    doc = _doc([(0, (0, 0, 10, 10), "page-header"), (0, (0, 20, 10, 30), "text"),
                (0, (0, 40, 10, 50), "section-header"), (1, (0, 0, 10, 10), "text")])
    assert [sid for sid, _ in span_ids(doc)] == ["p1-r1", "p1-r2", "p2-r1"]


def test_span_ids_are_stable_for_a_fixed_source(extracted):
    doc = next(iter(extracted.values()))
    assert span_ids(doc) == span_ids(doc.model_copy(deep=True))


@pytest.fixture
def pdf():
    document = pymupdf.open()
    page = document.new_page(width=600, height=800)
    page.insert_text((50, 100), "We call this Batch Normalization here.", fontsize=11)
    page.insert_text((50, 130), "batch normalization, again; not batchnormalization.", fontsize=11)
    yield document
    document.close()


def test_paper_spans_read_each_regions_text(pdf):
    doc = _doc([(0, (40, 85, 560, 105), "text")])
    [span] = paper_spans(doc, pdf)
    assert span.id == "p1-r1" and "Batch Normalization" in span.text


def test_term_occurrences_are_whole_word_and_case_insensitive(pdf):
    found = term_occurrences("batch normalization", words_by_page(pdf))
    assert len(found) == 2 and all(o.page == 0 for o in found)


def test_term_occurrences_ignore_trailing_punctuation_and_nothing_found_is_empty(pdf):
    assert len(term_occurrences("again", words_by_page(pdf))) == 1
    assert term_occurrences("dropout", words_by_page(pdf)) == []
