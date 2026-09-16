import pytest
from pydantic import ValidationError

from paperboard.source_model import PageRect, Section, SourceDocument


def test_page_rect_rejects_an_inverted_rectangle():
    with pytest.raises(ValidationError):
        PageRect(page=0, rect=(10.0, 10.0, 5.0, 20.0))


def test_page_rect_rejects_a_negative_page():
    with pytest.raises(ValidationError):
        PageRect(page=-1, rect=(0.0, 0.0, 1.0, 1.0))


def test_section_depth_defaults_to_one():
    section = Section(
        id="sec-1",
        number=None,
        title="Abstract",
        heading_rect=PageRect(page=0, rect=(1.0, 2.0, 3.0, 4.0)),
        extent=[],
        text="",
    )
    assert section.depth == 1


def test_source_document_round_trips_through_json():
    doc = SourceDocument(
        paper_id="x",
        extractor="test/0",
        pages=[{"index": 0, "width": 612.0, "height": 792.0, "rotation": 0}],
    )
    assert SourceDocument.model_validate_json(doc.model_dump_json()) == doc


def test_schema_version_is_pinned_to_one():
    assert SourceDocument(paper_id="x", extractor="t", pages=[]).schema_version == 1
