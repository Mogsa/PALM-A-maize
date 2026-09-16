# Frontend Features Implementation Plan (build steps 4 and 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Everything the spec puts on the board beyond cutting and arranging: the split command with figure clips, tags and the tag filter, connections the reader draws, notes in the reader's own words, the question queue, the reading goal, and export. At the end, SPEC.md section 11 can be run in full on a real paper.

**Architecture:** Additions to the `web/` app from the core plan. New state actions on the same reducer, new panels in the same shell, and the routes the API plan already serves: `/text`, `/clips`, `/notes`, `/questions`, `/export`, `/tags`. Every rule that is not a React component is a plain module with a vitest file. No new server code: if something here needs a route the API does not have, that is a plan defect to raise, not a workaround to write.

**Tech Stack:** As the core plan. One addition: none. Notes are shown as plain wrapped text in this plan; Markdown rendering is a later choice and is noted at the end.

**Spec:** `docs/SPEC.md` sections 4, 5, 6, 11; `docs/SPEC-ADDENDUM.md` sections 4, 4.3, 6; `docs/superpowers/plans/2026-09-16-api-and-storage.md` Tasks 2, 6, 7, 8; `docs/superpowers/plans/2026-09-16-frontend-core.md` for every module this plan modifies. The core plan must be merged first.

## Global Constraints

- All of the core plan's constraints hold: page-space geometry, stripped runtime fields, client-minted ids, debounced versioned saves, the paper as the only place you mark or cut, nothing generated, local only.
- **Nothing is forced** (SPEC.md principle 2). Every tag, connection, group name, and goal is optional. No panel blocks the board. No dialog asks a question the reader has not raised.
- **Tags are global** (`/api/tags`), never per paper. Nodes, highlights and edges reference tags by id. A tag deleted from the global list is silently ignored wherever it still appears.
- **The question list is the server's** (`GET /questions`). The client shows it and never recomputes it.
- **Export is the server's** (`POST /export`). The client sends the active tag filter and shows the result.
- **Split never rearranges anything already on the board.** It adds what is missing and leaves the rest alone.

---

## File Structure

```
web/src/model/types.ts               # + Tag, TagFile, Question, ExportResult
web/src/api/client.ts                # + getTags, putTags, getNote, putNote, putClip, getQuestions, postExport
web/src/model/boardReducer.ts        # + setTags, setGoal, setActiveTags, setHighlightNote, addEdge, replaceEdge, replaceHighlight, removeHighlight
web/src/model/split.ts               # which sections and figures split will add, and where they land
web/src/model/filter.ts              # what the active tag filter hides
web/src/state/TagsProvider.tsx       # global tags, loaded once, edited in place
web/src/tags/TagPicker.tsx           # pick, add, rename, recolour, delete
web/src/tags/TagChips.tsx            # the tags on a thing, and the filter bar
web/src/paper/PaperScreen.tsx        # + heading click cuts a section; mark click opens the mark popover; rectangle drag
web/src/paper/MarkPopover.tsx        # tags, note, remove, for one highlight
web/src/paper/PageOverlay.tsx        # + margin notes, dimming by filter, heading hit zones
web/src/paper/rectangleDrag.ts       # Shift+drag anywhere on a page -> one PageRect
web/src/board/BoardView.tsx          # + onConnect, edge click, filter, split button, new note button
web/src/board/EdgePopover.tsx        # tags on a connection, delete
web/src/board/nodes/NoteNode.tsx     # editing, load/save through /notes
web/src/board/nodes/ChunkNode.tsx    # + tags, node tag picker
web/src/board/nodes/GroupNode.tsx    # + editable name
web/src/panels/QuestionList.tsx      # GET /questions, click to focus
web/src/panels/ExportDialog.tsx      # POST /export, show path and markdown
web/src/App.tsx                      # goal input, filter bar, panels, split and export buttons
web/e2e/step5.spec.ts                # Playwright: reconstruct one paper's argument, export it
```

---

### Task 1: Types, client, reducer actions

**Files:**
- Modify: `web/src/model/types.ts`, `web/src/api/client.ts`, `web/src/model/boardReducer.ts`
- Test: `web/src/model/boardReducer.test.ts` (append), `web/src/api/client.test.ts` (append)

**Interfaces:**
- Produces:
  - `Tag = { id; name; colour }`, `TagFile = { schema: 1; tags: Tag[] }`, `Question = { id; kind: "highlight" | "chunk" | "figure" | "group"; text }`, `ExportResult = { path; markdown }`
  - `api.getTags()`, `api.putTags(tags)`, `api.getNote(id, nodeId) -> { markdown }` (404 becomes `""`), `api.putNote(id, nodeId, markdown)`, `api.putClip(id, nodeId, rect: PageRect, dpi?) -> { clip; clip_size }`, `api.getQuestions(id)`, `api.postExport(id, tags)`
  - Reducer actions: `{ type: "setGoal"; goal }`, `{ type: "setActiveTags"; tags }`, `{ type: "setNodeTags"; id; tags }`, `{ type: "setHighlightTags"; id; tags }`, `{ type: "setHighlightNote"; id; note: string | null }`, `{ type: "replaceHighlight"; highlight }`, `{ type: "removeHighlight"; id }`, `{ type: "addEdge"; edge }`, `{ type: "replaceEdge"; edge }`, `{ type: "removeEdge"; id }`, `{ type: "addNodes"; nodes: BoardNode[] }`

- [ ] **Step 1: Write the failing tests**

Append to `web/src/model/boardReducer.test.ts`:

```ts
describe("boardReducer, feature actions", () => {
  const loaded = () => boardReducer(initialBoardState, { type: "load", board: { ...emptyBoard("p"), nodes: [note], highlights: [highlight] } });

  it("goal and active tags are board fields", () => {
    let s = boardReducer(loaded(), { type: "setGoal", goal: "why" });
    s = boardReducer(s, { type: "setActiveTags", tags: ["t-claim"] });
    expect(s.board.goal).toBe("why");
    expect(s.board.active_tags).toEqual(["t-claim"]);
    expect(s.dirty).toBe(true);
  });

  it("tags on nodes and highlights", () => {
    let s = boardReducer(loaded(), { type: "setNodeTags", id: "n-1", tags: ["t-question"] });
    s = boardReducer(s, { type: "setHighlightTags", id: "h-1", tags: ["t-claim", "t-pass1"] });
    expect(s.board.nodes[0].data.tags).toEqual(["t-question"]);
    expect(s.board.highlights[0].tags).toEqual(["t-claim", "t-pass1"]);
  });

  it("removing a highlight drops edges that end on it", () => {
    const chunk: BoardNode = { id: "n-c", type: "chunk", position: { x: 0, y: 0 },
      data: { tags: [], collapsed: false, region: { rects: [{ page: 0, rect: [0, 0, 10, 10] }], start: q, end: q, position: 0, state: "anchored" }, text: "", user_sized: false, source_id: null } };
    let s = boardReducer(initialBoardState, { type: "load", board: { ...emptyBoard("p"), nodes: [chunk, note], highlights: [highlight] } });
    s = boardReducer(s, { type: "addEdge", edge: { id: "e-1", source: "n-c", sourceHandle: "h-1", target: "n-1", data: { tags: [] } } });
    expect(s.board.edges).toHaveLength(1);
    s = boardReducer(s, { type: "removeHighlight", id: "h-1" });
    expect(s.board.highlights).toEqual([]);
    expect(s.board.edges).toEqual([]);
  });

  it("addNodes appends many at once and keeps order", () => {
    const s = boardReducer(loaded(), { type: "addNodes", nodes: [{ ...note, id: "n-2" }, { ...note, id: "n-3" }] });
    expect(s.board.nodes.map((n) => n.id)).toEqual(["n-1", "n-2", "n-3"]);
  });
});
```

Append to `web/src/api/client.test.ts`:

```ts
describe("api.getNote", () => {
  it("turns a 404 into an empty note", async () => {
    mockFetch(404, { error: { code: "note_not_found", message: "no note n-1" } });
    expect(await api.getNote("p", "n-1")).toEqual({ markdown: "" });
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd web && npm test`
Expected: FAIL, unknown action types and missing `api.getNote`.

- [ ] **Step 3: Add the types, client calls, and actions**

Append to `web/src/model/types.ts`:

```ts
export type Tag = { id: string; name: string; colour: string };
export type TagFile = { schema: 1; tags: Tag[] };
export type Question = { id: string; kind: "highlight" | "chunk" | "figure" | "group"; text: string };
export type ExportResult = { path: string; markdown: string };
```

Append to the `api` object in `web/src/api/client.ts`:

```ts
  getTags: () => call<TagFile>("/api/tags"),
  putTags: (tags: TagFile) => call<TagFile>("/api/tags", { method: "PUT", body: JSON.stringify(tags) }),
  async getNote(id: string, nodeId: string): Promise<{ markdown: string }> {
    try {
      return await call<{ markdown: string }>(`/api/papers/${id}/notes/${nodeId}`);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return { markdown: "" };
      throw error;
    }
  },
  putNote: (id: string, nodeId: string, markdown: string) =>
    call<void>(`/api/papers/${id}/notes/${nodeId}`, { method: "PUT", body: JSON.stringify({ markdown }) }),
  putClip: (id: string, nodeId: string, rect: PageRect, dpi = 150) =>
    call<{ clip: string; clip_size: { width: number; height: number } }>(`/api/papers/${id}/clips/${nodeId}`, { method: "PUT", body: JSON.stringify({ ...rect, dpi }) }),
  getQuestions: (id: string) => call<Question[]>(`/api/papers/${id}/questions`),
  postExport: (id: string, tags: string[]) => call<ExportResult>(`/api/papers/${id}/export`, { method: "POST", body: JSON.stringify({ tags }) }),
```

and import `Question`, `ExportResult`, `TagFile` from the types module.

Add to `BoardAction` in `web/src/model/boardReducer.ts`:

```ts
  | { type: "setGoal"; goal: string }
  | { type: "setActiveTags"; tags: string[] }
  | { type: "setNodeTags"; id: string; tags: string[] }
  | { type: "setHighlightTags"; id: string; tags: string[] }
  | { type: "setHighlightNote"; id: string; note: string | null }
  | { type: "replaceHighlight"; highlight: Highlight }
  | { type: "removeHighlight"; id: string }
  | { type: "addEdge"; edge: BoardEdge }
  | { type: "replaceEdge"; edge: BoardEdge }
  | { type: "removeEdge"; id: string }
  | { type: "addNodes"; nodes: BoardNode[] }
```

and the cases:

```ts
    case "setGoal":
      return { board: { ...board, goal: action.goal }, dirty: true };
    case "setActiveTags":
      return { board: { ...board, active_tags: action.tags }, dirty: true };
    case "setNodeTags":
      return { board: { ...board, nodes: board.nodes.map((n) => (n.id === action.id ? ({ ...n, data: { ...n.data, tags: action.tags } } as BoardNode) : n)) }, dirty: true };
    case "setHighlightTags":
      return { board: { ...board, highlights: board.highlights.map((h) => (h.id === action.id ? { ...h, tags: action.tags } : h)) }, dirty: true };
    case "setHighlightNote":
      return { board: { ...board, highlights: board.highlights.map((h) => (h.id === action.id ? { ...h, note: action.note } : h)) }, dirty: true };
    case "replaceHighlight":
      return { board: { ...board, highlights: board.highlights.map((h) => (h.id === action.highlight.id ? action.highlight : h)) }, dirty: true };
    case "removeHighlight":
      return {
        board: { ...board, highlights: board.highlights.filter((h) => h.id !== action.id),
                 edges: board.edges.filter((e) => e.sourceHandle !== action.id && e.targetHandle !== action.id) },
        dirty: true,
      };
    case "addEdge":
      return { board: { ...board, edges: [...board.edges, action.edge] }, dirty: true };
    case "replaceEdge":
      return { board: { ...board, edges: board.edges.map((e) => (e.id === action.edge.id ? action.edge : e)) }, dirty: true };
    case "removeEdge":
      return { board: { ...board, edges: board.edges.filter((e) => e.id !== action.id) }, dirty: true };
    case "addNodes":
      return { board: { ...board, nodes: [...board.nodes, ...action.nodes] }, dirty: true };
```

- [ ] **Step 4: Run the tests**

Run: `cd web && npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add web/src/model web/src/api
git commit -m "feat(web): types, client calls and reducer actions for tags, notes, edges, split"
```

---

### Task 2: Split, and a figure from a rectangle

**Files:**
- Create: `web/src/model/split.ts`, `web/src/paper/rectangleDrag.ts`
- Modify: `web/src/paper/PaperScreen.tsx`, `web/src/paper/PaperView.tsx`, `web/src/paper/PageOverlay.tsx`, `web/src/board/BoardView.tsx`
- Test: `web/src/model/split.test.ts`, `web/src/paper/rectangleDrag.test.ts`

**Interfaces:**
- Produces:
  - `planSplit(source: Source, nodes: BoardNode[]): { sections: Section[]; figures: Figure[] }` — what is not yet on the board, by `source_id`
  - `splitLayout(count: { sections: number; figures: number }, existing: BoardNode[]): { sectionAt(i): XY; figureAt(i): XY }` — sections down the left in paper order, figures in a column beside them, below anything already there
  - `runSplit(paperId, source, state, dispatch)` — calls `/text` per section with `snap: false` and `/clips` per figure, then one `addNodes`
  - `cutSection(section)` — the same for one section, used by the heading click
  - `rectangleFromDrag(start: XY, end: XY, frame: PageFrame): PageRect | null` — a Shift+drag on a page becomes one page rect in points
  - The paper view: Shift+drag draws a rectangle; releasing offers Highlight or Cut; a cut whose `region_label` is `picture` or `table` becomes a figure node with a clip, otherwise a chunk. Clicking inside a section heading with nothing selected offers "Cut section".

- [ ] **Step 1: Write the failing tests**

`web/src/model/split.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { planSplit, splitLayout } from "./split";
import type { BoardNode, Source } from "./types";

const q = { exact: "x", prefix: "", suffix: "" };
const pr = (page: number) => ({ page, rect: [0, 0, 10, 10] as [number, number, number, number] });
const source = {
  sections: [
    { id: "sec-0", number: null, depth: 1, title: "Title", heading_rect: pr(0), extent: [pr(0)], text: "" },
    { id: "sec-1", number: "1", depth: 1, title: "1 Intro", heading_rect: pr(0), extent: [pr(0)], text: "" },
  ],
  figures: [{ id: "fig-1", kind: "figure", label: "Figure 1", caption: "Figure 1: a", caption_rect: null, rect: pr(1), confidence: "region" }],
} as unknown as Source;

const chunkFrom = (source_id: string): BoardNode => ({ id: "n-x", type: "chunk", position: { x: 40, y: 40 }, height: 100,
  data: { tags: [], collapsed: true, region: { rects: [pr(0)], start: q, end: q, position: 0, state: "anchored" }, text: "", user_sized: false, source_id } });

describe("planSplit", () => {
  it("adds every section and figure on an empty board", () => {
    const plan = planSplit(source, []);
    expect(plan.sections.map((s) => s.id)).toEqual(["sec-0", "sec-1"]);
    expect(plan.figures.map((f) => f.id)).toEqual(["fig-1"]);
  });
  it("skips what is already there, by source id", () => {
    const plan = planSplit(source, [chunkFrom("sec-1")]);
    expect(plan.sections.map((s) => s.id)).toEqual(["sec-0"]);
  });
});

describe("splitLayout", () => {
  it("stacks sections in one column and figures in a second, below existing nodes", () => {
    const layout = splitLayout({ sections: 3, figures: 2 }, [chunkFrom("sec-9")]);
    expect(layout.sectionAt(0).y).toBeGreaterThanOrEqual(40 + 100 + 24);
    expect(layout.sectionAt(1).y).toBeGreaterThan(layout.sectionAt(0).y);
    expect(layout.sectionAt(0).x).toBe(layout.sectionAt(2).x);
    expect(layout.figureAt(0).x).toBeGreaterThan(layout.sectionAt(0).x);
    expect(layout.figureAt(0).y).toBe(layout.sectionAt(0).y);
  });
});
```

`web/src/paper/rectangleDrag.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { rectangleFromDrag } from "./rectangleDrag";

const frame = { page: 1, box: { left: 100, top: 1000, right: 800, bottom: 1906 }, widthPt: 612 };

describe("rectangleFromDrag", () => {
  it("orders corners and converts to points", () => {
    const rect = rectangleFromDrag({ x: 500, y: 1400 }, { x: 300, y: 1200 }, frame)!;
    expect(rect.page).toBe(1);
    const scale = 700 / 612;
    expect(rect.rect.map((v) => Math.round(v))).toEqual([Math.round(200 / scale), Math.round(200 / scale), Math.round(400 / scale), Math.round(400 / scale)]);
  });
  it("rejects a drag too small to mean anything", () => {
    expect(rectangleFromDrag({ x: 300, y: 1200 }, { x: 304, y: 1203 }, frame)).toBeNull();
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd web && npm test`
Expected: FAIL on two unresolved modules.

- [ ] **Step 3: Write `split.ts` and `rectangleDrag.ts`**

```ts
// web/src/model/split.ts
import type { Dispatch } from "react";
import { api } from "../api/client";
import type { BoardAction, BoardState } from "./boardReducer";
import { newId } from "./ids";
import type { BoardNode, ChunkNode, Figure, FigureNode, Section, Source } from "./types";
import { CHUNK_WIDTH, GAP, MARGIN, DEFAULT_CHUNK_HEIGHT } from "../board/layout";

export const COLLAPSED_HEIGHT = 36;
export const FIGURE_WIDTH = 300;

/** What split would add: every section and figure whose source id is not on the board yet. */
export function planSplit(source: Source, nodes: BoardNode[]): { sections: Section[]; figures: Figure[] } {
  const present = new Set(nodes.flatMap((n) => (n.type === "chunk" || n.type === "figure") && n.data.source_id ? [n.data.source_id] : []));
  return {
    sections: source.sections.filter((s) => !present.has(s.id)),
    figures: source.figures.filter((f) => !present.has(f.id)),
  };
}

/** The uncut paper as the authors divided it: sections down the left in paper order,
 *  figures in a column beside them, all collapsed, below whatever is already there. */
export function splitLayout(count: { sections: number; figures: number }, existing: BoardNode[]) {
  const topLevel = existing.filter((n) => !n.parentId);
  const top = topLevel.length
    ? Math.max(...topLevel.map((n) => n.position.y + (n.height ?? n.initialHeight ?? DEFAULT_CHUNK_HEIGHT))) + GAP
    : MARGIN;
  return {
    sectionAt: (i: number) => ({ x: MARGIN, y: top + i * (COLLAPSED_HEIGHT + GAP / 2) }),
    figureAt: (i: number) => ({ x: MARGIN + CHUNK_WIDTH + GAP * 2, y: top + i * (COLLAPSED_HEIGHT + GAP / 2) }),
  };
}

async function sectionNode(paperId: string, section: Section, position: { x: number; y: number }): Promise<ChunkNode> {
  const selection = await api.postText(paperId, section.extent, false);
  return {
    id: newId("n"), type: "chunk", position, initialWidth: CHUNK_WIDTH,
    data: { tags: [], collapsed: true, region: selection.chunk, text: selection.text, user_sized: false, source_id: section.id },
  };
}

async function figureNode(paperId: string, figure: Figure, position: { x: number; y: number }): Promise<FigureNode> {
  const id = newId("n");
  const [selection, clip] = await Promise.all([api.postText(paperId, [figure.rect], false), api.putClip(paperId, id, figure.rect)]);
  return {
    id, type: "figure", position, initialWidth: FIGURE_WIDTH,
    data: { tags: [], collapsed: true, region: selection.chunk, clip: clip.clip, clip_size: clip.clip_size, caption: figure.caption, source_id: figure.id },
  };
}

export async function cutSection(paperId: string, section: Section, state: BoardState, dispatch: Dispatch<BoardAction>) {
  const layout = splitLayout({ sections: 1, figures: 0 }, state.board.nodes);
  dispatch({ type: "addNode", node: await sectionNode(paperId, section, layout.sectionAt(0)) });
}

export async function runSplit(paperId: string, source: Source, state: BoardState, dispatch: Dispatch<BoardAction>) {
  const plan = planSplit(source, state.board.nodes);
  const layout = splitLayout({ sections: plan.sections.length, figures: plan.figures.length }, state.board.nodes);
  const sections = await Promise.all(plan.sections.map((s, i) => sectionNode(paperId, s, layout.sectionAt(i))));
  const figures = await Promise.all(plan.figures.map((f, i) => figureNode(paperId, f, layout.figureAt(i))));
  dispatch({ type: "addNodes", nodes: [...sections, ...figures] });
}
```

```ts
// web/src/paper/rectangleDrag.ts
import type { PageRect } from "../model/types";
import type { PageFrame } from "./selection";

export const MIN_DRAG_PX = 8;

/** Shift+drag anywhere on a page. Corners in any order; result in points, top-left origin. */
export function rectangleFromDrag(start: { x: number; y: number }, end: { x: number; y: number }, frame: PageFrame): PageRect | null {
  if (Math.abs(end.x - start.x) < MIN_DRAG_PX || Math.abs(end.y - start.y) < MIN_DRAG_PX) return null;
  const scale = (frame.box.right - frame.box.left) / frame.widthPt;
  const x0 = (Math.min(start.x, end.x) - frame.box.left) / scale;
  const y0 = (Math.min(start.y, end.y) - frame.box.top) / scale;
  const x1 = (Math.max(start.x, end.x) - frame.box.left) / scale;
  const y1 = (Math.max(start.y, end.y) - frame.box.top) / scale;
  return { page: frame.page, rect: [x0, y0, x1, y1] };
}
```

- [ ] **Step 4: Run the tests**

Run: `cd web && npm test`
Expected: all pass.

- [ ] **Step 5: Wire the paper view**

In `PaperView.tsx` add three things.

Rectangle drag. On `mousedown` with `shiftKey` inside a `.react-pdf__Page`, record the start point and the page frame, draw a `<div className="rubber-band">` positioned from the start to the current mouse, and on `mouseup` call `rectangleFromDrag`; if it returns a rect, call `onSelect([rect], endBox, event.altKey)` with the rubber band's DOMRect as the anchor. `user-select: none` on the container while a rectangle drag is in progress so the text layer does not also select.

Heading hit zones. In `PageOverlay`, for each `source.sections` heading on this page, render a `<div className="heading-zone" title="Cut this section">` over `heading_rect`, `pointer-events: auto`, `onClick={() => onHeadingClick(section)}`. The zone is transparent and shows a scissors cursor on hover. `PageOverlay` gains `source` and `onHeadingClick` props; `PaperView` passes them through.

`PaperScreen.tsx` changes:

```tsx
const choose = async (kind: "highlight" | "cut") => {
  ...
  } else {
    const isFigure = selection.region_label === "picture" || selection.region_label === "table";
    if (isFigure && selection.rects.length === 1) {
      const id = newId("n");
      const clip = await api.putClip(paperId, id, selection.rects[0]);
      const node: FigureNode = { id, type: "figure", position: nextChunkPosition(state.board.nodes), initialWidth: 300,
        data: { tags: [], collapsed: false, region: selection.chunk, clip: clip.clip, clip_size: clip.clip_size, caption: selection.text.slice(0, 200), source_id: null } };
      dispatch({ type: "addNode", node });
    } else {
      ... the chunk node from the core plan ...
    }
  }
```

and a heading handler:

```tsx
const onHeadingClick = async (section: Section) => {
  if (window.getSelection()?.isCollapsed === false) return;   // a selection in progress wins
  setBusy(true);
  try { await cutSection(paperId, section, state, dispatch); } finally { setBusy(false); }
};
```

`BoardView.tsx` gains a "Split" button beside "New group":

```tsx
<button onClick={() => runSplit(paperId, source, state, dispatch)} disabled={!planSplit(source, state.board.nodes).sections.length && !planSplit(source, state.board.nodes).figures.length}>Split into sections</button>
```

with `paperId` and `source` from `useBoard()`. `App.tsx` also shows the same button on the empty-board hint line from SPEC.md section 4: when the board has no nodes and no highlights, the board view shows a centred line "Highlight anything in the paper, cut anything, or split it into the authors' sections" with the Split button under it.

Add to `styles.css`:

```css
.rubber-band { position: fixed; border: 1px dashed var(--outline); background: rgba(29, 78, 216, 0.08); pointer-events: none; z-index: 9; }
.overlay .heading-zone { position: absolute; pointer-events: auto; cursor: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16'><text y='13' font-size='13'>✂</text></svg>") 8 8, pointer; }
.overlay .heading-zone:hover { outline: 1px solid var(--outline); }
.empty-hint { position: absolute; inset: 0; display: grid; place-content: center; text-align: center; color: #555; pointer-events: none; }
.empty-hint button { pointer-events: auto; margin-top: 8px; }
```

- [ ] **Step 6: Run it and check**

With ResNet loaded and an empty board: the board shows the hint line. Click Split: 22 collapsed chunks down the left, 20 figures beside them, each figure showing its clip when expanded. Click Split again: the button is disabled, nothing is added. Back in the paper: click the heading "4. Experiments" with nothing selected: one more chunk appears, the button stays disabled because that section is already present by id. Shift+drag around Figure 3 on page 4: the popover offers Highlight and Cut; Cut makes a figure node with a clip. Reload: all present.

- [ ] **Step 7: Commit**

```bash
git add web/src
git commit -m "feat(web): split into the authors' sections, cut a section from its heading, cut a figure by rectangle"
```

---

### Task 3: Tags, the picker, and the filter

**Files:**
- Create: `web/src/state/TagsProvider.tsx`, `web/src/tags/TagPicker.tsx`, `web/src/tags/TagChips.tsx`, `web/src/model/filter.ts`
- Modify: `web/src/board/nodes/ChunkNode.tsx`, `web/src/board/nodes/FigureNode.tsx`, `web/src/board/nodes/NoteNode.tsx`, `web/src/board/nodes/GroupNode.tsx`, `web/src/board/BoardView.tsx`, `web/src/paper/PageOverlay.tsx`, `web/src/App.tsx`
- Test: `web/src/model/filter.test.ts`

**Interfaces:**
- Produces:
  - `useTags(): { tags: Tag[]; byId: Map<string, Tag>; add(name, colour): Promise<Tag>; update(tag): Promise<void>; remove(id): Promise<void> }` — global, saved through `PUT /api/tags` on every change
  - `<TagPicker value: string[] onChange />` — chips for the current tags, a list of all tags to toggle, a one-line "new tag" input; rename and recolour inline; delete with no confirmation dialog, since a tag deleted from the list is simply ignored elsewhere and can be re-added
  - `<TagChips ids />` — read-only coloured chips
  - `<FilterBar />` — the global tags as toggles; toggled ones become `board.active_tags`
  - `isVisible(active: string[], tags: string[]): boolean` — empty filter shows everything; otherwise anything carrying at least one active tag
  - `hiddenNodeIds(board): Set<string>` — nodes hidden by the filter, plus children of hidden groups; a group with no tags stays visible if any child is visible

- [ ] **Step 1: Write the failing test**

`web/src/model/filter.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { hiddenNodeIds, isVisible } from "./filter";
import { emptyBoard, type BoardNode } from "./types";

const group: BoardNode = { id: "n-g", type: "group", position: { x: 0, y: 0 }, data: { tags: [], name: null } };
const inside = (id: string, tags: string[]): BoardNode => ({ id, type: "note", position: { x: 0, y: 0 }, parentId: "n-g", extent: "parent", data: { tags, collapsed: false, note: `notes/${id}.md` } });

describe("filter", () => {
  it("empty filter shows everything", () => {
    expect(isVisible([], [])).toBe(true);
    expect(isVisible([], ["t-a"])).toBe(true);
  });
  it("a non-empty filter needs one shared tag", () => {
    expect(isVisible(["t-a"], ["t-b"])).toBe(false);
    expect(isVisible(["t-a", "t-c"], ["t-b", "t-c"])).toBe(true);
  });
  it("hides untagged things and empties, keeps a group with a visible child", () => {
    const board = { ...emptyBoard("p"), active_tags: ["t-a"], nodes: [group, inside("n-1", ["t-a"]), inside("n-2", [])] };
    const hidden = hiddenNodeIds(board);
    expect(hidden.has("n-2")).toBe(true);
    expect(hidden.has("n-1")).toBe(false);
    expect(hidden.has("n-g")).toBe(false);
  });
  it("hides a group whose children are all hidden", () => {
    const board = { ...emptyBoard("p"), active_tags: ["t-a"], nodes: [group, inside("n-2", [])] };
    expect(hiddenNodeIds(board).has("n-g")).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd web && npm test -- filter`
Expected: FAIL, cannot resolve `./filter`.

- [ ] **Step 3: Write `filter.ts`, the provider, the picker**

```ts
// web/src/model/filter.ts
import type { Board } from "./types";

export function isVisible(active: string[], tags: string[]): boolean {
  return active.length === 0 || tags.some((t) => active.includes(t));
}

/** View state, computed at render (addendum 4.2): never persisted per node. */
export function hiddenNodeIds(board: Board): Set<string> {
  const hidden = new Set<string>();
  if (!board.active_tags.length) return hidden;
  const children = new Map<string, string[]>();
  for (const n of board.nodes) if (n.parentId) children.set(n.parentId, [...(children.get(n.parentId) ?? []), n.id]);
  const visible = (id: string): boolean => {
    const node = board.nodes.find((n) => n.id === id)!;
    if (node.type === "group") return isVisible(board.active_tags, node.data.tags) || (children.get(id) ?? []).some(visible);
    return isVisible(board.active_tags, node.data.tags);
  };
  for (const n of board.nodes) if (!visible(n.id)) hidden.add(n.id);
  return hidden;
}
```

```tsx
// web/src/state/TagsProvider.tsx
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import type { Tag, TagFile } from "../model/types";

type Ctx = { tags: Tag[]; byId: Map<string, Tag>; add: (name: string, colour: string) => Promise<Tag>; update: (tag: Tag) => Promise<void>; remove: (id: string) => Promise<void> };
const TagsContext = createContext<Ctx | null>(null);

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function TagsProvider({ children }: { children: React.ReactNode }) {
  const [file, setFile] = useState<TagFile | null>(null);
  useEffect(() => { api.getTags().then(setFile); }, []);

  const write = useCallback(async (next: TagFile) => { setFile(await api.putTags(next)); }, []);
  const add = useCallback(async (name: string, colour: string) => {
    const tag: Tag = { id: `t-${slug(name)}-${Date.now().toString(36)}`, name, colour };
    await write({ schema: 1, tags: [...(file?.tags ?? []), tag] });
    return tag;
  }, [file, write]);
  const update = useCallback(async (tag: Tag) => write({ schema: 1, tags: (file?.tags ?? []).map((t) => (t.id === tag.id ? tag : t)) }), [file, write]);
  const remove = useCallback(async (id: string) => write({ schema: 1, tags: (file?.tags ?? []).filter((t) => t.id !== id) }), [file, write]);

  const value = useMemo<Ctx | null>(() => file ? { tags: file.tags, byId: new Map(file.tags.map((t) => [t.id, t])), add, update, remove } : null, [file, add, update, remove]);
  if (!value) return null;
  return <TagsContext.Provider value={value}>{children}</TagsContext.Provider>;
}

export function useTags(): Ctx {
  const ctx = useContext(TagsContext);
  if (!ctx) throw new Error("useTags outside TagsProvider");
  return ctx;
}
```

```tsx
// web/src/tags/TagChips.tsx
import { useTags } from "../state/TagsProvider";

export function TagChips({ ids }: { ids: string[] }) {
  const { byId } = useTags();
  return (
    <span className="chips">
      {ids.flatMap((id) => { const t = byId.get(id); return t ? [<span key={id} className="chip" style={{ borderColor: t.colour, color: t.colour }}>{t.name}</span>] : []; })}
    </span>
  );
}
```

```tsx
// web/src/tags/TagPicker.tsx
import { useState } from "react";
import { useTags } from "../state/TagsProvider";

const NEW_COLOUR = "#64748B";

/** Toggle tags on one thing. The list is the global list; adding here adds globally. */
export function TagPicker({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const { tags, add, update, remove } = useTags();
  const [draft, setDraft] = useState("");
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  const create = async () => {
    if (!draft.trim()) return;
    const tag = await add(draft.trim(), NEW_COLOUR);
    onChange([...value, tag.id]);
    setDraft("");
  };
  return (
    <div className="tag-picker" onMouseDown={(e) => e.stopPropagation()}>
      {tags.map((t) => (
        <div key={t.id} className="tag-row">
          <label><input type="checkbox" checked={value.includes(t.id)} onChange={() => toggle(t.id)} /> <span style={{ color: t.colour }}>{t.name}</span></label>
          <input type="color" value={t.colour} onChange={(e) => update({ ...t, colour: e.target.value })} title="Recolour" />
          <button className="quiet" onClick={() => { const name = prompt("Rename tag", t.name); if (name) update({ ...t, name }); }} title="Rename">✎</button>
          <button className="quiet" onClick={() => remove(t.id)} title="Delete tag">×</button>
        </div>
      ))}
      <div className="tag-row">
        <input value={draft} placeholder="new tag" onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} />
        <button onClick={create}>Add</button>
      </div>
    </div>
  );
}

export function FilterBar({ active, onChange }: { active: string[]; onChange: (ids: string[]) => void }) {
  const { tags } = useTags();
  const toggle = (id: string) => onChange(active.includes(id) ? active.filter((v) => v !== id) : [...active, id]);
  return (
    <div className="filter-bar">
      {tags.map((t) => (
        <button key={t.id} className={`chip ${active.includes(t.id) ? "on" : ""}`} style={{ borderColor: t.colour, color: t.colour }} onClick={() => toggle(t.id)}>{t.name}</button>
      ))}
      {active.length > 0 && <button className="quiet" onClick={() => onChange([])}>clear</button>}
    </div>
  );
}
```

The rename uses `prompt`, which is a modal the browser owns. It is the one place in the app a modal appears, it is only reached from an explicit "rename" click, and it keeps the picker free of an inline editor. Replace it later if it grates.

- [ ] **Step 4: Wire tags into nodes, the board, the overlay, the shell**

- Each node component gets a `⋯` button in its head that toggles a `<TagPicker value={data.tags} onChange={(tags) => dispatch({ type: "setNodeTags", id, tags })} />` below the head, and `<TagChips ids={data.tags} />` in the head at all times.
- `BoardView`: compute `const hidden = hiddenNodeIds(state.board)` and pass `nodes={state.board.nodes.map((n) => ({ ...n, hidden: hidden.has(n.id) }))}`. `hidden` is set on the array handed to React Flow, never on the stored nodes, and `toBoardJson` will never see it because the reducer's nodes are untouched.
- Edges: `edges={state.board.edges.map((e) => ({ ...e, hidden: hidden.has(e.source) || hidden.has(e.target), style: edgeStyle(e, byId) }))}` where `edgeStyle` colours the line with its first tag's colour.
- `PageOverlay`: marks not passing `isVisible(board.active_tags, h.tags)` get class `dimmed` (opacity 0.25); outlines likewise by node tags.
- `App.tsx`: wrap everything in `<TagsProvider>`, and put `<FilterBar active={state.board.active_tags} onChange={(tags) => dispatch({ type: "setActiveTags", tags })} />` in the top bar.

Add to `styles.css`:

```css
.chips { display: inline-flex; gap: 4px; flex-wrap: wrap; }
.chip { font-size: 11px; padding: 0 6px; border: 1px solid; border-radius: 999px; background: #fff; cursor: default; }
.filter-bar .chip { cursor: pointer; opacity: .6; } .filter-bar .chip.on { opacity: 1; font-weight: 600; }
.tag-picker { border-top: 1px solid #eee; padding: 4px 6px; font-size: 12px; }
.tag-row { display: flex; gap: 6px; align-items: center; }
.overlay .dimmed { opacity: .25; }
```

- [ ] **Step 5: Run the tests, then check by hand**

Run: `cd web && npm test`
Expected: all pass.

By hand: tag one chunk `claim` and one `evidence`. Filter to `claim`: only that chunk shows on the board; in the paper view the other outline dims. Clear the filter. Add a new tag "pass 3" from a picker; it appears in the filter bar. Rename `pass 1` to `first look`: every chip updates, no board changed. Delete the new tag: it vanishes from the picker and from the chunk. Reload: `tags.json` has the changes; `board.json` still lists the deleted id on that chunk, which is correct and harmless (addendum 4.3).

- [ ] **Step 6: Commit**

```bash
git add web/src
git commit -m "feat(web): global tags with picker, chips, and the tag filter"
```

---

### Task 4: Connections and notes

**Files:**
- Create: `web/src/board/EdgePopover.tsx`, `web/src/paper/MarkPopover.tsx`
- Modify: `web/src/board/BoardView.tsx`, `web/src/board/nodes/NoteNode.tsx`, `web/src/board/nodes/GroupNode.tsx`, `web/src/paper/PageOverlay.tsx`, `web/src/paper/PaperScreen.tsx`
- Test: `web/src/board/notes.test.ts`

**Interfaces:**
- Produces:
  - `onConnect` in the board: dragging from any handle to any other makes an edge with `data.tags: []`; the handle ids that are highlight ids become `sourceHandle` or `targetHandle`
  - `<EdgePopover edge />` on edge click: `TagPicker` for the edge's tags, a delete button
  - Notes: `NoteNode` loads its text with `api.getNote` on mount, shows it wrapped, and on double-click becomes a `textarea`; leaving the textarea saves with `api.putNote` and keeps the first line as the node's title. Note text is never in `board.json`.
  - `createNote(paperId, state, dispatch, near: XY, link?: { highlightId: string; chunkId: string | null }) -> Promise<NoteNode>` — a helper that makes the node, writes an empty note file, and if `link` is given sets `highlights[].note` and, when the highlight sits in a chunk, adds an edge from that chunk's handle to the note
  - `<MarkPopover highlight />` in the paper view on click of a mark: `TagPicker`, "Add note" (creates a note linked to the mark and opens the board on it), "Remove"
  - Margin notes: `PageOverlay` draws, for each highlight with a `note`, a small box in the page's right margin at the mark's height with the note's first 120 characters, loaded through `api.getNote` and cached per node id in the provider
  - Group names: `GroupNode` shows the name, or "unnamed pile" in grey, and a double-click turns it into an input

- [ ] **Step 1: Write the failing test**

`web/src/board/notes.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { linkNoteToHighlight } from "./notes";
import { emptyBoard, type BoardNode, type Highlight } from "../model/types";

const q = { exact: "x", prefix: "", suffix: "" };
const chunk: BoardNode = { id: "n-c", type: "chunk", position: { x: 0, y: 0 },
  data: { tags: [], collapsed: false, region: { rects: [{ page: 0, rect: [0, 0, 100, 100] }], start: q, end: q, position: 0, state: "anchored" }, text: "", user_sized: false, source_id: null } };
const inside: Highlight = { id: "h-in", tags: ["t-question"], note: null, anchor: { page: 0, rect: [10, 10, 50, 20], quote: q, position: 0, state: "anchored" } };
const outside: Highlight = { id: "h-out", tags: [], note: null, anchor: { page: 3, rect: [10, 10, 50, 20], quote: q, position: 0, state: "anchored" } };

describe("linkNoteToHighlight", () => {
  it("sets the note field and adds an edge from the containing chunk's handle", () => {
    const dispatch = vi.fn();
    const board = { ...emptyBoard("p"), nodes: [chunk], highlights: [inside] };
    linkNoteToHighlight(board, "h-in", "n-note", dispatch);
    expect(dispatch).toHaveBeenCalledWith({ type: "setHighlightNote", id: "h-in", note: "n-note" });
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: "addEdge", edge: expect.objectContaining({ source: "n-c", sourceHandle: "h-in", target: "n-note" }) }));
  });
  it("sets only the note field when the mark is in no chunk", () => {
    const dispatch = vi.fn();
    const board = { ...emptyBoard("p"), nodes: [chunk], highlights: [outside] };
    linkNoteToHighlight(board, "h-out", "n-note", dispatch);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({ type: "setHighlightNote", id: "h-out", note: "n-note" });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd web && npm test -- notes`
Expected: FAIL, cannot resolve `./notes`.

- [ ] **Step 3: Write `web/src/board/notes.ts`**

```ts
import type { Dispatch } from "react";
import { api } from "../api/client";
import type { BoardAction, BoardState } from "../model/boardReducer";
import { highlightsIn } from "../model/geometry";
import { newId } from "../model/ids";
import type { Board, BoardNode, NoteNode } from "../model/types";

export const NOTE_WIDTH = 280;

/** A note answering a mark: the highlight's `note` field always; an edge too when a
 *  chunk contains the mark, so the line is visible on the board (addendum 4.0). */
export function linkNoteToHighlight(board: Board, highlightId: string, noteId: string, dispatch: Dispatch<BoardAction>) {
  dispatch({ type: "setHighlightNote", id: highlightId, note: noteId });
  const highlight = board.highlights.find((h) => h.id === highlightId);
  if (!highlight) return;
  const owner = board.nodes.find((n): n is BoardNode & { type: "chunk" | "figure" } =>
    (n.type === "chunk" || n.type === "figure") && highlightsIn([highlight], n.data.region).length > 0);
  if (owner) dispatch({ type: "addEdge", edge: { id: newId("e"), source: owner.id, sourceHandle: highlightId, target: noteId, data: { tags: [] } } });
}

export async function createNote(paperId: string, state: BoardState, dispatch: Dispatch<BoardAction>, near: { x: number; y: number }, highlightId?: string): Promise<NoteNode> {
  const id = newId("n");
  const node: NoteNode = { id, type: "note", position: near, initialWidth: NOTE_WIDTH, data: { tags: [], collapsed: false, note: `notes/${id}.md` } };
  await api.putNote(paperId, id, "");
  dispatch({ type: "addNode", node });
  if (highlightId) linkNoteToHighlight(state.board, highlightId, id, dispatch);
  return node;
}
```

- [ ] **Step 4: Run the notes tests**

Run: `cd web && npm test -- notes`
Expected: 2 passed.

- [ ] **Step 5: Wire connections, note editing, the mark popover, margin notes, group names**

`BoardView.tsx`:

```tsx
const onConnect: OnConnect = (connection) => {
  if (!connection.source || !connection.target) return;
  dispatch({ type: "addEdge", edge: {
    id: newId("e"), source: connection.source, target: connection.target,
    sourceHandle: connection.sourceHandle?.startsWith("h-") ? connection.sourceHandle : null,
    targetHandle: connection.targetHandle?.startsWith("h-") ? connection.targetHandle : null,
    data: { tags: [] },
  } });
};
const [edgePopover, setEdgePopover] = useState<{ id: string; at: { x: number; y: number } } | null>(null);
...
<ReactFlow ... onConnect={onConnect} onEdgeClick={(event, edge) => setEdgePopover({ id: edge.id, at: { x: event.clientX, y: event.clientY } })} onPaneClick={() => setEdgePopover(null)} />
{edgePopover && <EdgePopover edge={state.board.edges.find((e) => e.id === edgePopover.id)!} at={edgePopover.at} onClose={() => setEdgePopover(null)} />}
```

Handles that are not highlights (`${id}-in`, `${id}-out`) connect node to node; handles whose id starts with `h-` connect to a mark. Both are legal ends; the reducer and the server accept either.

```tsx
// web/src/board/EdgePopover.tsx
import { TagPicker } from "../tags/TagPicker";
import { useBoard } from "../state/BoardProvider";
import type { BoardEdge } from "../model/types";

export function EdgePopover({ edge, at, onClose }: { edge: BoardEdge; at: { x: number; y: number }; onClose: () => void }) {
  const { dispatch } = useBoard();
  return (
    <div className="popover column" style={{ left: at.x + 8, top: at.y + 8 }}>
      <TagPicker value={edge.data?.tags ?? []} onChange={(tags) => dispatch({ type: "replaceEdge", edge: { ...edge, data: { tags } } })} />
      <div className="tag-row">
        <button onClick={() => { dispatch({ type: "removeEdge", id: edge.id }); onClose(); }}>Remove line</button>
        <button className="quiet" onClick={onClose}>close</button>
      </div>
    </div>
  );
}
```

`NoteNode.tsx`:

```tsx
import { useEffect, useState } from "react";
import { Handle, NodeResizer, Position, type NodeProps } from "@xyflow/react";
import { api } from "../../api/client";
import type { NoteNode as NoteNodeType } from "../../model/types";
import { useBoard } from "../../state/BoardProvider";
import { TagChips } from "../../tags/TagChips";
import { TagPicker } from "../../tags/TagPicker";

export function NoteNode({ id, data, selected }: NodeProps<NoteNodeType>) {
  const { paperId, dispatch, notes } = useBoard();
  const [text, setText] = useState<string>(notes.get(id) ?? "");
  const [editing, setEditing] = useState(false);
  const [showTags, setShowTags] = useState(false);
  useEffect(() => { api.getNote(paperId, id).then((n) => { setText(n.markdown); notes.set(id, n.markdown); }); }, [paperId, id, notes]);
  const save = async () => { setEditing(false); notes.set(id, text); await api.putNote(paperId, id, text); };
  const title = text.split("\n")[0].slice(0, 60) || "empty note";
  return (
    <div className="node note" onDoubleClick={() => setEditing(true)}>
      <NodeResizer isVisible={selected} minWidth={160} minHeight={60} />
      <div className="node-head">
        <span className="title">{title}</span>
        <TagChips ids={data.tags} />
        <button className="quiet" onClick={() => setShowTags((s) => !s)}>⋯</button>
      </div>
      {showTags && <TagPicker value={data.tags} onChange={(tags) => dispatch({ type: "setNodeTags", id, tags })} />}
      {editing
        ? <textarea className="nodrag nowheel" autoFocus value={text} onChange={(e) => setText(e.target.value)} onBlur={save} />
        : <div className="node-body">{text || <span className="hint">double-click to write</span>}</div>}
      <Handle id={`${id}-in`} type="target" position={Position.Left} />
      <Handle id={`${id}-out`} type="source" position={Position.Right} />
    </div>
  );
}
```

`notes` is a `Map<string, string>` cache added to the `BoardProvider` context (`useRef(new Map()).current`), so the paper overlay can show margin notes without refetching every render. The `nodrag nowheel` classes keep React Flow from stealing the textarea's drag and scroll.

`MarkPopover.tsx`:

```tsx
import { TagPicker } from "../tags/TagPicker";
import { useBoard } from "../state/BoardProvider";
import { createNote } from "../board/notes";
import { nextChunkPosition } from "../board/layout";
import type { Highlight } from "../model/types";

export function MarkPopover({ highlight, at, onClose, onOpenBoard }: { highlight: Highlight; at: DOMRect; onClose: () => void; onOpenBoard: (nodeId: string) => void }) {
  const { paperId, state, dispatch } = useBoard();
  const addNote = async () => {
    const note = await createNote(paperId, state, dispatch, nextChunkPosition(state.board.nodes), highlight.id);
    onClose();
    onOpenBoard(note.id);
  };
  return (
    <div className="popover column" style={{ left: at.right + 8, top: at.top }}>
      <div className="quote">{highlight.anchor.quote.exact.slice(0, 160)}</div>
      <TagPicker value={highlight.tags} onChange={(tags) => dispatch({ type: "setHighlightTags", id: highlight.id, tags })} />
      <div className="tag-row">
        {highlight.note ? <button onClick={() => onOpenBoard(highlight.note!)}>Open note</button> : <button onClick={addNote}>Add note</button>}
        <button onClick={() => { dispatch({ type: "removeHighlight", id: highlight.id }); onClose(); }}>Remove</button>
        <button className="quiet" onClick={onClose}>close</button>
      </div>
    </div>
  );
}
```

`PageOverlay.tsx`: marks get `pointer-events: auto` and `onClick={(e) => onMarkClick(h, e.currentTarget.getBoundingClientRect())}`; the drag-selection code in `PaperView` ignores a mouse-up whose target is a mark. For each highlight with `note` set and text in the `notes` cache, draw `<div className="margin-note" style={{ top: rect[1] * scale }}>{first 120 chars}</div>` in a `margin` column to the right of the page (the `.page-wrap` gets `margin-right: 200px` and the margin column is absolutely positioned at `left: 100%`).

`GroupNode.tsx`: the name becomes an `<input className="nodrag" />` on double-click; blur dispatches `replaceNode` with the new `data.name` (empty string stored as `null`).

Add to `styles.css`:

```css
.popover.column { flex-direction: column; align-items: stretch; min-width: 240px; }
.popover .quote { font-size: 12px; color: #444; border-left: 3px solid var(--hl); padding-left: 6px; max-height: 60px; overflow: hidden; }
.overlay .mark { pointer-events: auto; cursor: pointer; }
.margin-note { position: absolute; left: 100%; margin-left: 12px; width: 180px; font-size: 11px; color: #444; background: #fffef5; border: 1px solid #e7e2b8; padding: 4px 6px; }
.node.note textarea { width: 100%; min-height: 100px; font: inherit; border: 0; padding: 6px 8px; resize: none; }
.hint { color: #999; }
.group-name input { font: inherit; font-weight: 600; }
```

- [ ] **Step 6: Run the tests, then check by hand**

Run: `cd web && npm test`
Expected: all pass.

By hand, the sparse-policy walkthrough from the scope page: highlight a phrase in the introduction, tag it `question`, click the mark, "Add note": the board opens on a new note linked to the mark. Write in it, click away: reload, the text is there and `notes/<id>.md` has it with its front matter. Cut section 3.2, highlight the definition inside it, drag from that mark's handle to the note: a line. Click the line, tag it `supports`: the line turns green. Back in the paper: the margin shows the note's first line beside the mark.

- [ ] **Step 7: Commit**

```bash
git add web/src
git commit -m "feat(web): connections with tags, notes in the reader's words, mark popover, margin notes, group names"
```

---

### Task 5: The question queue, the goal, export, and the empty-board hint

**Files:**
- Create: `web/src/panels/QuestionList.tsx`, `web/src/panels/ExportDialog.tsx`
- Modify: `web/src/App.tsx`, `web/src/board/BoardView.tsx`

**Interfaces:**
- Produces:
  - `<QuestionList onFocus(question) />` — fetches `GET /questions` when opened and after every save; each row shows the kind and text; clicking a highlight row opens the paper at its rect, clicking a node row opens the board selected on it
  - The goal: one input in the top bar bound to `board.goal`, placeholder "Why am I reading this?"
  - `<ExportDialog />` — "Export" button posts the active tag filter, shows the path the file was written to and the Markdown in a scrollable box with a "copy" button
  - The empty-board hint from SPEC.md section 4 (moved here from Task 2 if it was not done there)

- [ ] **Step 1: Write the panels**

```tsx
// web/src/panels/QuestionList.tsx
import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { Question } from "../model/types";
import { useBoard } from "../state/BoardProvider";

export function QuestionList({ onFocus }: { onFocus: (q: Question) => void }) {
  const { paperId, state } = useBoard();
  const [questions, setQuestions] = useState<Question[]>([]);
  useEffect(() => { if (!state.dirty) api.getQuestions(paperId).then(setQuestions); }, [paperId, state.dirty, state.board.version]);
  return (
    <aside className="panel">
      <h3>Not yet understood</h3>
      {questions.length === 0 && <p className="hint">Nothing tagged <i>question</i> is waiting for a note.</p>}
      <ul>{questions.map((q) => <li key={q.id}><button className="quiet" onClick={() => onFocus(q)}><span className="kind">{q.kind}</span> {q.text.slice(0, 90)}</button></li>)}</ul>
    </aside>
  );
}
```

```tsx
// web/src/panels/ExportDialog.tsx
import { useState } from "react";
import { api } from "../api/client";
import type { ExportResult } from "../model/types";
import { useBoard } from "../state/BoardProvider";

export function ExportDialog() {
  const { paperId, state } = useBoard();
  const [result, setResult] = useState<ExportResult | null>(null);
  const run = async () => setResult(await api.postExport(paperId, state.board.active_tags));
  return (
    <>
      <button onClick={run} title={state.board.active_tags.length ? "Exports only what the filter shows" : "Exports the whole board"}>Export</button>
      {result && (
        <div className="dialog">
          <div className="tag-row"><b>Written to</b> <code>{result.path}</code>
            <button onClick={() => navigator.clipboard.writeText(result.markdown)}>Copy Markdown</button>
            <button className="quiet" onClick={() => setResult(null)}>close</button></div>
          <pre>{result.markdown}</pre>
        </div>
      )}
    </>
  );
}
```

`App.tsx` top bar, inside the provider: the paper select, the goal input, the filter bar, a "Questions" toggle, the Export button, the view switch, the Notice. The question panel sits to the right of whichever view is open. `onFocus` for a highlight row sets `focusRect` from the highlight's anchor and switches to the paper; for a node row, switches to the board and dispatches a select change for that node (`{ type: "nodes", changes: [{ type: "select", id, selected: true }] }`) after `fitView` on it through a `focusNode` prop on `BoardView` that calls `useReactFlow().fitView({ nodes: [{ id }], duration: 300 })`.

Add to `styles.css`:

```css
.goal { flex: 1; font: inherit; border: 0; border-bottom: 1px dashed #bbb; background: none; padding: 2px 4px; }
.panel { width: 280px; border-left: 1px solid #ddd; padding: 8px 12px; overflow: auto; font-size: 13px; }
.panel .kind { color: #7c3aed; font-size: 11px; text-transform: uppercase; margin-right: 4px; }
.dialog { position: fixed; inset: 60px 10% auto 10%; max-height: 70vh; overflow: auto; background: #fff; border: 1px solid #bbb; box-shadow: 0 4px 24px rgba(0,0,0,.25); padding: 12px; z-index: 20; }
.dialog pre { white-space: pre-wrap; font-size: 12px; }
.with-panel { display: grid; grid-template-columns: 1fr auto; height: 100%; }
```

- [ ] **Step 2: Check by hand**

Tag a mark `question` with no note: it appears in the panel. Add a note to it: the panel empties after the save. Set the goal: reload, it is still there. Export with no filter: the dialog shows the path, and the Markdown starts with the paper's title, then the goal line, then the chunks in paper order with their marks and notes. Filter to `claim` and export again: only claim-tagged things appear.

- [ ] **Step 3: Commit**

```bash
git add web/src
git commit -m "feat(web): question queue, reading goal, export dialog"
```

---

### Task 6: Playwright: reconstruct an argument and export it

**Files:**
- Create: `web/e2e/step5.spec.ts`

**Interfaces:**
- Consumes: everything above, the same server helper as the core plan's spec.
- Produces: the mechanical half of SPEC.md section 11 items 1 to 4: split, tag two chunks `claim` and `evidence`, connect them with a `supports` line, tag a mark `question`, answer it with a note, filter to `pass 1`, export and check the Markdown.

- [ ] **Step 1: Write the spec**

`web/e2e/step5.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("split, tag, connect, answer a question, filter, export", async ({ page }) => {
  await page.goto("/");
  await page.locator("select").selectOption({ index: 1 });
  await expect(page.locator(".react-pdf__Page").first()).toBeVisible();

  await page.getByRole("button", { name: "Board" }).click();
  await page.getByRole("button", { name: "Split into sections" }).click();
  await expect(page.locator(".node.chunk")).toHaveCount(22);
  await expect(page.locator(".node.figure")).toHaveCount(20);
  await expect(page.getByRole("button", { name: "Split into sections" })).toBeDisabled();

  // tag the introduction "claim" and the first table "evidence"
  const intro = page.locator(".node.chunk", { hasText: "1. Introduction" });
  await intro.locator("button", { hasText: "⋯" }).click();
  await intro.getByLabel("claim").check();
  const table = page.locator(".node.figure", { hasText: "Table 1" });
  await table.locator("button", { hasText: "⋯" }).click();
  await table.getByLabel("evidence").check();

  // connect them: drag from the table's source handle to the intro's target handle
  const from = (await table.locator(".react-flow__handle-right").boundingBox())!;
  const to = (await intro.locator(".react-flow__handle-left").boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
  await page.mouse.up();
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);
  await page.locator(".react-flow__edge").first().click();
  await page.getByLabel("supports").check();

  // a question mark in the paper, answered with a note
  await page.getByRole("button", { name: "Paper" }).click();
  const spans = page.locator('.react-pdf__Page[data-page-number="1"] .react-pdf__Page__textContent span');
  const a = (await spans.nth(30).boundingBox())!;
  await page.mouse.move(a.x + 2, a.y + a.height / 2); await page.mouse.down();
  await page.mouse.move(a.x + a.width - 2, a.y + a.height / 2, { steps: 6 }); await page.mouse.up();
  await page.getByRole("button", { name: "Highlight" }).click();
  await page.locator(".overlay .mark").first().click();
  await page.getByLabel("question").check();
  await page.getByRole("button", { name: "Questions" }).click();
  await expect(page.locator(".panel li")).toHaveCount(1);
  await page.locator(".overlay .mark").first().click();
  await page.getByRole("button", { name: "Add note" }).click();
  await expect(page.locator(".node.note")).toHaveCount(1);
  await page.locator(".node.note").dblclick();
  await page.locator(".node.note textarea").fill("It means the reward is zero almost everywhere.");
  await page.locator(".react-flow__pane").click();
  await expect(page.locator(".notice")).toHaveText(/Saved v\d+/);
  await expect(page.locator(".panel li")).toHaveCount(0);

  // filter and export
  await page.locator(".filter-bar .chip", { hasText: "claim" }).click();
  await expect(page.locator(".node.chunk:visible")).toHaveCount(1);
  await page.getByRole("button", { name: "Export" }).click();
  const markdown = await page.locator(".dialog pre").textContent();
  expect(markdown).toContain("1. Introduction");
  expect(markdown).not.toContain("2. Related Work");
});
```

- [ ] **Step 2: Run both specs**

```bash
cd web && npm run e2e
```

Expected: 2 passed. As in the core plan, span indices and handle class names are the fragile part; the trace viewer says which step drifted, and the counts and the Markdown assertions are what must hold.

- [ ] **Step 3: Commit**

```bash
git add web/e2e/step5.spec.ts
git commit -m "test(web): automate the argument reconstruction and export"
```

---

## Done when

- `cd web && npm test && npm run build && npm run e2e` all pass, both specs.
- SPEC.md section 11, all six checks, done by a person on a paper they needed to read, with the answers written into the commit message of the merge. Item 4, "filter to your first-pass tag; does it match what you knew after ten minutes", is a judgment and is recorded as one.
- The exported Markdown for that paper has been read once as a literature note, and reads as one.

## Deferred, with reasons

- **Markdown rendering in notes.** Notes are stored as Markdown and shown as wrapped text. Rendering wants a library (`marked`, MIT) and a decision about editing mode; neither is needed to test the reading loop.
- **Handles at the mark's true height inside an expanded chunk.** Handles stack at the chunk's right edge in order. Placing each at its mark's line needs a measurement pass after render.
- **Line rects for multi-line highlights.** A highlight is painted as one bounding box. Per-line rectangles are a change to the highlight anchor shape and touch the server.
- **Concept notes, multi-paper, citation graphs.** Not in v1 by SPEC.md section 9.
