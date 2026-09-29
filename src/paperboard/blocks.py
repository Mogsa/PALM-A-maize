"""What a chunk shows: its blocks, in reading order (SPEC-ADDENDUM.md section 4.0).

The server computes them, in `POST /text`, in split and in migration, and the
chunk stores them so the board renders without the source.
"""

import re

import pymupdf

from paperboard.board_model import Block, ClipBlock, TextBlock
from paperboard.geometry import contains_point, intersection, midpoint
from paperboard.source_model import LayoutRegion, PageRect, SourceDocument
from paperboard.words import text_under

TEXT_LABELS = {"text", "list-item", "section-header", "title", "caption", "footnote"}
CLIP_LABELS = {"formula", "picture", "table"}   # shown whole, as a rendered clip; page-header and -footer never
WORD = re.compile(r"[^\W_]+")                    # letters and digits, as the client's paperWords reads them
HYPHENATED_LINE_END = re.compile(r"([^\W_]+)-\n([^\W_]+)")


def paper_words(doc: SourceDocument) -> set[str]:
    """Every word of the paper's text, lower case. A word split at a line end counts as its two halves."""
    return {word.lower() for page in doc.page_text for word in WORD.findall(page.text)}


def join_hyphens(text: str, words: set[str]) -> str:
    """A line-end hyphen joined only when the joined word appears elsewhere in the
    paper, so "algo-\\nrithms" becomes "algorithms" but "state-of-the-\\nart" keeps
    its hyphen and its line break. The client's `reflow` does the same."""
    def join(match: re.Match) -> str:
        head, tail = match.group(1), match.group(2)
        return head + tail if (head + tail).lower() in words else match.group(0)

    return HYPHENATED_LINE_END.sub(join, text)


def _block(pdf: pymupdf.Document, target: PageRect, region: LayoutRegion, words: set[str]) -> Block | None:
    """What one layout region under one chunk rect contributes, if anything."""
    if region.label in CLIP_LABELS:
        if contains_point(target.rect, *midpoint(region.rect)):
            return ClipBlock(kind="clip", page=region.page, rect=region.rect, label=region.label)
        return None
    if region.label not in TEXT_LABELS:
        return None
    overlap = intersection(target.rect, region.rect)
    text = text_under(pdf[region.page], overlap) if overlap else ""
    if not text.strip():
        return None
    return TextBlock(kind="text", page=region.page, rect=overlap, text=join_hyphens(text, words))


def chunk_blocks(doc: SourceDocument, pdf: pymupdf.Document, rects: list[PageRect]) -> list[Block]:
    """For each chunk rect in turn, the layout regions under it in `doc.regions`
    order, which is reading order: a text region overlapping the rect is a text
    block of the words under the overlap, by the whole-word rule, keeping the
    paper's line breaks; a formula, picture or table whose midpoint lies inside
    is a clip block of the whole region, unpadded. An overlap with no whole line
    inside contributes nothing, and neither does text in no region (the
    [CHOICE] of section 4.0)."""
    words = paper_words(doc)
    blocks: list[Block] = []
    for target in rects:
        for region in doc.regions:
            if region.page == target.page and (block := _block(pdf, target, region, words)) is not None:
                blocks.append(block)
    return blocks
