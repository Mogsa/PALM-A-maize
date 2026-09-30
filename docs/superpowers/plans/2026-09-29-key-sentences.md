# Key sentences: build plan

Spec: `docs/superpowers/specs/2026-09-29-key-sentences-design.md`. Branch: `feat/key-sentences`.

Two parallel agents in their own worktrees, then one integration step. The contract between them is the
spec's `Ground.lines: PageRect[]` (may be empty) and the unchanged `GET /api/papers/{id}/ai`.

## Wave 1a: backend (Python)

1. Test first, then add `lines: list[PageRect] = []` to `Ground` (`src/paperboard/ai_model.py`).
2. A function that, given the PDF, the anchoring index and a ground, returns the quote's line rects, reusing
   `paperboard.anchoring` (the same path `resolve_highlight` takes: `_find_highlight` near the span's page,
   then `_matched_lines`). Empty list when not found.
3. `run_pass` fills `lines` for every `where_to_look` ground.
4. `GET /api/papers/{id}/ai` fills missing `lines` for `where_to_look` grounds on the way out; writes nothing.
5. `READER_SYSTEM`: each `where_to_look` quote is the one complete sentence in the span that best answers
   the slot, copied exactly.
6. Update `web/e2e/fake-claude.json` so its `where_to_look` quotes are complete sentences from the e2e
   fixture paper's spans (they must still pass grounding).
7. `uv run pytest` and `uv run ruff check .` pass.

## Wave 1b: frontend (TypeScript)

1. `Ground` in `web/src/ai/types.ts` gains `lines?: PageRect[]`.
2. Remove `SlotPin` and the `outlined` / `toggleSlot` state in `AiProvider`, and the dashed `.ai-outline`
   drawing in `PageOverlay` (and their tests); keep `goTo`.
3. A pure helper (e.g. `web/src/ai/keySentences.ts`): from `ai` and the template's slot names, the key
   sentences grouped by slot in template order, each with its colour, quote, page and lines.
4. `PageOverlay`: with AI on, draw each key sentence's `lines` on their own page, faint, in the slot colour,
   dashed underline, `title="AI · <slot>"`.
5. A `KeySentences` panel in `web/src/panels/`, opened by a top-bar badge with a count (like Glossary, shown
   only when non-zero): grouped list, click scrolls the paper (`goTo(lines[0] ?? at)`), Keep dispatches one
   `addHighlight` with a new id, the same rects and `quote.exact` = the quote.
6. Vitest for each of the above; `npx tsc -b` clean; `npm test` passes.

## Wave 2: integration (main session)

Merge 1a and 1b into `feat/key-sentences`, write the e2e from the spec against the canned Claude, run the
full suites (pytest, vitest, e2e on alternate ports), rebuild `web/dist`, and hand to the owner to try on
the IRD paper (⌘K → Redo AI pass to get full sentences).
