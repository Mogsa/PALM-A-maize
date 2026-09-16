# Extraction plan: verification against the real library

16 September 2026. Supplement to `2026-09-15-extraction.md`. The pinned triplet
`pymupdf == pymupdf4llm == pymupdf-layout == 1.28.2` was installed in a throwaway
environment and run over ResNet (`1512.03385v1`). Everything below is measured, not read
from documentation. The five fixes below were applied to the plan on 16 September 2026; they stay here as the record of why.

## Confirmed

- `pymupdf4llm.helpers.document_layout.parse_document` exists and accepts either a path
  string or an open `pymupdf.Document`, plus `pages=[...]`.
- `ParsedDocument.pages` is a list of `PageLayout` with fields `page_number`, `width`,
  `height`, `boxes`, `fulltext`, `words`, `links`.
- `LayoutBox` fields are `x0 y0 x1 y1 boxclass image table max_fontsize header_level
  textlines`. There is **no** `text` field, so the plan's `page.get_textbox(rect)` is the
  right way to read a box's words.
- Box coordinates are PyMuPDF page space, points, top-left origin. No conversion needed.
- Labels seen: `title`, `section-header`, `text`, `caption`, `picture`, `table`,
  `formula`, `footnote`, `page-header`, `page-footer`. All inside the plan's `LABELS` set.
- Speed: four pages in 0.6 s including model load. Full ResNet, 12 pages, under 4 s.
- Model weights ship in the wheel. No network was used after `pip install`.
- Heading quality on ResNet is good: `3. Deep Residual Learning`, `3.1. Residual
  Learning`, `3.2. Identity Mapping by Shortcuts`, `4. Experiments`, `4.1. ImageNet
  Classification` all come back as `section-header` with the right numbers.

## Fix 1: `page_number` is 1-indexed

`PageLayout.page_number` runs 1, 2, 3 for `doc[0], doc[1], doc[2]`. Task 3 step 3 does
`index = page_layout.page_number` and then `doc[index]`, which reads every box's text from
the following page and raises `IndexError` on the last one. With the bug in place the
title box on page 0 returned mid-abstract fragments; with the fix it returns
`Deep Residual Learning for Image Recognition`.

Change in `read_regions`:

```python
index = page_layout.page_number - 1
```

Add to `tests/test_regions.py` so the mistake cannot return:

```python
def test_page_zero_title_box_holds_the_paper_title(paper_path, paper_name):
    _, regions = read_regions(paper_path)
    title = next(r for r in regions if r.page == 0 and r.label == "title")
    expected = {
        "attention": "Attention Is All You Need",
        "resnet": "Deep Residual Learning",
        "adam": "ADAM",
    }[paper_name]
    assert expected.lower() in title.text.lower()
```

## Fix 2: `header_level` starts at the paper title

On ResNet the title is level 1, top-level sections (`Abstract`, `1. Introduction`) are
level 2, and subsections are level 3. Task 4 uses `header_level` as the depth fallback for
unnumbered headings, so `Abstract` would get depth 2. Subtract one and clamp:

```python
if number is None and region.header_level:
    depth = max(1, region.header_level - 1)
```

The test in Task 4 `test_resnet_nesting_matches_its_numbering` does not cover this because
both headings it checks are numbered. Add:

```python
def test_unnumbered_abstract_is_depth_one(paper_path):
    pages, regions = read_regions(paper_path)
    abstract = next(s for s in build_sections(pages, regions) if s.title.lower().startswith("abstract"))
    assert abstract.depth == 1
```

## Fix 3: body sentences promoted to headings

ResNet page 0 has a `section-header` box, level 4, whose text is
`greatly benefited from very deep models.`, a fragment of a body sentence. The addendum
warned about this. Task 4's `_is_heading` lets it through: it is within the length limits
and is not digits. Add one rule, which a real heading in these papers never violates:

```python
if text[0].islower() or text.endswith("."):
    return False  # a body sentence the layout model promoted
```

`1. Introduction` and `3.1. Residual Learning` end without a period, so they survive.
`A. Appendix`-style headings survive because the check is on the last character only.
Add to `tests/test_sections.py`:

```python
def test_no_heading_starts_lowercase_or_ends_with_a_period(paper_path):
    pages, regions = read_regions(paper_path)
    for section in build_sections(pages, regions):
        assert not section.title[0].islower(), section.title
        assert not section.title.endswith("."), section.title
```

## Fix 4: a third of captions are labelled `text`

Across all of ResNet the model labelled 13 boxes `caption`, but 7 more boxes that begin
`Figure N.` or `Table N.` were labelled `text`, including Figure 1 on page 0. Task 5's
`build_figures` iterates only `label == "caption"`, so it would miss those seven.

Two changes to Task 5:

1. The caption pattern must require a separator after the number, otherwise body
   sentences like `Table 3 shows that` and `Fig. 6 (middle) shows` match. Measured: every
   real caption in ResNet has `.` or `:` after the number; every false match does not.

   ```python
   _CAPTION = re.compile(r"^\s*(Figure|Fig\.?|Table)\s*(\d+)\s*[.:]", re.IGNORECASE)
   ```

2. Iterate over `caption` and `text` regions, and let the pattern decide:

   ```python
   for ordinal, caption in enumerate(
       r for r in regions if r.label in {"caption", "text"} and _CAPTION.match(r.text)
   ):
   ```

   The `_caption_key(...) is None: continue` guard inside the loop becomes redundant and
   can go.

Strengthen `test_resnet_finds_several_figures` to what the paper actually has, so a
regression to caption-only labelling fails:

```python
def test_resnet_finds_figure_one_and_most_tables(paper_path, paper_name):
    if paper_name != "resnet":
        return
    pages, regions = read_regions(paper_path)
    figures = build_figures(paper_path, pages, regions)
    assert any(f.label == "Figure 1" for f in figures)
    assert len([f for f in figures if f.kind == "table"]) >= 8
```

## Fix 5: store layout regions, because the snap rule needs them

SPEC-ADDENDUM.md section 5.3 snaps a rough selection to "the smallest `pymupdf-layout`
region whose rectangle contains the selection's midpoint". That runs on every
`POST /text`, in the API plan. Nothing in `source.json` holds the regions, so the API
would have to re-run the layout model per request or keep a parallel cache. Extraction
already has them. Store them.

Add to `source_model.py`:

```python
class LayoutRegion(BaseModel):
    page: int = Field(ge=0)
    rect: Rect
    label: str
```

and `regions: list[LayoutRegion] = []` on `SourceDocument`. In Task 7 `extract_document`, pass
`regions=[LayoutRegion(page=r.page, rect=r.rect, label=r.label) for r in regions]`. The name is `LayoutRegion` because `pymupdf_layout.py` already has a `Region` dataclass. Do not store
region text; `page_text` already has it and the addendum keeps the file readable.

Add to SPEC-ADDENDUM.md section 3's example a `regions` array beside `sections`, and one
field note: "`regions` is every labelled layout box, for the snap rule in 5.3 and nothing
else."

Golden summaries in Task 9 should add `"region_count": len(document.regions)` so a
change in the model's output is visible without freezing every rectangle.

## Two notes, no change needed

- **OCR.** `parse_document` prints "Using Tesseract for OCR processing" when Tesseract is
  on the PATH, and its default mode is `SELECT_KEEP_OLD`. Born-digital arXiv PDFs never
  trigger it. Pass `use_ocr=OCRMode.NEVER` in `read_regions` anyway, so a machine without
  Tesseract behaves identically and no test depends on a system binary.
- **`PageLayout.fulltext` is not the page text.** It came back as 47 characters for a full
  page. Task 6's `page.get_text()` is correct; do not be tempted by the shorter path.

## Chunk model

The spec's chunk-and-highlight revision (SPEC.md section 4, commit ec768f4) changes
nothing in this plan. A chunk made by split takes its rectangles from `Section.extent`
and its quotes from the heading and the section's last line, both of which the plan
already produces. `page_text` serves highlight anchoring unchanged.
