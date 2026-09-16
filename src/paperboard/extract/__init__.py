"""The extractor interface.

Exactly one implementation today. A second one — Docling, or opendataloader-pdf —
is a new module here that returns the same SourceDocument, plus a change to the
one line below. Nothing outside this package knows which ran.
See SPEC-ADDENDUM.md section 3.1.
"""

from pathlib import Path

from paperboard.source_model import SourceDocument


def extract(pdf_path: Path) -> SourceDocument:
    """Read a PDF and return its structure. Never mutates the PDF."""
    from paperboard.extract.pymupdf_layout import extract_document

    return extract_document(pdf_path)
