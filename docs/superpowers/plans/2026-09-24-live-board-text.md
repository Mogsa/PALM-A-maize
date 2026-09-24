# Live Text on the Board Implementation Plan (D20, D21, and a note from a line)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A chunk's text on the board becomes live: select words on a card and Highlight them (the same highlight the paper shows), Split the chunk there, or Cut the lines out as their own piece; select chunks that are neighbours in the paper and Join them, or Group anything else; and a line let go of on empty board makes a note there, already connected.

**Architecture:** One serial contract task (G.0) fixes every shape both sides share: the three stateless chunk routes and their error codes in `api.py` (with the geometry functions stubbed), the client's types and API methods, and one new reducer action, `reshape`, that does Split, Cut and Join as one undo step. Then two streams run in parallel in separate worktrees with disjoint files: **GS** writes the geometry on the server (finding selected words inside a chunk, cutting a region between printed lines, joining neighbours by word order) with pytest; **GW** writes the board's side (reading a selection off a card, the text popover, the selection bar, Group as one gesture, the note from a line) with vitest. A last serial task (**GE**) adds one Playwright spec. The server computes every region, anchor and block, so there is one implementation of each rule; the client only places, ids and dispatches.

**Tech Stack:** Python 3.12, FastAPI, PyMuPDF 1.28.2, rapidfuzz, pytest, ruff. React 19, `@xyflow/react` 12.11, TypeScript, Vite, vitest 5 with jsdom, Playwright. No new dependency on either side.

**Spec:** `docs/SPEC.md` (sixth revision: sections 4, 5.1, 5.3, 6, 12 rows D20 and D21 and "a note from a line") and `docs/SPEC-ADDENDUM.md` sections 4.7, **4.10**, 6 (the chunk routes) and 12. They are the contract; where this plan and they disagree, they win and the plan is wrong. Conventions follow `2026-09-16-frontend-features.md`.

**Not in this plan:** D22 (notes in Markdown with maths) and D23 (sketch notes). Another plan implements them. Nothing here touches `NoteNode.tsx`, the note store, or the note routes.

**Verified before writing.** Every code block below was run once in a scratch copy of `build/steps-4-5` at 5030762 and then removed: `pytest` 441 passed (the whole suite plus the new files), `ruff check src tests` clean, `npm test` 334 passed, `npm run build` clean, and `npm run e2e` 35 passed (every existing spec plus the four in GE). The ResNet numbers in the tests are measured, not guessed.

---

## Global Constraints

- All geometry is PyMuPDF page space: PDF points, origin top-left, y down, pages 0-indexed (addendum 2). The browser sends **no geometry** to the chunk routes: only words (quote selectors) and the chunk's stored region (addendum 4.10).
- Ids are minted client-side with `newId(kind)` (addendum 4.5). The chunk routes return drafts with no `id`, no `position`, no `parentId` (addendum 6).
- The three chunk routes are stateless: they read `source.json` and the PDF, never `board.json`, and write nothing. The client needs no `flush()` before calling them.
- One gesture, one undo step (addendum 4.7): Highlight on a card is one `addHighlight`; Split here, Cut out and Join are one `reshape` each; Group is one `upsertNodes`; a note from a line is one `add` holding the note and its edge.
- The first piece of a split **keeps the chunk's node id**, so connections to the chunk, its `source_id` and its place in a group stay with it and no edge is rewritten (addendum 4.10, `[CHOICE]`).
- Nothing is generated (principle 1): the server finds the reader's own words; it never proposes a cut.
- Every path into `<ReactFlow>` still goes through `parentsFirst` (addendum 4.2).
- Errors are shown to the reader or logged with `console.error`, never swallowed. A `422 quote_not_found` is shown in the popover in the reader's words.
- CSS uses tokens only (`web/src/styles/tokens.css`); no new token is needed.
- Functions under 50 lines, files under 800 lines. `ruff check src tests` clean; `npm run build` clean.
- Commit messages: `<type>(server|web): <imperative description>`, ending with:

```
Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01487DAMwQ9qocJcb7QHx5sG
```

## Review Focus

The five inputs the spec implies and no feature test would otherwise exercise, most likely to bite a person first. Each has its test in the owning task.

1. **A phrase that appears more than once inside the same chunk** ("Eqn.(1)" is in ResNet §3.2 four times). The mark must land on the occurrence selected, not the first. Test: GS.1 `test_a_phrase_twice_in_the_chunk_is_marked_where_it_was_selected`.
2. **A selection that crosses a displayed equation or a paragraph break on the card.** The card joins its text blocks with a line break and shows the equation as an image; the highlight must take the page's lines on both sides. Tests: GW.2 `quoteAround` "joins blocks with a line break", GS.1 `test_words_across_a_displayed_equation_take_the_lines_on_both_sides`.
3. **A drag that starts on a card's text.** It must select text and never move the card; a drag on the card's head must still move it. Test: GE test 1 compares the card's box before and after the selection.
4. **Split here with the selection on the chunk's first line** (or Cut out of the whole chunk). Nothing to divide: the board must not change, no undo step, and the reader is told. Tests: GS.2 `test_a_selection_on_the_first_line_leaves_nothing_to_divide`, GW.1 `recutPlan` "is null", GW.2 `TextPopover` "changes nothing and says so".
5. **Undo after a Join that removed chunks with connections.** Every piece and every line that pointed at them must come back; a line between two joined pieces must not survive as a line from a chunk to itself. Test: G.0.2 `reshape` "undo after a join brings back every piece and every line".

---

## How it runs

```
G.0 (serial) ──► GS server  ─┐
                 GW web     ─┴─► GE e2e (serial)
```

GS and GW branch from the merge of G.0, each in its own git worktree, and merge in either order. No file is owned by both. If a task finds it must change a file it does not own, that is a defect in this plan: stop and raise it.

| Task | Owns (may create or modify) | Must not touch |
|---|---|---|
| G.0 | `src/paperboard/api.py`, `src/paperboard/chunk_text.py` (stub), `src/paperboard/recut.py` (stub), `tests/test_board_text_api.py` (first half), `web/src/model/types.ts`, `web/src/model/boardReducer.ts`, `web/src/model/reshape.test.ts`, `web/src/api/client.ts`, `web/src/api/chunkRoutes.test.ts` | everything else |
| GS | `src/paperboard/anchoring.py`, `src/paperboard/snap.py`, `src/paperboard/chunk_text.py`, `src/paperboard/recut.py`, `tests/test_chunk_text.py`, `tests/test_recut.py`, `tests/test_board_text_api.py` (second half) | `api.py`, everything under `web/` |
| GW | `web/src/board/**` (new files listed below, plus `BoardView.tsx` and `nodes/ChunkBody.tsx`), `web/src/styles/board.css` | `web/src/model/**`, `web/src/api/**`, `web/src/state/**`, `web/src/paper/**`, `NoteNode.tsx`, anything under `src/` |
| GE | `web/e2e/step6.spec.ts` (new) | everything else |

G.0 writes the first half of `tests/test_board_text_api.py` and GS appends to it afterwards; that is sequential, not shared.

**Stable interfaces during the wave.** These exist when G.0 ends and do not change:

- `POST /api/papers/{id}/chunks/highlight {region, quote}` → `{highlight}`; `POST .../chunks/split {region, at, mode}` → `{nodes: [piece]}`; `POST .../chunks/join {regions}` → `{node: piece, order}`; `422` codes `quote_not_found` and `not_contiguous` (addendum 6).
- `chunk_text.highlight_in_chunk(doc, pdf, region, quote) -> HighlightAnchor`, `chunk_text.QuoteNotFound`; `recut.recut(doc, pdf, region, at, mode) -> list[dict]`, `recut.join(doc, pdf, regions) -> tuple[dict, list[int]]`, `recut.NotContiguous`, `recut.RecutMode`. GS fills them in; their signatures do not change.
- `api.highlightInChunk`, `api.recut`, `api.join`; types `RecutMode`, `Piece`, `JoinResult`; the reducer action `{ type: "reshape"; keep; add?; removeIds? }` and its type `Reshape`.
- Everything the features plan's Shared DOM contract names, unchanged.

**Running in a worktree.** A worktree has no fixture PDFs and no `.venv`. Symlink the three PDFs from the main checkout's `tests/fixtures/papers/` (git ignores them), run Python as `PYTHONPATH=src <main>/.venv/bin/pytest ...` so the worktree's code is the one imported, and for Playwright set `PAPERBOARD_BIN` to a two-line script that runs `<main>/.venv/bin/paperboard` with that `PYTHONPATH`, and `PAPERBOARD_FIXTURE`/`PAPERBOARD_ATTENTION` to the main checkout's PDFs (`web/e2e/server.mjs`). Symlink `web/node_modules` from the main checkout if it has none. Remove the symlinks before committing; none of them may be committed.

---

## Shared DOM contract (additions)

GE selects by these. The owner creates each and must not rename it.

| Selector or accessible name | Owner | What it is |
|---|---|---|
| `.node-body p.block-text.nodrag` | GW.2 | a chunk's text block; selectable, a drag on it never moves the card |
| dialog "Words on the card" (`.text-popover`), buttons "Highlight", "Split here", "Cut out", "Dismiss"; `.popover-note` (role status) | GW.2 | the popover a selection on a card opens |
| toolbar "Selected pieces" (`.selection-bar`), buttons "Join", "Group" | GW.3 | shown while two or more pieces are selected |
| `.node.note textarea` focused after a line is let go of on empty board | GW.4 | the note from a line |

## File structure

```
src/paperboard/api.py                 G.0   three routes, three request models, two error handlers
src/paperboard/chunk_text.py          G.0 stub, GS.1   find selected words inside a chunk; the highlight from them
src/paperboard/recut.py               G.0 stub, GS.2, GS.3   Split here, Cut out, Join
src/paperboard/anchoring.py           GS.1  find_quote(accept=...), matched_lines
src/paperboard/snap.py                GS.1  line_highlight, chunk_anchor made public
tests/test_board_text_api.py          G.0, GS.4
tests/test_chunk_text.py              GS.1
tests/test_recut.py                   GS.2, GS.3

web/src/model/types.ts                G.0   RecutMode, Piece, JoinResult
web/src/api/client.ts                 G.0   highlightInChunk, recut, join
web/src/api/chunkRoutes.test.ts       G.0
web/src/model/boardReducer.ts         G.0   the reshape action, Reshape
web/src/model/reshape.test.ts         G.0

web/src/board/recut.ts                GW.1  recutPlan, joinPlan
web/src/board/cardSelection.ts        GW.2  quoteAround, readCardSelection
web/src/board/TextPopover.tsx         GW.2  Highlight, Split here, Cut out
web/src/board/nodes/ChunkBody.tsx     GW.2  nodrag on text blocks
web/src/board/grouping.ts             GW.3  groupAround
web/src/board/SelectionBar.tsx        GW.3  Join or Group
web/src/board/dropNote.ts             GW.4  onEmptyBoard, noteAtDrop
web/src/board/BoardView.tsx           GW.2, GW.3, GW.4
web/src/styles/board.css              GW.2, GW.3

web/e2e/step6.spec.ts                 GE
```

Test commands: server from the repo root, `.venv/bin/pytest <file> -v` and `.venv/bin/ruff check src tests`; web from `web/`, `npm test -- <file>`, `npm test`, `npm run build`, `npm run e2e`.

---

## Task G.0: The contract (serial)

**Owns:** see the table. **Must not touch:** everything else.
**Consumes:** `board_model.ChunkAnchor`, `QuoteSelector`, `HighlightAnchor`; the store and `opened()` in `api.py`; `ApiError`, `send`, `paper` in `client.ts`; `edit()`, `isNewConnection` in the reducer.
**Produces:** everything under "Stable interfaces during the wave".

### Task G.0.1: The chunk routes, with the geometry stubbed

**Files:**
- Create: `src/paperboard/chunk_text.py`, `src/paperboard/recut.py` (stubs), `tests/test_board_text_api.py`
- Modify: `src/paperboard/api.py`

**Interfaces:**
- Produces: the three routes; `ChunkHighlightRequest`, `RecutRequest`, `JoinRequest`; `QuoteNotFound` → `422 quote_not_found`; `NotContiguous` → `422 not_contiguous`; the stub functions above.

- [ ] **Step 1: Write the failing test**

`tests/test_board_text_api.py`:

```python
"""The chunk routes (addendum 6, section 4.10): stateless, writing nothing, with
their own 422 codes."""

import pytest
from conftest import LOCAL, local_client
from fastapi.testclient import TestClient

from paperboard.api import create_app

SHORTCUTS = "The shortcut connections in Eqn.(1) introduce neither extra parameter nor computation complexity."
IDENTITY = "3.2. Identity Mapping by Shortcuts"


@pytest.fixture
def client(store_root):
    return local_client(create_app(store_root))


@pytest.fixture
def resnet_id(client):
    return next(p["paper_id"] for p in client.get("/api/papers").json() if "residual" in p["paper_id"])


def _section(client, paper_id: str, title: str) -> dict:
    """The chunk data split makes for a section, by its title."""
    source = client.get(f"/api/papers/{paper_id}/source").json()
    section = next(s for s in source["sections"] if s["title"] == title)
    drafts = client.post(f"/api/papers/{paper_id}/split").json()["nodes"]
    return next(d["data"] for d in drafts if d["data"]["source_id"] == section["id"])


@pytest.mark.parametrize("route, body", [
    ("highlight", {"quote": {"exact": "x"}}),
    ("split", {"region": None, "at": {"exact": "x"}, "mode": "split"}),
    ("join", {"regions": []}),
])
def test_a_malformed_request_is_invalid(client, resnet_id, route, body):
    response = client.post(f"/api/papers/{resnet_id}/chunks/{route}", json=body)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid"


def test_a_split_mode_must_be_split_or_cut(client, resnet_id):
    region = _section(client, resnet_id, IDENTITY)["region"]
    response = client.post(f"/api/papers/{resnet_id}/chunks/split", json={"region": region, "at": {"exact": SHORTCUTS}, "mode": "slice"})
    assert response.status_code == 422


def test_the_chunk_routes_need_the_app_header(store_root, resnet_id):
    bare = TestClient(create_app(store_root), base_url=LOCAL)
    assert bare.post(f"/api/papers/{resnet_id}/chunks/join", json={"regions": []}).status_code == 403
```

- [ ] **Step 2: Run it and watch it fail**

Run: `.venv/bin/pytest tests/test_board_text_api.py -v`
Expected: FAIL. The malformed requests get `404` (no such route), not `422`.

- [ ] **Step 3: Write the stubs**

`src/paperboard/chunk_text.py`:

```python
"""Words selected in a chunk's text on the board, found again in the paper
(SPEC-ADDENDUM.md section 4.10, D20). The browser sends the words, never a
position: the card's text is reflowed, so only the words say where they are.
One rule finds them, for a highlight and for Split here and Cut out."""

import pymupdf

from paperboard.board_model import ChunkAnchor, HighlightAnchor, QuoteSelector
from paperboard.source_model import SourceDocument


class QuoteNotFound(ValueError):
    """The words are not inside the chunk's region: `422 quote_not_found`."""


def highlight_in_chunk(doc: SourceDocument, pdf: pymupdf.Document, region: ChunkAnchor,
                       quote: QuoteSelector) -> HighlightAnchor:
    """`POST /chunks/highlight`. Written in Task GS.1."""
    raise NotImplementedError("Task GS.1")
```

`src/paperboard/recut.py`:

```python
"""Split here, Cut out and Join: a chunk cut again on the board (SPEC-ADDENDUM.md
section 4.10, D21). The paper's order lives inside a chunk; the reader's order
lives between chunks. Reads the source and the PDF; writes nothing."""

from typing import Literal

import pymupdf

from paperboard.board_model import ChunkAnchor, QuoteSelector
from paperboard.source_model import SourceDocument

RecutMode = Literal["split", "cut"]


class NotContiguous(ValueError):
    """Chunks that are not neighbours in the paper: `422 not_contiguous`."""


def recut(doc: SourceDocument, pdf: pymupdf.Document, region: ChunkAnchor, at: QuoteSelector,
          mode: RecutMode) -> list[dict]:
    """`POST /chunks/split`. Written in Task GS.2."""
    raise NotImplementedError("Task GS.2")


def join(doc: SourceDocument, pdf: pymupdf.Document, regions: list[ChunkAnchor]) -> tuple[dict, list[int]]:
    """`POST /chunks/join`. Written in Task GS.3."""
    raise NotImplementedError("Task GS.3")
```

- [ ] **Step 4: Add the routes to `api.py`**

Imports (ruff sorts them this way; `board_model` wraps):

```python
from paperboard.board_model import (
    Board,
    ChunkAnchor,
    ChunkNode,
    FigureNode,
    NoteNode,
    QuoteSelector,
    TagFile,
    TemplateFile,
)
from paperboard.chunk_text import QuoteNotFound, highlight_in_chunk
from paperboard.clips import DEFAULT_DPI, render_clip, render_etag
from paperboard.export import ExportOrder, export_markdown
from paperboard.extract import extract
from paperboard.recut import NotContiguous, RecutMode, join, recut
```

After `class ExportRequest`:

```python
class ChunkHighlightRequest(BaseModel):
    region: ChunkAnchor
    quote: QuoteSelector


class RecutRequest(BaseModel):
    region: ChunkAnchor
    at: QuoteSelector
    mode: RecutMode


class JoinRequest(BaseModel):
    regions: list[ChunkAnchor] = Field(min_length=2)
```

Inside `create_app`, **before** the `ValueError` handler (Starlette picks the handler of the most specific class, but keep them together):

```python
    @app.exception_handler(QuoteNotFound)
    async def _quote_missing(_: Request, exc: QuoteNotFound):
        return _error(422, "quote_not_found", str(exc))

    @app.exception_handler(NotContiguous)
    async def _not_neighbours(_: Request, exc: NotContiguous):
        return _error(422, "not_contiguous", str(exc))
```

Before the `# -- tags` section:

```python
    # -- chunks on the board (addendum 4.10) --------------------------------

    @app.post("/api/papers/{paper_id}/chunks/highlight")
    def post_chunk_highlight(paper_id: str, body: ChunkHighlightRequest):
        doc = store.read_source(paper_id)
        with opened(paper_id) as pdf:
            return {"highlight": highlight_in_chunk(doc, pdf, body.region, body.quote).model_dump(mode="json")}

    @app.post("/api/papers/{paper_id}/chunks/split")
    def post_chunk_split(paper_id: str, body: RecutRequest):
        doc = store.read_source(paper_id)
        with opened(paper_id) as pdf:
            return {"nodes": recut(doc, pdf, body.region, body.at, body.mode)}

    @app.post("/api/papers/{paper_id}/chunks/join")
    def post_chunk_join(paper_id: str, body: JoinRequest):
        doc = store.read_source(paper_id)
        with opened(paper_id) as pdf:
            node, order = join(doc, pdf, body.regions)
        return {"node": node, "order": order}
```

- [ ] **Step 5: Run it and watch it pass**

Run: `.venv/bin/pytest tests/test_board_text_api.py tests/test_api.py -v && .venv/bin/ruff check src tests`
Expected: PASS, ruff clean.

- [ ] **Step 6: Commit**

```bash
git add src/paperboard/api.py src/paperboard/chunk_text.py src/paperboard/recut.py tests/test_board_text_api.py
git commit -m "feat(server): the chunk routes for live board text, with the geometry stubbed"
```

### Task G.0.2: The client's side of the contract, and `reshape`

**Files:**
- Modify: `web/src/model/types.ts`, `web/src/api/client.ts`, `web/src/model/boardReducer.ts`
- Test: `web/src/api/chunkRoutes.test.ts`, `web/src/model/reshape.test.ts`

**Interfaces:**
- Produces: `RecutMode`, `Piece`, `JoinResult`; `api.highlightInChunk(id, region, quote): Promise<HighlightAnchor>`, `api.recut(id, region, at, mode): Promise<Piece[]>`, `api.join(id, regions): Promise<JoinResult | null>` (null on `not_contiguous`, throws on anything else); `Reshape = { keep: ChunkNode; add?: ChunkNode[]; removeIds?: string[] }` and the action `{ type: "reshape" } & Reshape`.

- [ ] **Step 1: Write the failing tests**

`web/src/api/chunkRoutes.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChunkAnchor } from "../model/types";
import { api } from "./client";

const q = { exact: "x", prefix: "", suffix: "" };
const region: ChunkAnchor = { rects: [{ page: 2, rect: [50, 100, 286, 400] }], start: q, end: q, position: 0, state: "anchored" };

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", fn);
  return fn;
}
const sent = (fn: ReturnType<typeof mockFetch>) => {
  const [url, init] = fn.mock.calls.at(-1) as unknown as [string, RequestInit];
  return { url, method: init.method, headers: init.headers as Record<string, string>, body: JSON.parse(init.body as string) };
};

afterEach(() => vi.unstubAllGlobals());

describe("the chunk routes (addendum 4.10)", () => {
  it("highlightInChunk posts the region and the quote and returns the anchor", async () => {
    const anchor = { rects: region.rects, quote: q, position: 3, state: "anchored" };
    const fn = mockFetch(200, { highlight: anchor });
    expect(await api.highlightInChunk("p", region, q)).toEqual(anchor);
    expect(sent(fn)).toMatchObject({ url: "/api/papers/p/chunks/highlight", method: "POST", body: { region, quote: q } });
    expect(sent(fn).headers["X-Paperboard"]).toBe("1");
  });

  it("highlightInChunk throws the server's quote_not_found", async () => {
    mockFetch(422, { error: { code: "quote_not_found", message: "not in this piece" } });
    await expect(api.highlightInChunk("p", region, q)).rejects.toMatchObject({ code: "quote_not_found" });
  });

  it("recut posts the mode and returns the pieces", async () => {
    const fn = mockFetch(200, { nodes: [{ type: "chunk", data: {} }] });
    expect(await api.recut("p", region, q, "cut")).toHaveLength(1);
    expect(sent(fn)).toMatchObject({ url: "/api/papers/p/chunks/split", body: { region, at: q, mode: "cut" } });
  });

  it("join returns the joined piece, null for chunks that are not neighbours, and throws anything else", async () => {
    const fn = mockFetch(200, { node: { type: "chunk", data: {} }, order: [1, 0] });
    expect(await api.join("p", [region, region])).toMatchObject({ order: [1, 0] });
    expect(sent(fn)).toMatchObject({ url: "/api/papers/p/chunks/join", body: { regions: [region, region] } });
    mockFetch(422, { error: { code: "not_contiguous", message: "not neighbours" } });
    expect(await api.join("p", [region, region])).toBeNull();
    mockFetch(500, { error: { code: "internal", message: "boom" } });
    await expect(api.join("p", [region, region])).rejects.toMatchObject({ code: "internal" });
  });
});
```

`web/src/model/reshape.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { boardReducer, initialBoardState, type BoardAction, type BoardState } from "./boardReducer";
import { emptyBoard, type BoardNode, type ChunkNode, type Rect } from "./types";

const q = { exact: "x", prefix: "", suffix: "" };
const chunk = (id: string, y: number, extra: Partial<ChunkNode> = {}): ChunkNode => ({
  id, type: "chunk", position: { x: 0, y }, width: 320, ...extra,
  data: { tags: [], collapsed: false, user_sized: false, blocks: [],
    region: { rects: [{ page: 0, rect: [50, y, 280, y + 100] as Rect }], start: q, end: q, position: 0, state: "anchored" } },
});
const note = (id: string): BoardNode => ({ id, type: "note", position: { x: 600, y: 0 }, data: { tags: [], collapsed: false, note: `notes/${id}.md`, origin: "reader" } });
const edge = (id: string, from: string, to: string) => ({ id, from, to, data: { tags: [] } });
const run = (s: BoardState, a: BoardAction) => boardReducer(s, a);
const loaded = (nodes: BoardNode[], edges = [] as ReturnType<typeof edge>[]) =>
  run(initialBoardState, { type: "load", board: { ...emptyBoard("p"), nodes, edges } });

describe("reshape: Split here, Cut out and Join (addendum 4.10)", () => {
  it("a split keeps the chunk's id and its connections, and puts the new pieces just after it, as one undo step", () => {
    const s0 = loaded([chunk("n-a", 0), note("n-n"), chunk("n-z", 500)], [edge("e-1", "n-a", "n-n")]);
    const keep = chunk("n-a", 0, { position: { x: 7, y: 0 } });
    const s1 = run(s0, { type: "reshape", keep, add: [chunk("n-b", 0), chunk("n-c", 0)] });
    expect(s1.board.nodes.map((n) => n.id)).toEqual(["n-a", "n-b", "n-c", "n-n", "n-z"]);
    expect(s1.board.nodes[0].position.x).toBe(7);
    expect(s1.board.edges).toEqual(s0.board.edges);
    expect(s1.history.past).toHaveLength(1);
    expect(run(s1, { type: "undo" }).board.nodes.map((n) => n.id)).toEqual(["n-a", "n-n", "n-z"]);
  });

  it("a join removes the others and moves their connections to the kept chunk", () => {
    const s0 = loaded([chunk("n-a", 0), chunk("n-b", 100), note("n-n"), note("n-m")],
      [edge("e-1", "n-n", "n-b"), edge("e-2", "h-1", "n-b")]);
    const s1 = run(s0, { type: "reshape", keep: chunk("n-a", 0), removeIds: ["n-b"] });
    expect(s1.board.nodes.map((n) => n.id)).toEqual(["n-a", "n-n", "n-m"]);
    expect(s1.board.edges).toEqual([edge("e-1", "n-n", "n-a"), edge("e-2", "h-1", "n-a")]);
  });

  it("a line between two joined chunks goes, and so does a second line to the same note", () => {
    const s0 = loaded([chunk("n-a", 0), chunk("n-b", 100), note("n-n")],
      [edge("e-1", "n-a", "n-b"), edge("e-2", "n-a", "n-n"), edge("e-3", "n-n", "n-b")]);
    const s1 = run(s0, { type: "reshape", keep: chunk("n-a", 0), removeIds: ["n-b"] });
    expect(s1.board.edges).toEqual([edge("e-2", "n-a", "n-n")]);
  });

  it("undo after a join brings back every piece and every line that pointed at them (Review Focus 5)", () => {
    const edges = [edge("e-1", "n-a", "n-b"), edge("e-3", "n-n", "n-b")];
    const s0 = loaded([chunk("n-a", 0), chunk("n-b", 100), note("n-n")], edges);
    const s2 = run(run(s0, { type: "reshape", keep: chunk("n-a", 0), removeIds: ["n-b"] }), { type: "undo" });
    expect(s2.board.nodes.map((n) => n.id)).toEqual(["n-a", "n-b", "n-n"]);
    expect(s2.board.edges).toEqual(edges);
  });

  it("does nothing, and records nothing, when the kept chunk is no longer on the board", () => {
    const s0 = loaded([chunk("n-a", 0)]);
    const s1 = run(s0, { type: "reshape", keep: chunk("n-gone", 0), add: [chunk("n-b", 0)] });
    expect(s1).toBe(s0);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd web && npm test -- chunkRoutes reshape`
Expected: FAIL. `api.highlightInChunk is not a function`; the reducer has no `reshape` case.

- [ ] **Step 3: Add the types, the methods and the action**

`web/src/model/types.ts`, after `ReextractResult`:

```ts
/** Split here or Cut out on a card (addendum 4.10). */
export type RecutMode = "split" | "cut";
/** A chunk the chunk routes propose: no id, position or parentId; the client takes those from the chunk it replaces
 *  (addendum 6). */
export type Piece = { type: "chunk"; data: ChunkData };
/** `POST /chunks/join`: the joined piece, and the indices of the regions sent, in paper order. */
export type JoinResult = { node: Piece; order: number[] };
```

`web/src/api/client.ts`: import `ChunkAnchor`, `HighlightAnchor`, `JoinResult`, `Piece`, `QuoteSelector`, `RecutMode` with the other types, and after `split`:

```ts
  /** Words selected on a card, found inside the chunk's region (addendum 4.10). Words not there throw `quote_not_found`. */
  highlightInChunk: async (id: string, region: ChunkAnchor, quote: QuoteSelector): Promise<HighlightAnchor> =>
    (await send<{ highlight: HighlightAnchor }>("POST", `${paper(id)}/chunks/highlight`, { region, quote })).highlight,
  /** Split here or Cut out: the chunk's pieces in paper order; fewer than two means nothing to divide. */
  recut: async (id: string, region: ChunkAnchor, at: QuoteSelector, mode: RecutMode): Promise<Piece[]> =>
    (await send<{ nodes: Piece[] }>("POST", `${paper(id)}/chunks/split`, { region, at, mode })).nodes,
  /** Join: the joined piece and the paper order of `regions`, or null when they are not neighbours in the paper. */
  async join(id: string, regions: ChunkAnchor[]): Promise<JoinResult | null> {
    try {
      return await send<JoinResult>("POST", `${paper(id)}/chunks/join`, { regions });
    } catch (error) {
      if (error instanceof ApiError && error.code === "not_contiguous") return null;
      throw error;
    }
  },
```

`web/src/model/boardReducer.ts`: import `ChunkNode` from `./types`; after `FigureClip`:

```ts
/** Split here, Cut out and Join (addendum 4.10): `keep` replaces the chunk with its id, `add` goes in just after it,
 *  `removeIds` go, and their edges move to `keep`. */
export type Reshape = { keep: ChunkNode; add?: ChunkNode[]; removeIds?: string[] };
```

add `| ({ type: "reshape" } & Reshape)` as the last member of `EditAction`; before `setTags`:

```ts
/** One undo step for Split here, Cut out or Join. An edge end on a removed chunk moves to `keep`; a line that would
 *  then join `keep` to itself, or repeat a connection, is dropped (isNewConnection). Nothing happens if `keep` is gone. */
function reshape(board: Board, { keep, add = [], removeIds = [] }: Reshape): Board {
  if (!board.nodes.some((n) => n.id === keep.id)) return board;
  const removed = new Set(removeIds.filter((id) => id !== keep.id));
  const nodes = board.nodes.flatMap((n) => (n.id === keep.id ? [keep, ...add] : removed.has(n.id) ? [] : [n]));
  const moved = (id: string) => (removed.has(id) ? keep.id : id);
  const edges: BoardEdge[] = [];
  for (const e of board.edges) {
    const edge = removed.has(e.from) || removed.has(e.to) ? { ...e, from: moved(e.from), to: moved(e.to) } : e;
    if (isNewConnection(edges, edge)) edges.push(edge);
  }
  return { ...board, nodes, edges };
}
```

and in `applyEdit`: `case "reshape": return reshape(board, action);`

- [ ] **Step 4: Run them and watch them pass**

Run: `cd web && npm test && npm run build`
Expected: PASS, build clean.

- [ ] **Step 5: Commit**

```bash
git add web/src/model/types.ts web/src/api/client.ts web/src/api/chunkRoutes.test.ts web/src/model/boardReducer.ts web/src/model/reshape.test.ts
git commit -m "feat(web): the chunk routes' client methods, and reshape as one undo step"
```

---

## Task GS: The geometry, on the server (parallel)

**Owns:** `src/paperboard/{anchoring,snap,chunk_text,recut}.py`, `tests/test_chunk_text.py`, `tests/test_recut.py`, the second half of `tests/test_board_text_api.py`.
**Must not touch:** `api.py`, everything under `web/`.
**Consumes:** G.0.1's stubs and routes; `find_quote`, `_matched_lines`, `_page_spans`, `build_index` (anchoring); `line_highlight` and `chunk_anchor` (snap, made public here); `chunk_blocks` (blocks); `lines_under`, `page_words`, `text_under`, `Word` (words); `column_runs`, `contains_point`, `midpoint` (geometry); `FURNITURE` (source_model); `split()` for test fixtures.
**Produces:** the stubbed functions, working; `anchoring.matched_lines`; `find_quote(..., accept=None)`; `chunk_text.lines_in_region`.

Four sub-tasks in order, each ending with `.venv/bin/pytest <its files> -v && .venv/bin/ruff check src tests` green and a commit. The fixture's `extracted` session fixture takes about ten seconds per session.

### Task GS.1: Finding the words inside a chunk, and the highlight from them (D20)

**Files:**
- Modify: `src/paperboard/anchoring.py`, `src/paperboard/snap.py`, `src/paperboard/chunk_text.py`
- Test: `tests/test_chunk_text.py`

**Interfaces:**
- Produces: `find_quote(index, quote, position, page_hint, span=1, accept: Callable[[Match], bool] | None = None)`; `matched_lines(pdf, index, match) -> list[PageRect] | None`; `snap.line_highlight`, `snap.chunk_anchor` (renamed from `_line_highlight`, `_chunk_anchor`); `lines_in_region(pdf, index, region, quote) -> list[PageRect]`; `highlight_in_chunk`.

- [ ] **Step 1: Write the failing test**

`tests/test_chunk_text.py`:

```python
"""Words selected in a chunk on the board, found again inside its region, and the
highlight made from them (addendum 4.10, D20)."""

import pymupdf
import pytest
from conftest import FIXTURES

from paperboard.anchoring import build_index
from paperboard.board_model import Board, ChunkData, QuoteSelector
from paperboard.chunk_text import QuoteNotFound, highlight_in_chunk, lines_in_region
from paperboard.geometry import contains_point, midpoint
from paperboard.snap import select
from paperboard.split import split

SHORTCUTS = "The shortcut connections in Eqn.(1) introduce neither extra parameter nor computation complexity."


@pytest.fixture(scope="module")
def resnet(extracted):
    doc = extracted["resnet"]
    pdf = pymupdf.open(FIXTURES["resnet"])
    yield doc, pdf
    pdf.close()


def _section(doc, pdf, number: str) -> ChunkData:
    """The chunk split makes for a section: §3.2 of ResNet runs down both columns of page 2."""
    section = next(s for s in doc.sections if s.number == number)
    draft = next(d for d in split(doc, Board(paper_id=doc.paper_id), pdf) if d["data"]["source_id"] == section.id)
    return ChunkData.model_validate(draft["data"])


def _inside(line, rects) -> bool:
    return any(r.page == line.page and contains_point(r.rect, *midpoint(line.rect)) for r in rects)


def test_a_sentence_on_a_card_becomes_a_highlight_of_its_own_lines(resnet):
    doc, pdf = resnet
    region = _section(doc, pdf, "3.2").region
    anchor = highlight_in_chunk(doc, pdf, region, QuoteSelector(exact=SHORTCUTS, prefix="for simplifying notations. "))
    assert anchor.quote.exact.split()[:3] == ["The", "shortcut", "connections"]
    assert anchor.quote.exact.split()[-1] == "complexity."
    assert len(anchor.rects) == 2                              # two printed lines, one rect each (D1)
    assert all(_inside(line, region.rects) for line in anchor.rects)
    assert anchor.quote.prefix and anchor.quote.suffix       # the page's own text either side


def test_the_highlight_is_the_one_the_paper_would_make_from_the_same_lines(resnet):
    doc, pdf = resnet
    region = _section(doc, pdf, "3.2").region
    anchor = highlight_in_chunk(doc, pdf, region, QuoteSelector(exact=SHORTCUTS))
    paper = select(doc, pdf, anchor.rects, snap=False, lines=anchor.rects).highlight
    assert anchor == paper


def test_a_phrase_twice_in_the_chunk_is_marked_where_it_was_selected(resnet):
    """Review Focus 1: "Eqn.(1)" is in §3.2 four times; prefix and suffix pick the one selected."""
    doc, pdf = resnet
    region = _section(doc, pdf, "3.2").region
    first = highlight_in_chunk(doc, pdf, region, QuoteSelector(exact="Eqn.(1)", prefix="The shortcut connections in ", suffix=" introduce neither"))
    second = highlight_in_chunk(doc, pdf, region, QuoteSelector(exact="Eqn.(1)", prefix="dimensions of x and F must be equal in ", suffix=".\nIf this"))
    assert first.rects != second.rects
    assert first.rects[0].rect[1] < second.rects[0].rect[1]   # the first is higher in the right column


def test_words_across_a_displayed_equation_take_the_lines_on_both_sides(resnet):
    """Review Focus 2: the card joins its text blocks with a line break and shows the equation as an image."""
    doc, pdf = resnet
    region = _section(doc, pdf, "3.2").region
    quote = QuoteSelector(exact="we consider a building block defined as:\nHere x and y are the input")
    anchor = highlight_in_chunk(doc, pdf, region, quote)
    assert anchor.quote.exact.startswith("we consider") and anchor.quote.exact.endswith("the input")
    assert anchor.rects[0].rect[1] < 626 < anchor.rects[-1].rect[1]   # equation (1) sits at y 626 on page 2


def test_words_outside_the_chunk_are_not_found_even_when_they_are_in_the_paper(resnet):
    doc, pdf = resnet
    region = _section(doc, pdf, "3.2").region
    with pytest.raises(QuoteNotFound):
        highlight_in_chunk(doc, pdf, region, QuoteSelector(exact="Let us consider H(x) as an underlying mapping"))


def test_the_lines_found_are_inside_the_region_in_reading_order(resnet):
    doc, pdf = resnet
    region = _section(doc, pdf, "3.2").region
    lines = lines_in_region(pdf, build_index(doc), region, QuoteSelector(exact=SHORTCUTS))
    assert [line.page for line in lines] == [2, 2]
    assert lines[0].rect[1] < lines[1].rect[1]
```

- [ ] **Step 2: Run it and watch it fail**

Run: `.venv/bin/pytest tests/test_chunk_text.py -v`
Expected: FAIL, `ImportError: cannot import name 'lines_in_region'`.

- [ ] **Step 3: Let `find_quote` take an `accept`, and expose `matched_lines`**

`src/paperboard/anchoring.py`: `from collections.abc import Callable`. Change `find_quote`'s signature and docstring, and its candidate test:

```python
def find_quote(index: list[PageIndex], quote: QuoteSelector, position: int, page_hint: int, span: int = 1,
               accept: Callable[[Match], bool] | None = None) -> Match | None:
    """Best match across pages, nearest page to the hint searched first only so
    that ties resolve toward it; every page is scored, since scoring all twelve
    pages of a paper costs a few milliseconds.

    A quote that crossed a page break when it was made (`span` pages) is matched
    against every run of that many pages, joined (addendum 5.2); the match's
    `page` is then the first of them and its offsets run on across the break.

    `accept`, when given, must approve a candidate before it can be the best:
    the words selected in a chunk on the board are taken only inside that
    chunk (addendum 4.10). It is asked only of a candidate that would win."""
```

replacing the two lines

```python
            if score >= MIN_SCORE and (best is None or score > best.score):
                best = Match(page.page, start, end, score)
```

with

```python
            if score < MIN_SCORE or (best is not None and score <= best.score):
                continue
            match = Match(page.page, start, end, score)
            if accept is None or accept(match):
                best = match
```

and, before `resolve_highlight`:

```python
def matched_lines(pdf: pymupdf.Document, index: list[PageIndex], match: Match) -> list[PageRect] | None:
    """A `find_quote` match's own printed lines, page by page, as a highlight's
    lines are recomputed (addendum 5.1). None when no page gives any."""
    return _matched_lines(pdf, index, _page_spans(index, match))
```

The whole existing suite must still pass: with no `accept`, `find_quote` returns exactly what it did.

- [ ] **Step 4: Make two of `snap.py`'s functions public**

Rename `_chunk_anchor` to `chunk_anchor` and `_line_highlight` to `line_highlight`, at their definitions and at their three call sites in `_select_text` and `_select_area`. Nothing else changes.

- [ ] **Step 5: Write `chunk_text.py`**

Replace the stub with:

```python
"""Words selected in a chunk's text on the board, found again in the paper
(SPEC-ADDENDUM.md section 4.10, D20). The browser sends the words, never a
position: the card's text is reflowed, so only the words say where they are.
One rule finds them, for a highlight and for Split here and Cut out."""

import pymupdf

from paperboard.anchoring import Match, PageIndex, build_index, find_quote, matched_lines
from paperboard.board_model import ChunkAnchor, HighlightAnchor, QuoteSelector
from paperboard.geometry import contains_point, midpoint
from paperboard.snap import line_highlight
from paperboard.source_model import PageRect, SourceDocument

SPANS = (1, 2)   # a selection is looked for on one page, then across a page break (addendum 5.2)


class QuoteNotFound(ValueError):
    """The words are not inside the chunk's region: `422 quote_not_found`."""


def _inside(line: PageRect, rects: list[PageRect]) -> bool:
    """Section 4.0's containment test: the line's midpoint in a region rect on its page."""
    return any(r.page == line.page and contains_point(r.rect, *midpoint(line.rect)) for r in rects)


def lines_in_region(pdf: pymupdf.Document, index: list[PageIndex], region: ChunkAnchor,
                    quote: QuoteSelector) -> list[PageRect]:
    """The printed lines of the words `quote` names, found by section 5.2's matcher
    and accepted only where the first and last of them lie inside `region`, so the
    same words elsewhere in the paper are never taken."""
    def accept(match: Match) -> bool:
        lines = matched_lines(pdf, index, match)
        return bool(lines) and _inside(lines[0], region.rects) and _inside(lines[-1], region.rects)

    for span in SPANS:
        match = find_quote(index, quote, region.position, region.rects[0].page, span, accept=accept)
        if match is not None:
            return matched_lines(pdf, index, match) or []
    raise QuoteNotFound(f"the words {quote.exact[:40]!r} are not in this piece")


def highlight_in_chunk(doc: SourceDocument, pdf: pymupdf.Document, region: ChunkAnchor,
                       quote: QuoteSelector) -> HighlightAnchor:
    """`POST /chunks/highlight`: a highlight anchor for words selected on a card,
    built from their lines as `POST /text` builds one from the browser's `lines`,
    so it is the same shape as a highlight made on the paper over the same words."""
    index = build_index(doc)
    anchor = line_highlight(pdf, index, lines_in_region(pdf, index, region, quote))
    if anchor is None:
        raise QuoteNotFound(f"no word of {quote.exact[:40]!r} is on the page")
    return anchor
```

- [ ] **Step 6: Run it and watch it pass**

Run: `.venv/bin/pytest tests/test_chunk_text.py tests/test_anchoring.py tests/test_snap.py tests/test_api.py -v && .venv/bin/ruff check src tests`
Expected: PASS, ruff clean.

- [ ] **Step 7: Commit**

```bash
git add src/paperboard/anchoring.py src/paperboard/snap.py src/paperboard/chunk_text.py tests/test_chunk_text.py
git commit -m "feat(server): find words selected on a card inside its chunk, and highlight them (D20)"
```

### Task GS.2: Split here and Cut out, between printed lines (D21)

**Files:**
- Modify: `src/paperboard/recut.py`
- Test: `tests/test_recut.py`

**Interfaces:**
- Consumes: `lines_in_region` (GS.1), `chunk_anchor` (GS.1), `chunk_blocks`, `text_under`.
- Produces: `recut(doc, pdf, region, at, mode) -> list[dict]`, each `{"type": "chunk", "data": ChunkData as JSON}`, in paper order.

- [ ] **Step 1: Write the failing test**

`tests/test_recut.py`:

```python
"""Split here, Cut out and Join (addendum 4.10, D21): pieces between printed lines,
in paper order, and neighbours joined back exactly."""

import pymupdf
import pytest
from conftest import FIXTURES

from paperboard.board_model import Board, ChunkData, ChunkNode, QuoteSelector
from paperboard.chunk_text import QuoteNotFound
from paperboard.recut import recut
from paperboard.split import split

SHORTCUTS = QuoteSelector(exact="The shortcut connections in Eqn.(1) introduce neither extra parameter nor computation complexity.")


@pytest.fixture(scope="module")
def resnet(extracted):
    doc = extracted["resnet"]
    pdf = pymupdf.open(FIXTURES["resnet"])
    yield doc, pdf
    pdf.close()


@pytest.fixture(scope="module")
def sections(resnet):
    doc, pdf = resnet
    drafts = split(doc, Board(paper_id=doc.paper_id), pdf)
    by_number = {s.id: s.number for s in doc.sections}
    return {by_number[d["data"]["source_id"]]: ChunkData.model_validate(d["data"])
            for d in drafts if d["type"] == "chunk" and d["data"]["source_id"] in by_number}


def _text(data: ChunkData) -> str:
    return " ".join(" ".join(b.text.split()) for b in data.blocks if b.kind == "text")


def _pieces(drafts: list[dict]) -> list[ChunkData]:
    for draft in drafts:
        assert set(draft) == {"type", "data"} and draft["type"] == "chunk"     # no id, position or parentId
        ChunkNode.model_validate({**draft, "id": "n-1", "position": {"x": 0, "y": 0}})
    return [ChunkData.model_validate(d["data"]) for d in drafts]


def test_split_here_divides_the_chunk_at_the_line_the_selection_starts_on(resnet, sections):
    doc, pdf = resnet
    whole = sections["3.2"]
    before, after = _pieces(recut(doc, pdf, whole.region, SHORTCUTS, "split"))
    assert _text(after).startswith("The shortcut connections in Eqn.(1)")
    assert _text(before).endswith("after the addition (i.e., σ(y), see Fig. 2).")
    assert f"{_text(before)} {_text(after)}" == _text(whole)          # nothing lost, nothing twice, paper order


def test_cut_out_makes_three_pieces_in_paper_order_and_the_middle_is_the_lines_selected(resnet, sections):
    doc, pdf = resnet
    whole = sections["3.2"]
    before, middle, after = _pieces(recut(doc, pdf, whole.region, SHORTCUTS, "cut"))
    assert _text(middle).startswith("The shortcut connections") and _text(middle).endswith("This is not only")
    assert " ".join(_text(p) for p in (before, middle, after)) == _text(whole)
    for piece in (before, middle, after):
        assert piece.region.start.exact and piece.region.end.exact and piece.region.state == "anchored"


def test_a_selection_on_the_first_line_leaves_nothing_to_divide(resnet, sections):
    """Review Focus 4: one piece back, and the client changes nothing."""
    doc, pdf = resnet
    whole = sections["3.2"]
    assert len(recut(doc, pdf, whole.region, QuoteSelector(exact="3.2. Identity Mapping by Shortcuts"), "split")) == 1


def test_a_cut_of_words_outside_the_chunk_is_refused(resnet, sections):
    doc, pdf = resnet
    with pytest.raises(QuoteNotFound):
        recut(doc, pdf, sections["3.2"].region, QuoteSelector(exact="Let us consider H(x) as an underlying mapping"), "cut")
```

The middle piece ends "This is not only" because the selection ends mid-line at "complexity." and the piece takes that whole printed line (addendum 4.10, `[CHOICE]`).

- [ ] **Step 2: Run it and watch it fail**

Run: `.venv/bin/pytest tests/test_recut.py -v`
Expected: FAIL, `NotImplementedError: Task GS.2`.

- [ ] **Step 3: Write `recut` and its helpers**

In `src/paperboard/recut.py`, replace everything between the module docstring and the `join` stub with the following, and leave the `join` stub as it is:

```python
from typing import Literal

import pymupdf

from paperboard.anchoring import PageIndex, build_index
from paperboard.blocks import chunk_blocks
from paperboard.board_model import ChunkAnchor, ChunkData, QuoteSelector
from paperboard.chunk_text import lines_in_region
from paperboard.geometry import contains_point, midpoint
from paperboard.snap import chunk_anchor
from paperboard.source_model import PageRect, SourceDocument
from paperboard.words import text_under

RecutMode = Literal["split", "cut"]
Boundary = tuple[int, float]    # the region rect a boundary cuts, and the y it cuts at


class NotContiguous(ValueError):
    """Chunks that are not neighbours in the paper: `422 not_contiguous`."""


def _boundary(rects: list[PageRect], line: PageRect, top: bool) -> Boundary:
    """Where a matched line divides the region: its top or bottom edge, in the rect holding its midpoint."""
    point = midpoint(line.rect)
    at = next(i for i, r in enumerate(rects) if r.page == line.page and contains_point(r.rect, *point))
    return at, line.rect[1] if top else line.rect[3]


def _cut(rects: list[PageRect], boundaries: list[Boundary]) -> list[list[PageRect]]:
    """The region's rects cut across at each boundary, grouped into the pieces between them."""
    pieces: list[list[PageRect]] = [[]]
    for i, r in enumerate(rects):
        x0, y0, x1, y1 = r.rect
        top = y0
        for _, y in [b for b in boundaries if b[0] == i]:
            y = min(max(y, top), y1)
            if y > top:
                pieces[-1].append(PageRect(page=r.page, rect=(x0, top, x1, y)))
            pieces.append([])
            top = y
        if y1 > top:
            pieces[-1].append(PageRect(page=r.page, rect=(x0, top, x1, y1)))
    return pieces


def _piece(doc: SourceDocument, pdf: pymupdf.Document, index: list[PageIndex], rects: list[PageRect]) -> dict | None:
    """A chunk of these rects, as a cut makes one (addendum 5.1): a rect with no
    block under it is dropped, and no rect left is no piece."""
    kept = [(r, blocks) for r in rects if (blocks := chunk_blocks(doc, pdf, [r]))]
    if not kept:
        return None
    rects = [r for r, _ in kept]
    region = chunk_anchor(pdf, index, rects, [text_under(pdf[r.page], r.rect) for r in rects])
    data = ChunkData(region=region, blocks=[b for _, blocks in kept for b in blocks])
    return {"type": "chunk", "data": data.model_dump(mode="json")}


def recut(doc: SourceDocument, pdf: pymupdf.Document, region: ChunkAnchor, at: QuoteSelector,
          mode: RecutMode) -> list[dict]:
    """`POST /chunks/split`: the pieces of the chunk, in paper order, divided at the
    top of the line where `at` starts and, for `"cut"`, at the bottom of the line
    where it ends. Empty pieces are left out; fewer than two means nothing to divide."""
    index = build_index(doc)
    lines = lines_in_region(pdf, index, region, at)
    boundaries = [_boundary(region.rects, lines[0], top=True)]
    if mode == "cut":
        boundaries.append(_boundary(region.rects, lines[-1], top=False))
    pieces = [_piece(doc, pdf, index, rects) for rects in _cut(region.rects, boundaries)]
    return [p for p in pieces if p is not None]
```

Why a cut at a line's ink top gives whole lines: `text_under` and `chunk_blocks` keep a printed line in the rect that holds at least half its height (`LINE_INSIDE`, words.py), so the line the boundary touches falls wholly on its later side, and the line above wholly on the earlier.

- [ ] **Step 4: Run it and watch it pass**

Run: `.venv/bin/pytest tests/test_recut.py -v && .venv/bin/ruff check src tests`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/paperboard/recut.py tests/test_recut.py
git commit -m "feat(server): Split here and Cut out divide a chunk between printed lines (D21)"
```

### Task GS.3: Join, for neighbours by word order (D21)

**Files:**
- Modify: `src/paperboard/recut.py`
- Test: `tests/test_recut.py`

**Interfaces:**
- Consumes: `_piece` (GS.2); `page_words`, `lines_under`, `Word`; `column_runs`; `FURNITURE`.
- Produces: `join(doc, pdf, regions) -> (piece, order)`; raises `NotContiguous`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_recut.py`, and make its import `from paperboard.recut import NotContiguous, join, recut`:

```python
def test_joining_the_pieces_of_a_cut_gives_back_the_original_exactly(resnet, sections):
    doc, pdf = resnet
    whole = sections["3.2"]
    pieces = _pieces(recut(doc, pdf, whole.region, SHORTCUTS, "cut"))
    joined, order = join(doc, pdf, [pieces[2].region, pieces[0].region, pieces[1].region])
    assert order == [1, 2, 0]                                          # paper order of the regions sent
    data = ChunkData.model_validate(joined["data"])
    assert data.region.rects == whole.region.rects
    assert data.blocks == whole.blocks


def test_sections_that_follow_each_other_are_neighbours(resnet, sections):
    doc, pdf = resnet
    _, order = join(doc, pdf, [sections["3.2"].region, sections["3.1"].region])
    assert order == [1, 0]


def test_chunks_with_text_between_them_are_not_neighbours(resnet, sections):
    doc, pdf = resnet
    with pytest.raises(NotContiguous):
        join(doc, pdf, [sections["3.1"].region, sections["3.3"].region])
    pieces = _pieces(recut(doc, pdf, sections["3.2"].region, SHORTCUTS, "cut"))
    with pytest.raises(NotContiguous):
        join(doc, pdf, [pieces[0].region, pieces[2].region])
```

- [ ] **Step 2: Run them and watch them fail**

Run: `.venv/bin/pytest tests/test_recut.py -v`
Expected: the three new tests FAIL, `NotImplementedError: Task GS.3`.

- [ ] **Step 3: Write `join`**

Add to the imports `from itertools import pairwise`, `column_runs` (geometry), `FURNITURE` (source_model), `Word, lines_under, page_words` (words). Below `Boundary`:

```python
WordKey = tuple[int, int]       # a word's place in reading order: page, index in page_words
```

Replace the `join` stub with:

```python
def _word_order(pdf: pymupdf.Document, page: int, cache: dict[int, dict[Word, int]]) -> dict[Word, int]:
    """Each word of the page and its index in `page_words`, the reading order `page_text` is built in."""
    if page not in cache:
        cache[page] = {w: i for i, w in enumerate(page_words(pdf[page]))}
    return cache[page]


def _span(pdf: pymupdf.Document, rects: list[PageRect], cache: dict) -> tuple[WordKey, WordKey] | None:
    """A chunk's first and last word in reading order, by the whole-word rule; None with no word."""
    keys = [(r.page, _word_order(pdf, r.page, cache)[w])
            for r in rects for line in lines_under(pdf[r.page], r.rect) for w in line]
    return (min(keys), max(keys)) if keys else None


def _furniture(doc: SourceDocument, page: int, word: Word) -> bool:
    x, y = midpoint(word[:4])
    return any(r.page == page and r.label in FURNITURE and contains_point(r.rect, x, y) for r in doc.regions)


def _neighbours(doc: SourceDocument, pdf: pymupdf.Document, last: WordKey, first: WordKey, cache: dict) -> bool:
    """The next chunk begins at or before the last word of this one, or only furniture lies between."""
    if first <= last:
        return True
    return all(_furniture(doc, page, w) for page in range(last[0], first[0] + 1)
               for w, i in _word_order(pdf, page, cache).items() if last < (page, i) < first)


def join(doc: SourceDocument, pdf: pymupdf.Document, regions: list[ChunkAnchor]) -> tuple[dict, list[int]]:
    """`POST /chunks/join`: one chunk of neighbours' regions, and their indices in
    paper order. Their rects are collapsed by the column-run rule, so the pieces
    of a split join back into the original rects exactly."""
    cache: dict[int, dict[Word, int]] = {}
    spans = [_span(pdf, r.rects, cache) for r in regions]
    if any(s is None for s in spans):
        raise NotContiguous("a piece with no words has no neighbours")
    order = sorted(range(len(regions)), key=lambda i: spans[i])
    for a, b in pairwise(order):
        if not _neighbours(doc, pdf, spans[a][1], spans[b][0], cache):
            raise NotContiguous("these pieces are not neighbours in the paper")
    widths = {p.index: p.width for p in doc.pages}
    runs = column_runs([(r.page, r.rect) for i in order for r in regions[i].rects], widths)
    piece = _piece(doc, pdf, build_index(doc), [PageRect(page=page, rect=rect) for page, rect in runs])
    if piece is None:
        raise NotContiguous("the joined region holds nothing")
    return piece, order
```

`_word_order` keys words by their whole tuple, as `lines_under` returns them; PyMuPDF returns the same tuples on every call for a page, and no two words on a page share a box. Measured: a join of three pieces of §3.2 takes about 0.1 s.

- [ ] **Step 4: Run them and watch them pass**

Run: `.venv/bin/pytest tests/test_recut.py -v && .venv/bin/ruff check src tests`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/paperboard/recut.py tests/test_recut.py
git commit -m "feat(server): Join chunks that are neighbours in the paper, by word order (D21)"
```

### Task GS.4: The routes, end to end

**Files:**
- Test: `tests/test_board_text_api.py` (append)

- [ ] **Step 1: Write the tests**

Append to `tests/test_board_text_api.py`:

```python
OUTSIDE = "Let us consider H(x) as an underlying mapping"


def test_highlight_returns_an_anchor_and_writes_nothing(client, resnet_id, store_root):
    region = _section(client, resnet_id, IDENTITY)["region"]
    response = client.post(f"/api/papers/{resnet_id}/chunks/highlight", json={"region": region, "quote": {"exact": SHORTCUTS}})
    assert response.status_code == 200
    anchor = response.json()["highlight"]
    assert len(anchor["rects"]) == 2 and anchor["quote"]["exact"].startswith("The shortcut")
    assert not (store_root / "papers" / resnet_id / "board.json").exists()


def test_words_not_in_the_chunk_are_quote_not_found(client, resnet_id):
    region = _section(client, resnet_id, IDENTITY)["region"]
    for route, body in (("highlight", {"region": region, "quote": {"exact": OUTSIDE}}),
                        ("split", {"region": region, "at": {"exact": OUTSIDE}, "mode": "cut"})):
        response = client.post(f"/api/papers/{resnet_id}/chunks/{route}", json=body)
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "quote_not_found"


def test_cut_then_join_round_trips_through_the_routes(client, resnet_id):
    whole = _section(client, resnet_id, IDENTITY)
    cut = client.post(f"/api/papers/{resnet_id}/chunks/split", json={"region": whole["region"], "at": {"exact": SHORTCUTS}, "mode": "cut"})
    pieces = cut.json()["nodes"]
    assert len(pieces) == 3 and all("id" not in p and "position" not in p for p in pieces)
    joined = client.post(f"/api/papers/{resnet_id}/chunks/join", json={"regions": [p["data"]["region"] for p in pieces]})
    assert joined.status_code == 200
    assert joined.json()["order"] == [0, 1, 2]
    assert joined.json()["node"]["data"]["region"]["rects"] == whole["region"]["rects"]


def test_pieces_that_are_not_neighbours_are_not_contiguous(client, resnet_id):
    whole = _section(client, resnet_id, IDENTITY)
    pieces = client.post(f"/api/papers/{resnet_id}/chunks/split", json={"region": whole["region"], "at": {"exact": SHORTCUTS}, "mode": "cut"}).json()["nodes"]
    response = client.post(f"/api/papers/{resnet_id}/chunks/join", json={"regions": [pieces[0]["data"]["region"], pieces[2]["data"]["region"]]})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "not_contiguous"
```

- [ ] **Step 2: Run the whole suite**

Run: `.venv/bin/pytest -v && .venv/bin/ruff check src tests`
Expected: PASS (about ten minutes for the whole suite), ruff clean.

- [ ] **Step 3: Commit**

```bash
git add tests/test_board_text_api.py
git commit -m "test(server): the chunk routes end to end: stateless, 422 codes, cut and join round trip"
```

---

## Task GW: The board (parallel)

**Owns:** `web/src/board/recut.ts`, `cardSelection.ts`, `TextPopover.tsx`, `grouping.ts`, `SelectionBar.tsx`, `dropNote.ts` and their tests, `web/src/board/BoardView.tsx`, `web/src/board/nodes/ChunkBody.tsx`, `web/src/styles/board.css`.
**Must not touch:** `web/src/model/**`, `web/src/api/**`, `web/src/state/**`, `web/src/paper/**` (importing `paper/place.ts` is fine), `NoteNode.tsx`, anything under `src/`.
**Consumes:** from G.0.2, `api.highlightInChunk`, `api.recut`, `api.join`, `Piece`, `JoinResult`, `RecutMode`, `Reshape` and the `reshape` action; from the features plan, `useBoard`, `newId`, `newNote`, `newEdge`, `endOf`, `reparent`, `isDescendant`, `Box`, `XY`, `CHUNK_WIDTH`, `GAP`, `popoverPlace`, the `.popover` classes.
**Produces:** the Shared DOM contract additions.

Four sub-tasks in order, each ending with `cd web && npm test && npm run build` green and a commit. The chunk routes are mocked in every test here; GW never needs the server.

### Task GW.1: What Split, Cut and Join do to the board

**Files:**
- Create: `web/src/board/recut.ts`
- Test: `web/src/board/recut.test.ts`

**Interfaces:**
- Produces: `recutPlan(chunk: ChunkNode, pieces: Piece[]): Reshape | null`; `joinPlan(chunks: ChunkNode[], result: JoinResult): Reshape`.

- [ ] **Step 1: Write the failing test**

`web/src/board/recut.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { ChunkAnchor, ChunkNode, Piece, Rect } from "../model/types";
import { GAP } from "./layout";
import { joinPlan, recutPlan } from "./recut";

const q = (exact: string) => ({ exact, prefix: "", suffix: "" });
const region = (y: number): ChunkAnchor => ({ rects: [{ page: 2, rect: [50, y, 286, y + 50] as Rect }], start: q(`at ${y}`), end: q("end"), position: y, state: "anchored" });
const piece = (y: number): Piece => ({ type: "chunk", data: { tags: [], collapsed: false, user_sized: false, source_id: null, region: region(y),
  blocks: [{ kind: "text", page: 2, rect: [50, y, 286, y + 50], text: `text ${y}` }] } });
const chunk = (id: string, extra: Partial<ChunkNode> = {}, data: Partial<ChunkNode["data"]> = {}): ChunkNode => ({
  id, type: "chunk", position: { x: 100, y: 40 }, width: 300, height: 500, parentId: "n-g", ...extra,
  data: { tags: ["t-claim"], collapsed: false, user_sized: true, source_id: "sec-6", region: region(0), blocks: [], ...data },
});

describe("recutPlan (addendum 4.10)", () => {
  it("keeps the chunk as the first piece, with its id, place, tags and source_id, sized to its text again", () => {
    const plan = recutPlan(chunk("n-a"), [piece(0), piece(100), piece(200)])!;
    expect(plan.keep).toMatchObject({ id: "n-a", position: { x: 100, y: 40 }, parentId: "n-g", width: 300,
      data: { tags: ["t-claim"], source_id: "sec-6", user_sized: false, region: region(0) } });
    expect(plan.keep.height).toBeUndefined();
  });
  it("puts each later piece to the right of the one before, in the same group, without the source_id", () => {
    const { add = [] } = recutPlan(chunk("n-a"), [piece(0), piece(100), piece(200)])!;
    expect(add.map((n) => n.position)).toEqual([{ x: 100 + 300 + GAP, y: 40 }, { x: 100 + 2 * (300 + GAP), y: 40 }]);
    expect(add.every((n) => n.parentId === "n-g" && n.id.startsWith("n-") && n.id !== "n-a")).toBe(true);
    expect(add.map((n) => n.data.region)).toEqual([region(100), region(200)]);
    expect(add[0].data.source_id).toBeUndefined();
    expect(add[0].data.tags).toEqual(["t-claim"]);
  });
  it("is null when there is nothing to divide (Review Focus 4)", () => {
    expect(recutPlan(chunk("n-a"), [piece(0)])).toBeNull();
  });
});

describe("joinPlan (addendum 4.10)", () => {
  it("keeps the chunk first in paper order, takes every tag, and removes the others", () => {
    const a = chunk("n-a", {}, { tags: ["t-claim"], source_id: null });
    const b = chunk("n-b", { position: { x: 900, y: 0 } }, { tags: ["t-method", "t-claim"], source_id: "sec-6" });
    const plan = joinPlan([a, b], { node: piece(0), order: [1, 0] });
    expect(plan.keep).toMatchObject({ id: "n-b", position: { x: 900, y: 0 }, data: { tags: ["t-method", "t-claim"], source_id: "sec-6", region: region(0) } });
    expect(plan.removeIds).toEqual(["n-a"]);
  });
  it("carries the first source_id in paper order when the kept chunk has none", () => {
    const plan = joinPlan([chunk("n-a", {}, { source_id: null }), chunk("n-b", {}, { source_id: "sec-7" })], { node: piece(0), order: [0, 1] });
    expect(plan.keep.data.source_id).toBe("sec-7");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd web && npm test -- board/recut`
Expected: FAIL, `./recut` does not resolve.

- [ ] **Step 3: Write `recut.ts`**

```ts
import type { Reshape } from "../model/boardReducer";
import { newId } from "../model/ids";
import type { ChunkNode, JoinResult, Piece } from "../model/types";
import { CHUNK_WIDTH, GAP } from "./layout";

/** A piece takes over a chunk's text: its own region and blocks, sized to its text again (addendum 4.10). */
function refilled(chunk: ChunkNode, piece: Piece, tags = chunk.data.tags, sourceId = chunk.data.source_id): ChunkNode {
  return { ...chunk, height: undefined, data: { ...chunk.data, region: piece.data.region, blocks: piece.data.blocks, user_sized: false, tags, source_id: sourceId } };
}

/** Split here or Cut out on the board: the first piece is the chunk itself, keeping its id, place, parent, width, tags,
 *  collapse and source_id, so its connections stay; each later piece is a new chunk to the right of the one before,
 *  GAP apart, with the same parent, width, tags and collapse and no source_id. Null when there is nothing to divide. */
export function recutPlan(chunk: ChunkNode, pieces: Piece[]): Reshape | null {
  if (pieces.length < 2) return null;
  const width = chunk.width ?? CHUNK_WIDTH;
  const add = pieces.slice(1).map((piece, i): ChunkNode => ({
    id: newId("n"), type: "chunk", width, ...(chunk.parentId ? { parentId: chunk.parentId } : {}),
    position: { x: chunk.position.x + (i + 1) * (width + GAP), y: chunk.position.y },
    data: { tags: [...chunk.data.tags], collapsed: chunk.data.collapsed, region: piece.data.region, blocks: piece.data.blocks, user_sized: false },
  }));
  return { keep: refilled(chunk, pieces[0]), add };
}

/** Join on the board: `chunks` in the order their regions were sent. The one first in paper order is kept, with the
 *  joined region and blocks, every chunk's tags in paper order, and the first source_id in paper order; the others go,
 *  and the reducer moves their connections to it. */
export function joinPlan(chunks: ChunkNode[], { node, order }: JoinResult): Reshape {
  const inOrder = order.map((i) => chunks[i]);
  const tags = [...new Set(inOrder.flatMap((c) => c.data.tags))];
  const sourceId = inOrder.map((c) => c.data.source_id).find(Boolean) ?? null;
  return { keep: refilled(inOrder[0], node, tags, sourceId), removeIds: inOrder.slice(1).map((c) => c.id) };
}
```

`height: undefined` is dropped on save (addendum 4.1), so the kept piece sizes to its new text.

- [ ] **Step 4: Run it and watch it pass**

Run: `cd web && npm test -- board/recut && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/board/recut.ts web/src/board/recut.test.ts
git commit -m "feat(web): what Split here, Cut out and Join do to the board, as reshape plans"
```

### Task GW.2: Selecting words on a card, and the text popover (D20, D21)

**Files:**
- Create: `web/src/board/cardSelection.ts`, `web/src/board/TextPopover.tsx`
- Modify: `web/src/board/nodes/ChunkBody.tsx`, `web/src/board/BoardView.tsx`, `web/src/styles/board.css`
- Test: `web/src/board/cardSelection.test.ts`, `web/src/board/TextPopover.test.tsx`

**Interfaces:**
- Consumes: `recutPlan` (GW.1).
- Produces: `QUOTE_CONTEXT = 32`, `CARD_TEXT`, `CardPoint`, `CardSelection = { nodeId; quote; at: DOMRect }`, `quoteAround(texts, start, end)`, `readCardSelection(root)`; `<TextPopover selection onClose />`, `NOT_FOUND_MESSAGE`, `NOTHING_TO_DIVIDE`.

- [ ] **Step 1: Write the failing tests**

`web/src/board/cardSelection.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { QUOTE_CONTEXT, quoteAround, readCardSelection } from "./cardSelection";

const texts = ["We adopt residual learning to every few stacked layers.", "Here x and y are the input and output vectors."];

describe("quoteAround (addendum 4.10)", () => {
  it("quotes the words selected in one block, with the card's text either side", () => {
    expect(quoteAround(texts, { para: 0, offset: 9 }, { para: 0, offset: 26 })).toEqual({
      exact: "residual learning", prefix: "We adopt ", suffix: " to every few stacked layers.\nHe",
    });
  });
  it("joins blocks with a line break, so a selection across a displayed equation keeps both sides (Review Focus 2)", () => {
    const quote = quoteAround(texts, { para: 0, offset: 30 }, { para: 1, offset: 10 })!;
    expect(quote.exact).toBe("every few stacked layers.\nHere x and");
  });
  it("trims whitespace at either end and cuts the context to QUOTE_CONTEXT characters", () => {
    const quote = quoteAround(texts, { para: 0, offset: 39 }, { para: 1, offset: 0 })!;
    expect(quote.exact).toBe("stacked layers.");
    expect(quote.prefix).toHaveLength(QUOTE_CONTEXT);
  });
  it("is null when only whitespace is selected", () => {
    expect(quoteAround(texts, { para: 0, offset: 55 }, { para: 1, offset: 0 })).toBeNull();
  });
});

describe("readCardSelection", () => {
  afterEach(() => { document.body.innerHTML = ""; window.getSelection()?.removeAllRanges(); });

  const card = (id: string) => `<div class="react-flow__node" data-id="${id}"><div class="node-body">
    <p class="block-text"><span>We adopt </span><mark>residual</mark><span> learning.</span></p>
    <img class="block-clip">
    <p class="block-text"><span>Here x and y.</span></p></div></div>`;
  const select = (from: Node, fromOffset: number, to: Node, toOffset: number) => {
    const range = document.createRange();
    range.setStart(from, fromOffset);
    range.setEnd(to, toOffset);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
  };

  it("reads the card and the words from a selection that crosses a mark and a clip", () => {
    document.body.innerHTML = `<div id="board">${card("n-1")}</div>`;
    const [first, second] = Array.from(document.querySelectorAll("p.block-text"));
    select(first.querySelector("mark")!.firstChild!, 0, second.querySelector("span")!.firstChild!, 4);
    const read = readCardSelection(document.getElementById("board")!)!;
    expect(read.nodeId).toBe("n-1");
    expect(read.quote).toEqual({ exact: "residual learning.\nHere", prefix: "We adopt ", suffix: " x and y." });
  });

  it("is null for a selection that runs from one card into another", () => {
    document.body.innerHTML = `<div id="board">${card("n-1")}${card("n-2")}</div>`;
    const paras = document.querySelectorAll("p.block-text span");
    select(paras[0].firstChild!, 0, paras[3].firstChild!, 3);
    expect(readCardSelection(document.getElementById("board")!)).toBeNull();
  });

  it("is null when nothing is selected", () => {
    document.body.innerHTML = `<div id="board">${card("n-1")}</div>`;
    expect(readCardSelection(document.getElementById("board")!)).toBeNull();
  });
});
```

`web/src/board/TextPopover.test.tsx`:

```tsx
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyBoard, type ChunkNode, type Rect } from "../model/types";

const dispatch = vi.fn();
const q = (exact: string) => ({ exact, prefix: "", suffix: "" });
const region = { rects: [{ page: 2, rect: [50, 100, 286, 400] as Rect }], start: q("a"), end: q("b"), position: 0, state: "anchored" as const };
const chunk: ChunkNode = { id: "n-c", type: "chunk", position: { x: 0, y: 0 }, width: 320, data: { tags: [], collapsed: false, region, blocks: [], user_sized: false } };
vi.mock("../state/BoardProvider", () => ({ useBoard: () => ({ state: { board: { ...emptyBoard("p"), nodes: [chunk] } }, dispatch, paperId: "p" }) }));
vi.mock("../api/client", () => ({ api: { highlightInChunk: vi.fn(), recut: vi.fn() } }));
import { api } from "../api/client";
import { NOT_FOUND_MESSAGE, NOTHING_TO_DIVIDE, TextPopover } from "./TextPopover";

const selection = { nodeId: "n-c", quote: q("residual learning"), at: { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 } as DOMRect };
const piece = (y: number) => ({ type: "chunk" as const, data: { ...chunk.data, region: { ...region, position: y } } });

beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => undefined); });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("TextPopover (D20, D21)", () => {
  it("Highlight asks the server for the anchor inside the chunk and adds it as one highlight", async () => {
    const anchor = { rects: region.rects, quote: q("residual learning"), position: 9, state: "anchored" as const };
    vi.mocked(api.highlightInChunk).mockResolvedValue(anchor);
    const onClose = vi.fn();
    const { getByRole } = render(<TextPopover selection={selection} onClose={onClose} />);
    fireEvent.click(getByRole("button", { name: "Highlight" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(api.highlightInChunk).toHaveBeenCalledWith("p", region, selection.quote);
    expect(dispatch).toHaveBeenCalledWith({ type: "addHighlight", highlight: { id: expect.stringMatching(/^h-/), tags: [], anchor } });
  });

  it("Cut out replaces the chunk by its pieces as one reshape", async () => {
    vi.mocked(api.recut).mockResolvedValue([piece(0), piece(1), piece(2)]);
    const { getByRole } = render(<TextPopover selection={selection} onClose={vi.fn()} />);
    fireEvent.click(getByRole("button", { name: "Cut out" }));
    await waitFor(() => expect(dispatch).toHaveBeenCalledTimes(1));
    expect(api.recut).toHaveBeenCalledWith("p", region, selection.quote, "cut");
    const action = dispatch.mock.calls[0][0];
    expect(action.type).toBe("reshape");
    expect(action.keep.id).toBe("n-c");
    expect(action.add).toHaveLength(2);
  });

  it("changes nothing and says so when there is nothing to divide (Review Focus 4)", async () => {
    vi.mocked(api.recut).mockResolvedValue([piece(0)]);
    const { getByRole, findByRole } = render(<TextPopover selection={selection} onClose={vi.fn()} />);
    fireEvent.click(getByRole("button", { name: "Split here" }));
    expect((await findByRole("status")).textContent).toBe(NOTHING_TO_DIVIDE.split);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("says the words were not found when the server cannot find them in the chunk", async () => {
    vi.mocked(api.highlightInChunk).mockRejectedValue(Object.assign(new Error("x"), { code: "quote_not_found" }));
    const { getByRole, findByRole } = render(<TextPopover selection={selection} onClose={vi.fn()} />);
    fireEvent.click(getByRole("button", { name: "Highlight" }));
    expect((await findByRole("status")).textContent).toBe(NOT_FOUND_MESSAGE);
    expect(dispatch).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd web && npm test -- cardSelection TextPopover`
Expected: FAIL, the modules do not resolve.

- [ ] **Step 3: Write `cardSelection.ts`**

```ts
import type { QuoteSelector } from "../model/types";

/** Characters of the card's text either side of a selection, as the server's CONTEXT_CHARS (addendum 5.1). */
export const QUOTE_CONTEXT = 32;
/** A chunk's text blocks on a card, in reading order (ChunkBody). */
export const CARD_TEXT = "p.block-text";

/** A place in a card's text: which text block, and how many characters into it. */
export type CardPoint = { para: number; offset: number };
/** Words selected on one card, as the chunk routes take them (addendum 4.10), and where to show the popover. */
export type CardSelection = { nodeId: string; quote: QuoteSelector; at: DOMRect };

/** The quote for a selection from `start` to `end` in a card's text blocks, joined by a line break: the words exactly
 *  as the card shows them, trimmed, with up to QUOTE_CONTEXT characters either side. Null when only whitespace is
 *  selected. */
export function quoteAround(texts: string[], start: CardPoint, end: CardPoint): QuoteSelector | null {
  const joined = texts.join("\n");
  const at = (p: CardPoint) => texts.slice(0, p.para).reduce((sum, t) => sum + t.length + 1, 0) + p.offset;
  let s = at(start);
  let e = at(end);
  while (s < e && /\s/.test(joined[s])) s++;
  while (e > s && /\s/.test(joined[e - 1])) e--;
  if (s >= e) return null;
  return { exact: joined.slice(s, e), prefix: joined.slice(Math.max(0, s - QUOTE_CONTEXT), s), suffix: joined.slice(e, e + QUOTE_CONTEXT) };
}

/** The text block holding a DOM position, or null when it is outside every one. */
function paraOf(node: Node): HTMLElement | null {
  const element = node instanceof Element ? node : node.parentElement;
  return element?.closest<HTMLElement>(CARD_TEXT) ?? null;
}

/** How many characters of `para`'s text come before a DOM position inside it. */
function offsetIn(para: HTMLElement, node: Node, offset: number): number {
  const before = document.createRange();
  before.selectNodeContents(para);
  before.setEnd(node, offset);
  return before.toString().length;
}

/** The current selection when both its ends are in the text blocks of one card inside `root`; otherwise null. */
export function readCardSelection(root: HTMLElement): CardSelection | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  const first = paraOf(range.startContainer);
  const last = paraOf(range.endContainer);
  const card = first?.closest<HTMLElement>(".react-flow__node[data-id]");
  if (!first || !last || !card || !root.contains(card) || last.closest(".react-flow__node") !== card) return null;
  const paras = Array.from(card.querySelectorAll<HTMLElement>(CARD_TEXT));
  const quote = quoteAround(paras.map((p) => p.textContent ?? ""),
    { para: paras.indexOf(first), offset: offsetIn(first, range.startContainer, range.startOffset) },
    { para: paras.indexOf(last), offset: offsetIn(last, range.endContainer, range.endOffset) });
  if (!quote) return null;
  const at = typeof range.getBoundingClientRect === "function" ? range.getBoundingClientRect() : last.getBoundingClientRect();
  return { nodeId: card.dataset.id!, quote, at };
}
```

jsdom has no `Range.getBoundingClientRect`, hence the fallback; browsers have it.

- [ ] **Step 4: Write `TextPopover.tsx`**

```tsx
import { useEffect, useState } from "react";
import { api } from "../api/client";
import { newId } from "../model/ids";
import type { ChunkNode, RecutMode } from "../model/types";
import { popoverPlace } from "../paper/place";
import { useBoard } from "../state/BoardProvider";
import type { CardSelection } from "./cardSelection";
import { recutPlan } from "./recut";

const POPOVER_WIDTH = 320;
const POPOVER_HEIGHT = 110;
export const NOT_FOUND_MESSAGE = "These words could not be found in this piece's part of the paper.";
export const NOTHING_TO_DIVIDE = { split: "This is already where the piece starts.", cut: "The selection is already the whole piece." };
const FAILED_MESSAGE = "That did not work. Nothing was changed.";

/** Words selected on a card, then a choice (D20, D21): Highlight, Split here, Cut out. The server finds the words
 *  inside the chunk; each action is one undo step. */
export function TextPopover({ selection, onClose }: { selection: CardSelection; onClose: () => void }) {
  const { state, dispatch, paperId } = useBoard();
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const chunk = state.board.nodes.find((n): n is ChunkNode => n.id === selection.nodeId && n.type === "chunk");
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  useEffect(() => { if (!chunk) onClose(); }, [chunk, onClose]);   // undone or deleted meanwhile
  if (!chunk) return null;

  const run = async (act: () => Promise<string | null>) => {
    setBusy(true);
    try {
      const problem = await act();
      if (problem) setSaid(problem);
      else { window.getSelection()?.removeAllRanges(); onClose(); }
    } catch (failure) {
      console.error("board text action failed", failure);
      setSaid((failure as { code?: string }).code === "quote_not_found" ? NOT_FOUND_MESSAGE : FAILED_MESSAGE);
    } finally {
      setBusy(false);
    }
  };
  const highlight = () => run(async () => {
    const anchor = await api.highlightInChunk(paperId, chunk.data.region, selection.quote);
    dispatch({ type: "addHighlight", highlight: { id: newId("h"), tags: [], anchor } });
    return null;
  });
  const recut = (mode: RecutMode) => run(async () => {
    const plan = recutPlan(chunk, await api.recut(paperId, chunk.data.region, selection.quote, mode));
    if (!plan) return NOTHING_TO_DIVIDE[mode];
    dispatch({ type: "reshape", ...plan });
    return null;
  });

  const { left, top } = popoverPlace(selection.at, POPOVER_WIDTH, POPOVER_HEIGHT);
  return (
    <div className="popover text-popover" role="dialog" aria-label="Words on the card" style={{ left, top }} onMouseDown={(e) => e.stopPropagation()}>
      <div className="popover-preview" title={selection.quote.exact}>{selection.quote.exact}</div>
      <div className="popover-actions">
        <button className="action highlight" disabled={busy} title="Mark these words, here and on the paper" onClick={() => void highlight()}>
          <span className="swatch" aria-hidden="true" />Highlight
        </button>
        <button className="action" disabled={busy} title="Divide this piece where the selection starts" onClick={() => void recut("split")}>Split here</button>
        <button className="action" disabled={busy} title="Make the selected lines a piece of their own" onClick={() => void recut("cut")}>
          <span className="glyph" aria-hidden="true">✂</span>Cut out
        </button>
        <button className="quiet close" aria-label="Dismiss" onClick={onClose}>×</button>
      </div>
      {said && <p className="popover-note" role="status">{said}</p>}
    </div>
  );
}
```

- [ ] **Step 5: Make the text selectable and wire the popover**

`web/src/board/nodes/ChunkBody.tsx`: the text block's class becomes `"block-text nodrag"`, so React Flow does not start a drag from it (Review Focus 3).

`web/src/board/BoardView.tsx`: import `readCardSelection, type CardSelection` from `./cardSelection` and `TextPopover` from `./TextPopover`. Beside `edgeMenu`:

```tsx
  const [textMenu, setTextMenu] = useState<CardSelection | null>(null);
```

after `addGroup`:

```tsx
  /** Words selected on a card offer Highlight, Split here and Cut out (D20, D21). */
  const onBoardMouseUp = () => {
    const read = readCardSelection(boardRef.current!);
    if (read) setTextMenu(read);
  };
  const closeTextMenu = useCallback(() => setTextMenu(null), []);
```

`<div className="board" ref={boardRef} onMouseUp={onBoardMouseUp}>`; `onPaneClick={() => { closeEdgeMenu(); closeTextMenu(); }}`; and after the edge popover:

```tsx
      {textMenu && <TextPopover selection={textMenu} onClose={closeTextMenu} />}
```

One handler on the board reads the selection for every card; a card knows nothing of it.

`web/src/styles/board.css`, at the end:

```css
/* live text on the board (addendum 4.10): a chunk's text is selectable, and a drag on it selects rather than moves */
.node-body .block-text { user-select: text; cursor: text; }
.text-popover { width: 320px; }
.popover-note { margin: 8px 4px 0; font-size: var(--text-ui-small); color: var(--ink-muted); }
```

- [ ] **Step 6: Run them and watch them pass**

Run: `cd web && npm test && npm run build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add web/src/board/cardSelection.ts web/src/board/cardSelection.test.ts web/src/board/TextPopover.tsx web/src/board/TextPopover.test.tsx web/src/board/nodes/ChunkBody.tsx web/src/board/BoardView.tsx web/src/styles/board.css
git commit -m "feat(web): select words on a card to highlight them, split the chunk there, or cut them out (D20, D21)"
```

### Task GW.3: Join, or Group (D21)

**Files:**
- Create: `web/src/board/grouping.ts`, `web/src/board/SelectionBar.tsx`
- Modify: `web/src/board/BoardView.tsx`, `web/src/styles/board.css`
- Test: `web/src/board/grouping.test.ts`, `web/src/board/SelectionBar.test.tsx`

**Interfaces:**
- Consumes: `joinPlan` (GW.1).
- Produces: `GROUP_PAD = 24`, `GROUP_HEAD = 36`, `groupAround(nodes, ids, boxOf): BoardNode[]`; `<SelectionBar selected onGroup />`.

- [ ] **Step 1: Write the failing tests**

`web/src/board/grouping.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Box } from "../model/reparent";
import type { BoardNode } from "../model/types";
import { GROUP_HEAD, GROUP_PAD, groupAround } from "./grouping";

const note = (id: string, x: number, y: number, parentId?: string): BoardNode =>
  ({ id, type: "note", position: { x, y }, ...(parentId ? { parentId } : {}), data: { tags: [], collapsed: false, note: `notes/${id}.md`, origin: "reader" } });
const slot: BoardNode = { id: "n-s", type: "group", position: { x: 1000, y: 500 }, width: 800, height: 600, data: { tags: [], name: "Main point", prompt: "?" } };
const boxes: Record<string, Box> = {
  "n-a": { x: 100, y: 100, width: 200, height: 80 }, "n-b": { x: 400, y: 300, width: 200, height: 80 },
  "n-s": { x: 1000, y: 500, width: 800, height: 600 }, "n-c": { x: 1100, y: 600, width: 200, height: 80 }, "n-d": { x: 1400, y: 700, width: 200, height: 80 },
};
const boxOf = (id: string) => boxes[id];

describe("groupAround (addendum 4.10)", () => {
  it("makes a group just around the chosen nodes and re-parents them without moving them on screen", () => {
    const [group, a, b] = groupAround([note("n-a", 100, 100), note("n-b", 400, 300)], ["n-a", "n-b"], boxOf);
    expect(group).toMatchObject({ type: "group", position: { x: 100 - GROUP_PAD, y: 100 - GROUP_PAD - GROUP_HEAD },
      width: 500 + 2 * GROUP_PAD, height: 280 + 2 * GROUP_PAD + GROUP_HEAD, data: { name: null } });
    expect(group.parentId).toBeUndefined();
    expect(a).toMatchObject({ parentId: group.id, position: { x: GROUP_PAD, y: GROUP_PAD + GROUP_HEAD } });
    expect(b).toMatchObject({ parentId: group.id, position: { x: 300 + GROUP_PAD, y: 200 + GROUP_PAD + GROUP_HEAD } });
  });
  it("makes the group inside the parent the chosen nodes share", () => {
    const [group, c] = groupAround([slot, note("n-c", 100, 100, "n-s"), note("n-d", 400, 200, "n-s")], ["n-c", "n-d"], boxOf);
    expect(group).toMatchObject({ parentId: "n-s", position: { x: 100 - GROUP_PAD, y: 100 - GROUP_PAD - GROUP_HEAD } });
    expect(c.position).toEqual({ x: GROUP_PAD, y: GROUP_PAD + GROUP_HEAD });
  });
  it("leaves a chosen node inside another chosen node to move with it, and needs two things to group", () => {
    const made = groupAround([slot, note("n-c", 100, 100, "n-s"), note("n-a", 100, 100)], ["n-s", "n-c", "n-a"], boxOf);
    expect(made.map((n) => n.id).slice(1)).toEqual(["n-s", "n-a"]);
    expect(groupAround([note("n-a", 0, 0)], ["n-a"], boxOf)).toEqual([]);
  });
});
```

`web/src/board/SelectionBar.test.tsx`:

```tsx
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BoardNode, ChunkNode, Rect } from "../model/types";

const dispatch = vi.fn();
vi.mock("../state/BoardProvider", () => ({ useBoard: () => ({ dispatch, paperId: "p" }) }));
vi.mock("../api/client", () => ({ api: { join: vi.fn() } }));
import { api } from "../api/client";
import { SelectionBar } from "./SelectionBar";

const q = { exact: "x", prefix: "", suffix: "" };
const chunk = (id: string, y: number): ChunkNode => ({ id, type: "chunk", position: { x: 0, y }, width: 320,
  data: { tags: [], collapsed: true, blocks: [], user_sized: false, region: { rects: [{ page: 0, rect: [50, y, 280, y + 50] as Rect }], start: q, end: q, position: y, state: "anchored" } } });
const note: BoardNode = { id: "n-n", type: "note", position: { x: 0, y: 0 }, data: { tags: [], collapsed: false, note: "notes/n-n.md", origin: "reader" } };

beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => undefined); });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("SelectionBar (addendum 4.10)", () => {
  it("offers Join for chunks the server says are neighbours, and joins them as one reshape", async () => {
    const a = chunk("n-a", 0), b = chunk("n-b", 100);
    vi.mocked(api.join).mockResolvedValue({ node: { type: "chunk", data: a.data }, order: [1, 0] });
    const { findByRole, queryByRole } = render(<SelectionBar selected={[a, b]} onGroup={vi.fn()} />);
    fireEvent.click(await findByRole("button", { name: "Join" }));
    expect(api.join).toHaveBeenCalledWith("p", [a.data.region, b.data.region]);
    expect(queryByRole("button", { name: "Group" })).toBeNull();
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: "reshape", removeIds: ["n-a"] }));
  });
  it("offers Group instead for chunks that are not neighbours", async () => {
    vi.mocked(api.join).mockResolvedValue(null);
    const onGroup = vi.fn();
    const { findByRole, queryByRole } = render(<SelectionBar selected={[chunk("n-a", 0), chunk("n-b", 300)]} onGroup={onGroup} />);
    fireEvent.click(await findByRole("button", { name: "Group" }));
    expect(onGroup).toHaveBeenCalledWith(["n-a", "n-b"]);
    expect(queryByRole("button", { name: "Join" })).toBeNull();
  });
  it("offers Group, without asking the server, when something other than a chunk is selected", async () => {
    const { findByRole } = render(<SelectionBar selected={[chunk("n-a", 0), note]} onGroup={vi.fn()} />);
    await findByRole("button", { name: "Group" });
    expect(api.join).not.toHaveBeenCalled();
  });
  it("offers Group when the server cannot be asked", async () => {
    vi.mocked(api.join).mockRejectedValue(new Error("offline"));
    const { findByRole } = render(<SelectionBar selected={[chunk("n-a", 0), chunk("n-b", 100)]} onGroup={vi.fn()} />);
    await findByRole("button", { name: "Group" });
  });
  it("shows nothing for one piece", () => {
    const { container } = render(<SelectionBar selected={[chunk("n-a", 0)]} onGroup={vi.fn()} />);
    expect(container.innerHTML).toBe("");
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd web && npm test -- grouping SelectionBar`
Expected: FAIL, the modules do not resolve.

- [ ] **Step 3: Write `grouping.ts` and `SelectionBar.tsx`**

`web/src/board/grouping.ts`:

```ts
import { newId } from "../model/ids";
import { isDescendant, reparent, type Box } from "../model/reparent";
import type { BoardNode, GroupNode } from "../model/types";

/** Room around a new group's contents on every side, and above them for its name (addendum 4.10). */
export const GROUP_PAD = 24;
export const GROUP_HEAD = 36;

/** Group, as one gesture: a new unnamed group just big enough for the chosen nodes, which are re-parented into it
 *  without moving on screen (addendum 4.2). A chosen node inside another chosen node moves with it. When every one
 *  has the same parent, the group is made inside that parent. `boxOf` gives absolute boxes, as React Flow measures
 *  them. Returns the group first, then the re-parented nodes: one upsertNodes, one undo step. */
export function groupAround(nodes: BoardNode[], ids: string[], boxOf: (id: string) => Box): BoardNode[] {
  const chosen = nodes.filter((n) => ids.includes(n.id) && !ids.some((other) => other !== n.id && isDescendant(nodes, n.id, other)));
  if (chosen.length < 2) return [];
  const boxes = chosen.map((n) => boxOf(n.id));
  const x = Math.min(...boxes.map((b) => b.x)) - GROUP_PAD;
  const y = Math.min(...boxes.map((b) => b.y)) - GROUP_PAD - GROUP_HEAD;
  const width = Math.max(...boxes.map((b) => b.x + b.width)) + GROUP_PAD - x;
  const height = Math.max(...boxes.map((b) => b.y + b.height)) + GROUP_PAD - y;
  const parents = new Set(chosen.map((n) => n.parentId ?? null));
  const parentId = parents.size === 1 ? [...parents][0] : null;
  const parentAt = parentId ? boxOf(parentId) : { x: 0, y: 0 };
  const group: GroupNode = {
    id: newId("n"), type: "group", position: { x: x - parentAt.x, y: y - parentAt.y }, width, height,
    ...(parentId ? { parentId } : {}), data: { tags: [], name: null },
  };
  return [group, ...chosen.map((n, i) => reparent(n, group.id, { x: boxes[i].x, y: boxes[i].y }, { x, y }))];
}
```

`upsertNodes` appends the new group after its children in `nodes`; `parentsFirst` orders them on every path into React Flow and on save (addendum 4.2), so nothing else is needed.

`web/src/board/SelectionBar.tsx`:

```tsx
import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import type { BoardNode, ChunkNode, JoinResult } from "../model/types";
import { useBoard } from "../state/BoardProvider";
import { joinPlan } from "./recut";

/** For two or more selected pieces: Join when they are chunks that are neighbours in the paper, else Group
 *  (addendum 4.10). Whether they are neighbours is the server's answer, asked once per selection. */
export function SelectionBar({ selected, onGroup }: { selected: BoardNode[]; onGroup: (ids: string[]) => void }) {
  const { dispatch, paperId } = useBoard();
  const key = selected.map((n) => n.id).join(" ");
  const chunks = useMemo(() => selected.filter((n): n is ChunkNode => n.type === "chunk"), [selected]);
  const [answer, setAnswer] = useState<{ key: string; join: JoinResult | null } | null>(null);
  const allChunks = selected.length >= 2 && chunks.length === selected.length;
  useEffect(() => {
    if (!allChunks) return;
    let current = true;
    api.join(paperId, chunks.map((c) => c.data.region))
      .then((join) => { if (current) setAnswer({ key, join }); })
      .catch((failure) => { console.error("could not ask whether these pieces join", failure); if (current) setAnswer({ key, join: null }); });
    return () => { current = false; };
  }, [allChunks, key, paperId]);   // eslint-disable-line react-hooks/exhaustive-deps -- `key` names the selection
  if (selected.length < 2) return null;
  const join = allChunks && answer?.key === key ? answer.join : null;
  const waiting = allChunks && answer?.key !== key;
  return (
    <div className="selection-bar" role="toolbar" aria-label="Selected pieces">
      <span className="tool-note">{selected.length} selected</span>
      {join && <button onClick={() => dispatch({ type: "reshape", ...joinPlan(chunks, join) })} title="Make these neighbours in the paper one piece again">Join</button>}
      {!join && !waiting && <button onClick={() => onGroup(selected.map((n) => n.id))} title="Put these in a new group">Group</button>}
    </div>
  );
}
```

A failed request is logged and offers Group: joining is never the only way forward.

- [ ] **Step 4: Wire it into `BoardView.tsx`**

Import `groupAround` from `./grouping` and `SelectionBar` from `./SelectionBar`. Lift the absolute-box helper out of `onNodeDragStop` so Group can use it, just above that callback's doc comment:

```tsx
  const box = useCallback((id: string): Box => {
    const internal = getInternalNode(id)!;
    return { ...internal.internals.positionAbsolute, width: internal.measured?.width ?? 0, height: internal.measured?.height ?? 0 };
  }, [getInternalNode]);
```

delete the local `box` inside `onNodeDragStop`, and change its dependencies to `[box, dispatch, state.board.nodes]`. After `addGroup`:

```tsx
  /** Group, one gesture (addendum 4.10): a new group just around the selected pieces, one undo step. */
  const group = (ids: string[]) => {
    const nodes = groupAround(state.board.nodes, ids, box);
    if (nodes.length) dispatch({ type: "upsertNodes", nodes });
  };
  const selectedNodes = useMemo(() => state.board.nodes.filter((n) => n.selected), [state.board.nodes]);
```

and after `<BoardTools ... />`:

```tsx
      <SelectionBar selected={selectedNodes} onGroup={group} />
```

`web/src/styles/board.css`, at the end:

```css
.selection-bar { position: absolute; z-index: 5; top: 60px; left: 12px; display: flex; gap: 6px; padding: 4px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow-card); }
.selection-bar button { padding: 5px 10px; border: 0; border-radius: var(--radius-small); background: transparent; font-weight: 500; }
.selection-bar button:hover { background: var(--surface-muted); }
.selection-bar .tool-note { align-self: center; padding: 0 8px; font-size: var(--text-ui-small); color: var(--ink-muted); }
```

- [ ] **Step 5: Run them and watch them pass**

Run: `cd web && npm test && npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/board/grouping.ts web/src/board/grouping.test.ts web/src/board/SelectionBar.tsx web/src/board/SelectionBar.test.tsx web/src/board/BoardView.tsx web/src/styles/board.css
git commit -m "feat(web): Join neighbours in the paper, or Group anything else, from a selection (D21)"
```

### Task GW.4: A note from a line let go on empty board

**Files:**
- Create: `web/src/board/dropNote.ts`
- Modify: `web/src/board/BoardView.tsx`
- Test: `web/src/board/dropNote.test.ts`

**Interfaces:**
- Produces: `onEmptyBoard(element: Element | null): boolean`; `noteAtDrop(fromNode, fromHandle, at): { note: NoteNode; edge: BoardEdge }`.

- [ ] **Step 1: Write the failing test**

`web/src/board/dropNote.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { noteAtDrop, onEmptyBoard } from "./dropNote";

describe("a note from a line let go on empty board (addendum 4.10)", () => {
  afterEach(() => { document.body.innerHTML = ""; });

  it("a line from a mark's handle connects the highlight; from a card's own handle, the card", () => {
    const fromMark = noteAtDrop("n-chunk", "h-1", { x: 40, y: 60 });
    expect(fromMark.note).toMatchObject({ type: "note", position: { x: 40, y: 60 }, data: { origin: "reader" } });
    expect(fromMark.note.parentId).toBeUndefined();
    expect(fromMark.edge).toMatchObject({ from: "h-1", to: fromMark.note.id });
    expect(noteAtDrop("n-chunk", "n-chunk-out", { x: 0, y: 0 }).edge.from).toBe("n-chunk");
  });

  it("makes a note on the board's pane, and not on a card or a group, or outside the board", () => {
    document.body.innerHTML = `<div class="react-flow"><div class="react-flow__pane" id="pane"></div>
      <div class="react-flow__node" data-id="n-g"><div id="in-group"></div></div></div><div id="outside"></div>`;
    expect(onEmptyBoard(document.getElementById("pane"))).toBe(true);
    expect(onEmptyBoard(document.getElementById("in-group"))).toBe(false);
    expect(onEmptyBoard(document.getElementById("outside"))).toBe(false);
    expect(onEmptyBoard(null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd web && npm test -- dropNote`
Expected: FAIL, `./dropNote` does not resolve.

- [ ] **Step 3: Write `dropNote.ts`**

```ts
import { newEdge } from "../model/links";
import { newNote } from "../model/notes";
import type { XY } from "../model/reparent";
import type { BoardEdge, NoteNode } from "../model/types";
import { endOf } from "./handles";

/** True where a line let go of makes a note (addendum 4.10): on the board, and on no card. A group is a card. */
export function onEmptyBoard(element: Element | null): boolean {
  return Boolean(element?.closest(".react-flow")) && !element?.closest(".react-flow__node");
}

/** A reader's note at `at`, the top-left corner, and the line from what the drag began on: a mark's handle is the
 *  highlight, a card's own handle the card (addendum 4.10). Added together, as one undo step. */
export function noteAtDrop(fromNode: string, fromHandle: string | null | undefined, at: XY): { note: NoteNode; edge: BoardEdge } {
  const note = newNote({ position: at, origin: "reader" });
  return { note, edge: newEdge(endOf(fromNode, fromHandle), note.id) };
}
```

- [ ] **Step 4: Wire it into `BoardView.tsx`**

Import `type OnConnectEnd` from `@xyflow/react` and `noteAtDrop, onEmptyBoard` from `./dropNote`. After `onConnect`:

```tsx
  /** A line let go of on empty board makes a note there, connected (addendum 4.10): one undo step, then the note opens. */
  const onConnectEnd: OnConnectEnd = useCallback((event, connection) => {
    if (connection.isValid || !connection.fromNode) return;
    const { clientX, clientY } = "changedTouches" in event ? event.changedTouches[0] : event;
    if (!onEmptyBoard(document.elementFromPoint(clientX, clientY))) return;
    const { note, edge } = noteAtDrop(connection.fromNode.id, connection.fromHandle?.id, screenToFlowPosition({ x: clientX, y: clientY }));
    dispatch({ type: "add", nodes: [note], edges: [edge] });
    setEditing(note.id);
  }, [dispatch, screenToFlowPosition]);
```

and pass `onConnectEnd={onConnectEnd}` to `<ReactFlow>` beside `onConnect`. React Flow calls `onConnectEnd` after every connection drag, including one `onConnect` accepted (`isValid` true), so the guard comes first. `elementFromPoint` sees through the connection line, which React Flow draws with `pointer-events: none`.

- [ ] **Step 5: Run it and watch it pass**

Run: `cd web && npm test && npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/board/dropNote.ts web/src/board/dropNote.test.ts web/src/board/BoardView.tsx
git commit -m "feat(web): a line let go on empty board makes a note there, already connected"
```

---

## Task GE: Live text, mechanised (serial)

**Owns:** `web/e2e/step6.spec.ts` (new).
**Must not touch:** everything else. A failure here that needs a code change goes back to the task that owns the file.
**Consumes:** the Shared DOM contract, old and new; the three chunk routes and `POST /split` as test fixtures; the e2e server of `web/e2e/server.mjs` (ResNet).
**Produces:** the brief's e2e checks: a highlight on the board shows on the paper; Cut out makes three pieces in paper order whose marks stayed with them; Join of neighbours restores one chunk; non-neighbours offer Group; a line from a mark's handle to empty board makes a connected note. The brief's sixth check, a clickable URL in a note, belongs to D22's plan now.

Specs run in file order with one worker, so `step6` runs after `step5`; it uses ResNet only and saves its own board before each test, opened on the board.

- [ ] **Step 1: Write the spec**

`web/e2e/step6.spec.ts`:

```ts
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { WRITE } from "./headers";

/** Live text on the board (D20, D21 and a note from a line, addendum 4.10), mechanised. Runs after step5, on ResNet
 *  only: every test saves the board it needs first, opened on the board. ResNet's §3.1 is the chunk: four text blocks
 *  on page 3. */

type Json = Record<string, any>;
const SECTION = "3.1. Residual Learning";
// Ids as the client mints them: a kind and a ULID (addendum 4.5).
const CHUNK = "n-01K0BRDTXTCHNK000000000000";
const MARK = "h-01K0BRDTXTMRK0000000000000";
const PIECES = ["n-01K0BRDTXTPC01000000000000", "n-01K0BRDTXTPC02000000000000", "n-01K0BRDTXTPC03000000000000"];
/** Twice the board's 500 ms save debounce: long enough for what the page did to reach the server. */
const SAVED_MS = 1_000;

let resnet = "";

test.beforeAll(async ({ playwright }, info) => {
  const request = await playwright.request.newContext({ baseURL: info.project.use.baseURL });
  const papers: { paper_id: string }[] = await (await request.get("/api/papers")).json();
  resnet = papers.map((p) => p.paper_id).find((id) => id.includes("residual"))!;
  await request.dispose();
});

// ---- helpers ------------------------------------------------------------------------------------------------

const boardOf = async (request: APIRequestContext): Promise<Json> => (await request.get(`/api/papers/${resnet}/board`)).json();
const post = async (request: APIRequestContext, route: string, body: Json): Promise<Json> =>
  (await request.post(`/api/papers/${resnet}/${route}`, { data: body, headers: WRITE })).json();

/** Saves a board holding exactly these things, shown on the board at zoom 1. */
async function save(request: APIRequestContext, parts: { nodes?: Json[]; edges?: Json[]; highlights?: Json[] }) {
  const current = await boardOf(request);
  const next: Json = { ...current, nodes: parts.nodes ?? [], edges: parts.edges ?? [], highlights: parts.highlights ?? [],
    active_tags: [], view: "board", viewport: { x: 0, y: 0, zoom: 1 } };
  delete next.paper_scroll;
  const put = await request.put(`/api/papers/${resnet}/board`, { data: next, headers: { "If-Match": String(current.version), ...WRITE } });
  expect(put.ok()).toBeTruthy();
}

async function open(page: Page) {
  await page.goto("/");
  await page.getByRole("combobox", { name: "Paper", exact: true }).selectOption(resnet);
  await expect(page.locator(".react-flow__node").first()).toBeVisible();
}

/** §3.1's chunk data as split makes it, on an empty board. */
async function sectionData(request: APIRequestContext): Promise<Json> {
  await save(request, {});
  const source: Json = await (await request.get(`/api/papers/${resnet}/source`)).json();
  const id = source.sections.find((s: Json) => s.title === SECTION).id;
  const drafts: Json[] = (await post(request, "split", {})).nodes;
  return { ...drafts.find((d) => d.data.source_id === id)!.data, collapsed: false };
}

/** A chunk tall and wide enough that all its text shows without scrolling the card. */
const chunk = (id: string, data: Json, x = 60) => ({ id, type: "chunk", position: { x, y: 80 }, width: 600, height: 860, data: { ...data, user_sized: true } });
const cardOf = (page: Page, id: string) => page.locator(`.react-flow__node[data-id="${id}"]`);
const text = (data: Json) => data.blocks.filter((b: Json) => b.kind === "text").map((b: Json) => b.text.split(/\s+/).join(" ").trim()).join(" ");

/** The screen box of the first or last character of `words` in a card's text. */
async function charBox(page: Page, nodeId: string, words: string, end: boolean) {
  const box = await page.evaluate(({ nodeId, words, end }) => {
    for (const p of Array.from(document.querySelectorAll(`.react-flow__node[data-id="${nodeId}"] p.block-text`))) {
      const at = (p.textContent ?? "").indexOf(words);
      if (at === -1) continue;
      let target = end ? at + words.length - 1 : at;
      const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const length = node.textContent!.length;
        if (target < length) {
          const range = document.createRange();
          range.setStart(node, target);
          range.setEnd(node, target + 1);
          const r = range.getBoundingClientRect();
          return { x: r.left, y: r.top, width: r.width, height: r.height };
        }
        target -= length;
      }
    }
    return null;
  }, { nodeId, words, end });
  expect(box, `"${words}" on the card`).not.toBeNull();
  return box!;
}

/** A mouse drag across a card's text, from the first character of `from` to the last of `to`. */
async function selectOnCard(page: Page, nodeId: string, from: string, to: string) {
  const a = await charBox(page, nodeId, from, false);
  const b = await charBox(page, nodeId, to, true);
  await page.mouse.move(a.x + 1, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width - 1, b.y + b.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByRole("dialog", { name: "Words on the card" })).toBeVisible();
}

const chunksOf = (board: Json) => board.nodes.filter((n: Json) => n.type === "chunk");

// ---- tests --------------------------------------------------------------------------------------------------

test("words highlighted on a card are marked on the paper too, and selecting them does not move the card (D20)", async ({ page }) => {
  await save(page.request, { nodes: [chunk(CHUNK, await sectionData(page.request))] });
  await open(page);
  const before = await cardOf(page, CHUNK).boundingBox();
  await selectOnCard(page, CHUNK, "counterintuitive", "phenomena");
  expect(await cardOf(page, CHUNK).boundingBox()).toEqual(before);           // Review Focus 3
  await page.getByRole("button", { name: "Highlight", exact: true }).click();
  const mark = cardOf(page, CHUNK).locator(".node-body mark[data-highlight-id]");
  await expect(mark).toHaveText(/counterintuitive\s+phenomena/);
  const id = await mark.getAttribute("data-highlight-id");
  await page.getByRole("button", { name: "Paper", exact: true }).click();
  await expect(page.locator(`.overlay .mark[data-highlight-id="${id}"]`).first()).toBeAttached();
  await page.waitForTimeout(SAVED_MS);
  const saved = await boardOf(page.request);
  expect(saved.highlights.map((h: Json) => h.id)).toEqual([id]);
  expect(saved.highlights[0].anchor.quote.exact).toMatch(/^counterintuitive\s+phenomena$/);
});

test("Cut out makes three pieces whose text is the chunk's in paper order, and each mark stays with its piece (D21)", async ({ page }) => {
  const data = await sectionData(page.request);
  const anchor = (await post(page.request, "chunks/highlight", { region: data.region, quote: { exact: "underlying mapping" } })).highlight;
  await save(page.request, { nodes: [chunk(CHUNK, data)], highlights: [{ id: MARK, tags: [], anchor }] });
  await open(page);
  await selectOnCard(page, CHUNK, "As we discussed", "shallower counterpart.");
  await page.getByRole("button", { name: "Cut out", exact: true }).click();
  await expect(page.locator(".node.chunk")).toHaveCount(3);
  await page.waitForTimeout(SAVED_MS);
  const pieces = chunksOf(await boardOf(page.request)).sort((a: Json, b: Json) => a.position.x - b.position.x);
  expect(pieces[0].id).toBe(CHUNK);                                           // the first piece is the chunk itself
  expect(pieces.map((p: Json) => text(p.data)).join(" ")).toBe(text(data));
  // Whole printed lines: the selection ends mid-line, at "counterpart.", and the piece takes the rest of that line.
  expect(text(pieces[1].data)).toMatch(/^phenomena about the degradation problem .* counterpart\. The degradation problem suggests that the solvers$/);
  await expect(cardOf(page, CHUNK).locator("mark[data-highlight-id]")).toHaveCount(1);
  await expect(cardOf(page, pieces[1].id).locator("mark[data-highlight-id]")).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator(".node.chunk")).toHaveCount(1);                   // one undo step
});

test("Join makes neighbours one chunk again, and pieces that are not neighbours offer Group instead (D21)", async ({ page }) => {
  const data = await sectionData(page.request);
  const at = { exact: "As we discussed in the introduction" };
  const drafts: Json[] = (await post(page.request, "chunks/split", { region: data.region, at, mode: "cut" })).nodes;
  await save(page.request, { nodes: drafts.map((d, i) => ({ ...chunk(PIECES[i], { ...d.data, collapsed: true }, 60 + i * 420), height: undefined, width: 380 })) });
  await open(page);
  const head = (id: string) => cardOf(page, id).locator(".node-head .title");
  await head(PIECES[0]).click();
  await head(PIECES[2]).click({ modifiers: ["ControlOrMeta"] });
  await expect(page.getByRole("button", { name: "Group", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Join", exact: true })).toHaveCount(0);
  await head(PIECES[1]).click({ modifiers: ["ControlOrMeta"] });
  await page.getByRole("button", { name: "Join", exact: true }).click();
  await expect(page.locator(".node.chunk")).toHaveCount(1);
  await page.waitForTimeout(SAVED_MS);
  const [joined] = chunksOf(await boardOf(page.request));
  expect(joined.id).toBe(PIECES[0]);
  expect(text(joined.data)).toBe(text(data));
  expect(joined.data.region.rects).toEqual(data.region.rects);
});

test("a line drawn from a mark and let go on empty board makes a note connected to the mark", async ({ page }) => {
  const data = await sectionData(page.request);
  const anchor = (await post(page.request, "chunks/highlight", { region: data.region, quote: { exact: "underlying mapping" } })).highlight;
  await save(page.request, { nodes: [chunk(CHUNK, data)], highlights: [{ id: MARK, tags: [], anchor }] });
  await open(page);
  const handle = (await cardOf(page, CHUNK).locator(`.react-flow__handle[data-handleid="${MARK}"]`).boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(1000, 700, { steps: 10 });
  await page.mouse.up();
  await expect(page.locator(".node.note textarea")).toBeFocused();
  await page.waitForTimeout(SAVED_MS);
  const saved = await boardOf(page.request);
  const note = saved.nodes.find((n: Json) => n.type === "note");
  expect(saved.edges).toEqual([expect.objectContaining({ from: MARK, to: note.id })]);
});
```

The spec is type-checked by `npm run build` with the app's tsconfig, which has no Node types; it uses none. The ids must be real ULIDs: Crockford base 32, so no `I`, `L`, `O` or `U` (the notes route checks them).

- [ ] **Step 2: Run it**

Run: `cd web && npm run build && npm run e2e`
Expected: every spec passes, 35 tests in 5 files (31 before this plan, 4 here).

- [ ] **Step 3: Commit**

```bash
git add web/e2e/step6.spec.ts
git commit -m "test(web): mechanise live board text: highlight, cut, join, group, and a note from a line"
```

---

## Done when

- `.venv/bin/pytest` (441 tests), `.venv/bin/ruff check src tests`, `cd web && npm test && npm run build && npm run e2e` (35 tests) all pass.
- SPEC.md section 10's step 7 test, by a person on a paper they are reading: highlight a sentence on a card and find it on the paper; cut it out, connect a note to it by letting a line go on empty board, join the pieces back. Written into the merge commit's message.

## Deferred, with reasons

- **Notes in Markdown with maths (D22) and sketch notes (D23).** Another plan, running now.
- **Word-exact pieces.** The scissors cut between printed lines (addendum 4.10 `[CHOICE]`); a sentence cut out mid-line takes its whole first and last lines.
- **Selecting across two cards, and selecting with the keyboard.** A selection is read on mouse up, inside one card; Shift-arrow selections open no popover.
- **Joining figures.** Join takes chunks only; a figure selected with them offers Group.
- **Tags and notes from the text popover.** A board highlight gets tags and notes the ways every mark does: its handle on the board, its popover on the paper.
- **A stacked layout for a split's pieces.** They sit side by side (addendum 4.10 `[CHOICE]`).
- **Touch.** A selection on a card is a mouse gesture, as on the paper. iPad use is later (SPEC.md section 9).
- **Undo inside a text selection.** Cmd-Z undoes the last board action, never the selection itself.

## Choices this plan made where the spec left room

Each is a place the spec could be read more than one way; the plan picks one and says why. Red-pen them.

1. **`find_quote` gains an optional `accept`** (GS.1) rather than a second matcher for board text. One matcher, section 5.2's, finds every quote in the tool; `accept` only refuses candidates outside the chunk, and without it nothing changes.
2. **`snap._line_highlight` and `_chunk_anchor` become public** (GS.1) so the board's highlight and pieces are built by the very functions `POST /text` uses. GS.1's second test asserts a board highlight equals the paper's over the same lines.
3. **G.0 stubs the geometry** (`NotImplementedError`, a `500` until GS lands) so `api.py` has one owner and both streams build against fixed routes.
4. **The kept piece of a Split is the same node object, updated; new pieces go just after it in `nodes`** (`reshape`, G.0.2). Insertion after it keeps `nodes` order readable and changes nothing React Flow draws.
5. **One `reshape` action for Split, Cut and Join**, not three: they differ only in what is added or removed, and each is one undo step.
6. **One mouse-up handler on the board reads every card's selection** (GW.2), so a card component knows nothing of it.
7. **The server's refusal is shown in the text popover**, not in the app's notice line: the reader is looking at the popover.
8. **Join is asked of the server once per selection, and Group is hidden while the answer is pending** (GW.3), so the two buttons never flicker between each other. A request that fails offers Group.
9. **Group's numbers**: 24 pixels of padding and 36 for the name (GW.3). The addendum names the constants and gives no values.
10. **The selection bar sits under the board tools**, 60 pixels from the top (GW.3).
11. **A note from a line is detected with `document.elementFromPoint`** at the release point (GW.4), rather than the event's target, so it does not depend on which element React Flow listens on.
12. **The e2e spec seeds its chunks from the server's own routes** (`POST /split`, `/chunks/highlight`, `/chunks/split`) so its fixtures are real anchors and blocks, not hand-written ones.
