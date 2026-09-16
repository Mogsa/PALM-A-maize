# Frontend Core Implementation Plan (build step 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The two views of one board, working end to end: open a paper, select a span in the paper view, choose highlight or cut, see the cut as a chunk on the board with its marks painted on it, move and resize it, close, reopen, and find everything where it was. SPEC.md section 10, step 3: the step where the tool either works or does not.

**Architecture:** A Vite + React + TypeScript app in `web/`, served by `paperboard serve` once built and by Vite's dev server with an `/api` proxy during development. The paper view is `react-pdf` plus a selection layer of our own that turns a DOM selection into page-space rectangles. The board view is React Flow with four node types. One reducer holds the board; one persistence hook saves it, debounced and versioned. Every pure rule (serialization, re-parenting, selection geometry, containment) is a plain module with a vitest file. The two libraries are verified by a spike before anything is built on them.

**Tech Stack:** React 19.3, TypeScript 7, Vite 8, `@xyflow/react` 12.11, `react-pdf` 11 over `pdfjs-dist` 6.3, `ulid` 3, vitest 5 with jsdom 30, `@playwright/test` 1.63. All MIT or Apache.

**Spec:** `docs/SPEC.md` sections 4, 5, 11; `docs/SPEC-ADDENDUM.md` sections 2, 4, 6, 8; `docs/superpowers/plans/2026-09-16-api-and-storage.md` Task 2 (the shapes) and Task 8 (the routes). The API plan must be merged before Task 4 of this plan; Tasks 1 to 3 need nothing from it.

## Global Constraints

- **All geometry sent to or stored by the server is PyMuPDF page space:** points, origin top-left, y down, pages 0-indexed. The browser converts from CSS pixels exactly once, in `selection.ts`, and back exactly once, in the overlay. Never use PDF.js text item transforms; they are bottom-left PDF user space.
- **`board.json` is React Flow's shape with runtime fields stripped.** `selected`, `dragging`, `resizing`, `measured`, `internals` never leave the browser. Parents precede children in `nodes`. A child's `position` is relative to its parent.
- **Every id is minted here:** `n-`, `e-`, `h-` prefixed ULIDs. The server mints nothing.
- **Saves are debounced 500 ms after the last change, never on the drag path, and carry `If-Match`.** A `409` means another tab moved first: reload the board, tell the reader in one line, never merge.
- **The paper is the only place you mark or cut. The board is the only place you arrange.** No text selection inside board nodes.
- **Nothing generated.** No summaries, no suggestions. The tool draws what the reader did.
- **Local only.** The app talks to `127.0.0.1` and loads no external script, font, or stylesheet.
- Highlights are not nodes. They live in `board.highlights` and show through chunks by geometry (addendum 4.0).

---

## File Structure

```
web/package.json
web/vite.config.ts                 # react plugin, /api proxy to 127.0.0.1:8765, test config
web/tsconfig.json
web/index.html
web/playwright.config.ts
web/src/main.tsx
web/src/App.tsx                    # paper list, current paper, view switch, focus target
web/src/api/client.ts              # typed fetch wrappers for the routes this plan uses
web/src/model/types.ts             # Board, nodes, edges, highlights, anchors, Source: mirror of API Task 2
web/src/model/ids.ts               # newId("n" | "e" | "h")
web/src/model/geometry.ts          # Rect helpers, containsPoint, highlightsIn
web/src/model/serialize.ts         # toBoardJson: strip, sort, drop undefined
web/src/model/reparent.ts          # absolute <-> relative positions
web/src/model/boardReducer.ts      # the one place board state changes
web/src/state/BoardProvider.tsx    # loads a board, exposes state + dispatch, runs persistence
web/src/state/persistence.ts       # debounced PUT with If-Match; 409 handling
web/src/paper/selection.ts         # DOM selection -> PageRect[]
web/src/paper/PaperView.tsx        # Document + pages + overlays + popover
web/src/paper/PageOverlay.tsx      # highlights and chunk outlines for one page
web/src/paper/SelectionPopover.tsx # Highlight | Cut
web/src/board/BoardView.tsx        # ReactFlow, node types, drag/resize/reparent
web/src/board/nodes/ChunkNode.tsx
web/src/board/nodes/FigureNode.tsx
web/src/board/nodes/NoteNode.tsx
web/src/board/nodes/GroupNode.tsx
web/src/board/layout.ts            # where a new chunk lands
web/src/styles.css
web/src/**/*.test.ts               # vitest
web/e2e/step3.spec.ts              # Playwright: SPEC.md section 11 items 5 and 6
web/e2e/server.mjs                 # starts paperboard serve on a fresh data folder for the spec
docs/superpowers/plans/2026-09-16-frontend-spike-findings.md   # Task 1's output
```

---

### Task 1: The spike. Verify the two libraries before building on them

**Files:**
- Create: `web/` scaffold (kept), `web/src/spike/*` (deleted at the end of the task)
- Create: `docs/superpowers/plans/2026-09-16-frontend-spike-findings.md`

**Interfaces:**
- Consumes: nothing.
- Produces: the findings file, and the scaffold (`package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`) every later task builds in. Four facts, each measured in a browser, each recorded as a sentence with the number that proves it.

SPEC-ADDENDUM.md section 8 asks for this spike and calls groups "the one primitive with no fallback". The extraction plan taught the same lesson: a library claim that has not been run is a plan defect waiting to happen.

- [ ] **Step 1: Scaffold**

```bash
mkdir -p web && cd web
npm init -y
npm install react@19 react-dom@19 @xyflow/react@12 react-pdf@11 ulid@3
npm install -D typescript@7 vite@8 @vitejs/plugin-react@6 @types/react@19 @types/react-dom@19 vitest@5 jsdom@30 @testing-library/react@16 @playwright/test@1.63
npx playwright install chromium
```

`web/package.json` scripts:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview --port 4173",
    "test": "vitest run",
    "e2e": "playwright test"
  }
}
```

`web/vite.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/api": "http://127.0.0.1:8765" } },
  preview: { proxy: { "/api": "http://127.0.0.1:8765" } },
  test: { environment: "jsdom", include: ["src/**/*.test.ts", "src/**/*.test.tsx"] },
});
```

`web/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022", "lib": ["ES2022", "DOM", "DOM.Iterable"], "module": "ESNext",
    "moduleResolution": "bundler", "jsx": "react-jsx", "strict": true, "noEmit": true,
    "skipLibCheck": true, "types": ["vite/client"]
  },
  "include": ["src", "e2e", "vite.config.ts"]
}
```

`web/index.html`:

```html
<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>Paper Board</title></head>
  <body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body>
</html>
```

`web/src/main.tsx` renders `<FlowSpike />` or `<PdfSpike />` while the spike runs. Before the commit in Step 5 it is reduced to rendering `<p>paper board</p>`, so the scaffold builds without the deleted spike files; Task 4 writes the real one.

- [ ] **Step 2: Spike A, React Flow nesting and re-parenting**

`web/src/spike/FlowSpike.tsx`:

```tsx
import { useCallback, useState } from "react";
import { ReactFlow, applyNodeChanges, useReactFlow, ReactFlowProvider, type Node, type NodeChange } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

const group = (id: string, parent: string | undefined, x: number, size: number): Node => ({
  id, type: "group", position: { x, y: x }, width: size, height: size, parentId: parent, extent: parent ? "parent" : undefined,
  data: {}, style: { border: "1px dashed #888", background: "rgba(0,0,0,0.03)" },
});

const initial: Node[] = [
  group("g1", undefined, 40, 600),
  group("g2", "g1", 30, 480),
  group("g3", "g2", 30, 360),
  group("g4", "g3", 30, 240),
  { id: "leaf", parentId: "g4", extent: "parent", position: { x: 20, y: 20 }, data: { label: "leaf" }, width: 120, height: 40 },
  { id: "free", position: { x: 800, y: 100 }, data: { label: "free" }, width: 120, height: 40 },
];

function Inner() {
  const [nodes, setNodes] = useState(initial);
  const { getInternalNode } = useReactFlow();
  const onNodesChange = useCallback((changes: NodeChange[]) => setNodes((ns) => applyNodeChanges(changes, ns)), []);
  const report = () => {
    const leaf = getInternalNode("leaf")!;
    const free = getInternalNode("free")!;
    console.log("SPIKE leaf absolute", leaf.internals.positionAbsolute, "relative", leaf.position);
    console.log("SPIKE free absolute", free.internals.positionAbsolute);
  };
  const reparentFree = () => {
    setNodes((ns) => ns.map((n) => {
      if (n.id !== "free") return n;
      const g2 = getInternalNode("g2")!.internals.positionAbsolute;
      const abs = getInternalNode("free")!.internals.positionAbsolute;
      return { ...n, parentId: "g2", extent: "parent", position: { x: abs.x - g2.x, y: abs.y - g2.y } };
    }).sort((a, b) => (a.parentId && !b.parentId ? 1 : !a.parentId && b.parentId ? -1 : 0)));
  };
  return (
    <div style={{ height: "100vh" }}>
      <button onClick={report}>report</button>
      <button onClick={reparentFree}>reparent free into g2</button>
      <ReactFlow nodes={nodes} onNodesChange={onNodesChange} fitView />
    </div>
  );
}

export default function FlowSpike() {
  return <ReactFlowProvider><Inner /></ReactFlowProvider>;
}
```

Run `npm run dev`, open it, and record:

1. Drag `g1` by 100 px. Does `leaf` move with it at four levels of nesting? Click report: `leaf absolute` must have moved by 100 and `relative` must be unchanged.
2. Click "reparent free into g2". Does `free` stay visually where it was? Then drag `g2`: does `free` now move with it? Then drag `free` toward the edge of `g2`: `extent: "parent"` must stop it at the boundary.
3. Move `free` in the array so it comes before `g2` (edit `reparentFree` to not sort) and reload: React Flow must warn in the console about parent order and misplace the node. This proves the sort is needed, not decorative.

- [ ] **Step 3: Spike B, react-pdf selection to page rectangles**

`web/src/spike/PdfSpike.tsx`, pointed at any local PDF served from `public/` (copy a fixture paper there for the spike only, and delete it after):

```tsx
import { useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

const WIDTH_PX = 700;

export default function PdfSpike() {
  const [pageWidthPt, setPageWidthPt] = useState(612);
  const onMouseUp = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    const pageEl = (range.startContainer.parentElement as HTMLElement).closest(".react-pdf__Page") as HTMLElement;
    const pageBox = pageEl.getBoundingClientRect();
    const scale = pageBox.width / pageWidthPt;
    const rects = Array.from(range.getClientRects()).map((r) => [
      (r.left - pageBox.left) / scale, (r.top - pageBox.top) / scale, (r.right - pageBox.left) / scale, (r.bottom - pageBox.top) / scale,
    ].map((v) => Math.round(v * 10) / 10));
    console.log("SPIKE page", pageEl.dataset.pageNumber, "scale", scale.toFixed(4), "rects(pt)", JSON.stringify(rects));
    console.log("SPIKE text", JSON.stringify(sel.toString()));
  };
  return (
    <div onMouseUp={onMouseUp} style={{ padding: 20 }}>
      <Document file="/resnet.pdf">
        <Page pageIndex={2} width={WIDTH_PX} renderAnnotationLayer={false}
              onLoadSuccess={(p) => setPageWidthPt(p.originalWidth)} />
      </Document>
    </div>
  );
}
```

Select the heading "3.1. Residual Learning" on page 3 of ResNet and record the logged rect. The extractor measured that heading's box as `[50, 130, 156, 139]` on page index 2 (see `docs/superpowers/plans/2026-09-15-extraction-verification.md` and the ResNet golden). The logged rect must agree within 3 points on every edge. If it does, the conversion is right and no flip is needed. If y is off by roughly `pageHeight - y`, the text layer is reporting bottom-left coordinates and the overlay and selection code in Tasks 4 and 5 must flip; record which.

Also record: does `sel.toString()` for a selection across two columns come out in reading order or visual order, and does `range.getClientRects()` give one rect per line?

- [ ] **Step 4: Write the findings file**

`docs/superpowers/plans/2026-09-16-frontend-spike-findings.md`, four short sections: nesting depth, re-parenting, parent order, selection geometry. Each states what was done, the numbers seen, and the consequence for Tasks 3 to 6. If any finding contradicts this plan, say so there and stop; the plan is amended before Task 2 starts.

- [ ] **Step 5: Delete the spike, keep the scaffold, commit**

```bash
rm -rf web/src/spike web/public/resnet.pdf
git add web/package.json web/package-lock.json web/vite.config.ts web/tsconfig.json web/index.html web/src/main.tsx docs/superpowers/plans/2026-09-16-frontend-spike-findings.md
git commit -m "chore: scaffold web app; record React Flow and react-pdf spike findings"
```

Add `web/node_modules/`, `web/dist/`, `web/test-results/`, `web/playwright-report/` to the repo `.gitignore` in the same commit.

---

### Task 2: Types, ids, API client

**Files:**
- Create: `web/src/model/types.ts`, `web/src/model/ids.ts`, `web/src/api/client.ts`
- Test: `web/src/model/ids.test.ts`, `web/src/api/client.test.ts`

**Interfaces:**
- Produces, mirroring API plan Task 2 name for name:
  - `Rect = [number, number, number, number]`, `PageRect = { page: number; rect: Rect }`
  - `QuoteSelector`, `AnchorState`, `HighlightAnchor`, `ChunkAnchor`, `Highlight`
  - `ChunkData`, `FigureData`, `NoteData`, `GroupData`
  - `ChunkNode = Node<ChunkData, "chunk">` and so on, `BoardNode` union, `BoardEdge = Edge<{ tags: string[] }>`
  - `Board = { schema: 1; paper_id; version; goal; active_tags; viewport; nodes: BoardNode[]; edges: BoardEdge[]; highlights: Highlight[] }`
  - `Source` with `pages`, `sections`, `figures`, `regions`, `page_text` as the extractor writes them
  - `Selection = { text; rects; region_label; highlight: HighlightAnchor | null; chunk: ChunkAnchor }`
  - `newId(kind: "n" | "e" | "h"): string`
  - `api.listPapers()`, `api.getSource(id)`, `api.getBoard(id)`, `api.putBoard(id, board, version) -> Promise<{ version } | { conflict: true; current: number }>`, `api.postText(id, rects, snap)`, `api.pdfUrl(id)`, `ApiError`

- [ ] **Step 1: Write the failing tests**

`web/src/model/ids.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { newId } from "./ids";

describe("newId", () => {
  it("prefixes by kind and is unique and sortable by time", () => {
    const a = newId("n");
    const b = newId("n");
    expect(a.startsWith("n-")).toBe(true);
    expect(newId("h").startsWith("h-")).toBe(true);
    expect(newId("e").startsWith("e-")).toBe(true);
    expect(a).not.toBe(b);
    expect(a < b || a.slice(0, 12) === b.slice(0, 12)).toBe(true);
  });
});
```

`web/src/api/client.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./client";

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe("api.putBoard", () => {
  it("sends If-Match and returns the new version", async () => {
    const fn = mockFetch(200, { version: 4 });
    const result = await api.putBoard("p", { paper_id: "p" } as never, 3);
    expect(result).toEqual({ version: 4 });
    const [, init] = fn.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)["If-Match"]).toBe("3");
    expect(init.method).toBe("PUT");
  });

  it("reports a conflict instead of throwing", async () => {
    mockFetch(409, { error: { code: "version_conflict", message: "x", current: 7 } });
    expect(await api.putBoard("p", { paper_id: "p" } as never, 3)).toEqual({ conflict: true, current: 7 });
  });

  it("throws ApiError with the server's code on other errors", async () => {
    mockFetch(404, { error: { code: "paper_not_found", message: "no paper p" } });
    await expect(api.getBoard("p")).rejects.toMatchObject({ code: "paper_not_found" });
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd web && npm test`
Expected: FAIL, cannot resolve `./ids` and `./client`.

- [ ] **Step 3: Write `web/src/model/types.ts`**

```ts
import type { Edge, Node } from "@xyflow/react";

export type Rect = [number, number, number, number];
export type PageRect = { page: number; rect: Rect };

export type QuoteSelector = { exact: string; prefix: string; suffix: string };
export type AnchorState = "anchored" | "relocated" | "orphaned";
export type HighlightAnchor = { page: number; rect: Rect; quote: QuoteSelector; position: number; state: AnchorState };
export type ChunkAnchor = { rects: PageRect[]; start: QuoteSelector; end: QuoteSelector; position: number; state: AnchorState };

export type Highlight = { id: string; tags: string[]; note: string | null; anchor: HighlightAnchor };

export type ChunkData = { tags: string[]; collapsed: boolean; region: ChunkAnchor; text: string; user_sized: boolean; source_id: string | null };
export type FigureData = { tags: string[]; collapsed: boolean; region: ChunkAnchor; clip: string | null; clip_size: { width: number; height: number } | null; caption: string; source_id: string | null };
export type NoteData = { tags: string[]; collapsed: boolean; note: string };
export type GroupData = { tags: string[]; name: string | null };

export type ChunkNode = Node<ChunkData, "chunk">;
export type FigureNode = Node<FigureData, "figure">;
export type NoteNode = Node<NoteData, "note">;
export type GroupNode = Node<GroupData, "group">;
export type BoardNode = ChunkNode | FigureNode | NoteNode | GroupNode;
export type BoardEdge = Edge<{ tags: string[] }>;

export type Viewport = { x: number; y: number; zoom: number };

export type Board = {
  schema: 1;
  paper_id: string;
  version: number;
  goal: string;
  active_tags: string[];
  viewport: Viewport;
  nodes: BoardNode[];
  edges: BoardEdge[];
  highlights: Highlight[];
};

export type Section = { id: string; number: string | null; depth: number; title: string; heading_rect: PageRect; extent: PageRect[]; text: string };
export type Figure = { id: string; kind: "figure" | "table"; label: string | null; caption: string; caption_rect: PageRect | null; rect: PageRect; confidence: string };
export type LayoutRegion = { page: number; rect: Rect; label: string };
export type PageInfo = { index: number; width: number; height: number; rotation: number };
export type Source = { schema: 1; paper_id: string; pages: PageInfo[]; sections: Section[]; figures: Figure[]; regions: LayoutRegion[]; page_text: { page: number; text: string }[] };

export type Selection = { text: string; rects: PageRect[]; region_label: string | null; highlight: HighlightAnchor | null; chunk: ChunkAnchor };
export type PaperSummary = { paper_id: string; title: string; page_count: number };

export const emptyBoard = (paper_id: string): Board => ({
  schema: 1, paper_id, version: 0, goal: "", active_tags: [], viewport: { x: 0, y: 0, zoom: 1 }, nodes: [], edges: [], highlights: [],
});
```

- [ ] **Step 4: Write `web/src/model/ids.ts` and `web/src/api/client.ts`**

```ts
// web/src/model/ids.ts
import { ulid } from "ulid";

export type IdKind = "n" | "e" | "h";

/** Client-minted, time-sortable, prefixed by kind (addendum 4.5). */
export function newId(kind: IdKind): string {
  return `${kind}-${ulid()}`;
}
```

```ts
// web/src/api/client.ts
import type { Board, PageRect, PaperSummary, Selection, Source } from "../model/types";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, { ...init, headers: { "content-type": "application/json", ...(init.headers ?? {}) } });
  if (response.status === 204) return undefined as T;
  const body = await response.json();
  if (!response.ok) {
    const error = body?.error ?? { code: "unknown", message: response.statusText };
    throw new ApiError(response.status, error.code, error.message);
  }
  return body as T;
}

export const api = {
  listPapers: () => call<PaperSummary[]>("/api/papers"),
  getSource: (id: string) => call<Source>(`/api/papers/${id}/source`),
  getBoard: (id: string) => call<Board>(`/api/papers/${id}/board`),
  pdfUrl: (id: string) => `/api/papers/${id}/pdf`,

  async putBoard(id: string, board: Board, version: number): Promise<{ version: number } | { conflict: true; current: number }> {
    const response = await fetch(`/api/papers/${id}/board`, {
      method: "PUT", headers: { "content-type": "application/json", "If-Match": String(version) }, body: JSON.stringify(board),
    });
    const body = await response.json();
    if (response.status === 409) return { conflict: true, current: body.error.current };
    if (!response.ok) throw new ApiError(response.status, body?.error?.code ?? "unknown", body?.error?.message ?? "");
    return { version: body.version };
  },

  postText: (id: string, rects: PageRect[], snap: boolean) =>
    call<Selection>(`/api/papers/${id}/text`, { method: "POST", body: JSON.stringify({ rects, snap }) }),
};
```

- [ ] **Step 5: Run the tests**

Run: `cd web && npm test`
Expected: 4 passed.

- [ ] **Step 6: Commit**

```bash
git add web/src/model/types.ts web/src/model/ids.ts web/src/model/ids.test.ts web/src/api
git commit -m "feat(web): board types mirroring the server contract, ids, api client"
```

---

### Task 3: Serialization, re-parenting, containment

**Files:**
- Create: `web/src/model/geometry.ts`, `web/src/model/serialize.ts`, `web/src/model/reparent.ts`
- Test: `web/src/model/geometry.test.ts`, `web/src/model/serialize.test.ts`, `web/src/model/reparent.test.ts`

**Interfaces:**
- Produces:
  - `containsPoint(rect: Rect, x: number, y: number): boolean`, `midpoint(rect): [number, number]`, `unionRects(rects: Rect[]): Rect`
  - `highlightsIn(highlights: Highlight[], region: ChunkAnchor): Highlight[]`, the containment rule of addendum 4.0, the same as the server's `export.highlights_in`
  - `toBoardJson(board: Board): Board`, a deep copy with runtime fields removed, `undefined` dropped, and nodes sorted parents-first, stable otherwise
  - `PERSISTED_NODE_FIELDS`, `PERSISTED_EDGE_FIELDS`
  - `toRelative(absolute: XY, parentAbsolute: XY): XY`, `toAbsolute(relative: XY, parentAbsolute: XY): XY`, `reparent(node, newParentId: string | null, nodeAbsolute: XY, parentAbsolute: XY | null): BoardNode`

These are the load-bearing tests the addendum names in section 8: React Flow mutates node objects with runtime state, and re-parenting does not convert coordinates for you.

- [ ] **Step 1: Write the failing tests**

`web/src/model/geometry.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { containsPoint, highlightsIn, midpoint, unionRects } from "./geometry";
import type { ChunkAnchor, Highlight } from "./types";

const q = { exact: "x", prefix: "", suffix: "" };
const mark = (id: string, page: number, rect: [number, number, number, number]): Highlight =>
  ({ id, tags: [], note: null, anchor: { page, rect, quote: q, position: 0, state: "anchored" } });
const region: ChunkAnchor = { rects: [{ page: 2, rect: [50, 100, 286, 400] }, { page: 3, rect: [50, 72, 286, 200] }], start: q, end: q, position: 0, state: "anchored" };

describe("geometry", () => {
  it("containsPoint is inclusive", () => {
    expect(containsPoint([0, 0, 10, 10], 10, 5)).toBe(true);
    expect(containsPoint([0, 0, 10, 10], 10.1, 5)).toBe(false);
  });
  it("midpoint and union", () => {
    expect(midpoint([0, 0, 10, 4])).toEqual([5, 2]);
    expect(unionRects([[5, 5, 6, 6], [0, 0, 1, 1]])).toEqual([0, 0, 6, 6]);
  });
  it("highlightsIn keeps marks whose midpoint lies in any rect of the region, on that page", () => {
    const inside = mark("h-in", 2, [60, 200, 200, 212]);
    const otherPage = mark("h-page", 1, [60, 200, 200, 212]);
    const secondRect = mark("h-two", 3, [60, 100, 200, 112]);
    const outside = mark("h-out", 2, [309, 200, 500, 212]);
    expect(highlightsIn([inside, otherPage, secondRect, outside], region).map((h) => h.id)).toEqual(["h-in", "h-two"]);
  });
});
```

`web/src/model/serialize.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { applyNodeChanges } from "@xyflow/react";
import { toBoardJson } from "./serialize";
import { emptyBoard, type BoardNode } from "./types";

const q = { exact: "x", prefix: "", suffix: "" };
const region = { rects: [{ page: 0, rect: [0, 0, 1, 1] as [number, number, number, number] }], start: q, end: q, position: 0, state: "anchored" as const };

const group: BoardNode = { id: "n-g", type: "group", position: { x: 0, y: 0 }, width: 500, height: 400, data: { tags: [], name: null } };
const child: BoardNode = { id: "n-c", type: "chunk", position: { x: 10, y: 10 }, parentId: "n-g", extent: "parent", width: 300,
  data: { tags: [], collapsed: false, region, text: "t", user_sized: false, source_id: null } };
const note: BoardNode = { id: "n-n", type: "note", position: { x: 700, y: 0 }, initialWidth: 280, data: { tags: [], collapsed: false, note: "notes/n-n.md" } };

describe("toBoardJson", () => {
  it("strips runtime fields React Flow adds during interaction", () => {
    let nodes: BoardNode[] = [group, child, note];
    nodes = applyNodeChanges([{ type: "select", id: "n-n", selected: true }], nodes) as BoardNode[];
    nodes = applyNodeChanges([{ type: "position", id: "n-n", position: { x: 710, y: 5 }, dragging: true }], nodes) as BoardNode[];
    nodes = applyNodeChanges([{ type: "dimensions", id: "n-n", dimensions: { width: 300, height: 120 }, resizing: true, setAttributes: true }], nodes) as BoardNode[];
    const out = toBoardJson({ ...emptyBoard("p"), nodes });
    const text = JSON.stringify(out);
    for (const field of ["selected", "dragging", "resizing", "measured", "internals"]) expect(text).not.toContain(`"${field}"`);
    const saved = out.nodes.find((n) => n.id === "n-n")!;
    expect(saved.position).toEqual({ x: 710, y: 5 });
    expect(saved.width).toBe(300);
  });

  it("orders parents before children and keeps the rest stable", () => {
    const out = toBoardJson({ ...emptyBoard("p"), nodes: [child, note, group] });
    expect(out.nodes.map((n) => n.id)).toEqual(["n-g", "n-c", "n-n"]);
  });

  it("drops undefined so a board that did not change is byte-identical", () => {
    const a = JSON.stringify(toBoardJson({ ...emptyBoard("p"), nodes: [group, child, note] }));
    const b = JSON.stringify(toBoardJson({ ...emptyBoard("p"), nodes: [{ ...group, hidden: undefined }, child, note] }));
    expect(a).toBe(b);
    expect(a).not.toContain("undefined");
  });

  it("round-trips through JSON to the same object", () => {
    const board = { ...emptyBoard("p"), nodes: [group, child, note] };
    const out = toBoardJson(board);
    expect(JSON.parse(JSON.stringify(out))).toEqual(out);
  });
});
```

`web/src/model/reparent.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { reparent, toAbsolute, toRelative } from "./reparent";
import type { BoardNode } from "./types";

const note: BoardNode = { id: "n-n", type: "note", position: { x: 700, y: 300 }, data: { tags: [], collapsed: false, note: "notes/n-n.md" } };

describe("reparent", () => {
  it("relative and absolute are inverses", () => {
    expect(toRelative({ x: 700, y: 300 }, { x: 400, y: 120 })).toEqual({ x: 300, y: 180 });
    expect(toAbsolute({ x: 300, y: 180 }, { x: 400, y: 120 })).toEqual({ x: 700, y: 300 });
  });
  it("moving into a group keeps the node visually still", () => {
    const moved = reparent(note, "n-g", { x: 700, y: 300 }, { x: 400, y: 120 });
    expect(moved.parentId).toBe("n-g");
    expect(moved.extent).toBe("parent");
    expect(moved.position).toEqual({ x: 300, y: 180 });
  });
  it("moving out of a group restores absolute coordinates", () => {
    const inside: BoardNode = { ...note, parentId: "n-g", extent: "parent", position: { x: 300, y: 180 } };
    const out = reparent(inside, null, { x: 700, y: 300 }, null);
    expect(out.parentId).toBeUndefined();
    expect(out.extent).toBeUndefined();
    expect(out.position).toEqual({ x: 700, y: 300 });
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd web && npm test`
Expected: FAIL on three unresolved modules.

- [ ] **Step 3: Write the three modules**

```ts
// web/src/model/geometry.ts
import type { ChunkAnchor, Highlight, Rect } from "./types";

export function containsPoint([x0, y0, x1, y1]: Rect, x: number, y: number): boolean {
  return x0 <= x && x <= x1 && y0 <= y && y <= y1;
}

export function midpoint([x0, y0, x1, y1]: Rect): [number, number] {
  return [(x0 + x1) / 2, (y0 + y1) / 2];
}

export function unionRects(rects: Rect[]): Rect {
  return rects.reduce((acc, r) => [Math.min(acc[0], r[0]), Math.min(acc[1], r[1]), Math.max(acc[2], r[2]), Math.max(acc[3], r[3])] as Rect);
}

/** Containment is geometry, never a stored list (addendum 4.0). Same rule as the server. */
export function highlightsIn(highlights: Highlight[], region: ChunkAnchor): Highlight[] {
  return highlights.filter((h) => {
    const [mx, my] = midpoint(h.anchor.rect);
    return region.rects.some((r) => r.page === h.anchor.page && containsPoint(r.rect, mx, my));
  });
}
```

```ts
// web/src/model/serialize.ts
import type { Board, BoardEdge, BoardNode } from "./types";

export const PERSISTED_NODE_FIELDS = ["id", "type", "position", "data", "parentId", "extent", "width", "height", "initialWidth", "initialHeight", "hidden", "zIndex"] as const;
export const PERSISTED_EDGE_FIELDS = ["id", "type", "source", "sourceHandle", "target", "targetHandle", "data"] as const;

function pick<T extends object>(obj: T, fields: readonly string[]): T {
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    const value = (obj as Record<string, unknown>)[field];
    if (value !== undefined) out[field] = value;
  }
  return out as T;
}

/** Parents first, otherwise the original order. React Flow warns and misrenders a child listed before its parent. */
export function parentsFirst(nodes: BoardNode[]): BoardNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const placed = new Set<string>();
  const out: BoardNode[] = [];
  const place = (node: BoardNode) => {
    if (placed.has(node.id)) return;
    if (node.parentId && byId.has(node.parentId)) place(byId.get(node.parentId)!);
    placed.add(node.id);
    out.push(node);
  };
  nodes.forEach(place);
  return out;
}

/** The only path to a board the server will accept. Never use React Flow's toObject(). */
export function toBoardJson(board: Board): Board {
  const nodes = parentsFirst(board.nodes).map((n) => pick(n, PERSISTED_NODE_FIELDS));
  const edges = board.edges.map((e) => pick(e, PERSISTED_EDGE_FIELDS)) as BoardEdge[];
  return JSON.parse(JSON.stringify({ ...board, nodes, edges }));
}
```

```ts
// web/src/model/reparent.ts
import type { BoardNode } from "./types";

export type XY = { x: number; y: number };

export const toRelative = (absolute: XY, parentAbsolute: XY): XY => ({ x: absolute.x - parentAbsolute.x, y: absolute.y - parentAbsolute.y });
export const toAbsolute = (relative: XY, parentAbsolute: XY): XY => ({ x: relative.x + parentAbsolute.x, y: relative.y + parentAbsolute.y });

/** Change a node's parent without moving it on screen. React Flow does not convert for you (addendum 4.2). */
export function reparent(node: BoardNode, newParentId: string | null, nodeAbsolute: XY, parentAbsolute: XY | null): BoardNode {
  if (newParentId === null || parentAbsolute === null) {
    const { parentId: _p, extent: _e, ...rest } = node;
    return { ...rest, position: { ...nodeAbsolute } } as BoardNode;
  }
  return { ...node, parentId: newParentId, extent: "parent", position: toRelative(nodeAbsolute, parentAbsolute) } as BoardNode;
}
```

- [ ] **Step 4: Run the tests**

Run: `cd web && npm test`
Expected: all pass. If the serialize test's `applyNodeChanges` call complains about the change shapes, read the `NodeChange` type in `node_modules/@xyflow/system/dist/esm/types/changes.d.ts` and match it; the point of the test is that real change objects dirty the nodes.

- [ ] **Step 5: Commit**

```bash
git add web/src/model
git commit -m "feat(web): serialization, re-parenting and containment rules with tests"
```

---

### Task 4: Selection geometry and the paper view

**Files:**
- Create: `web/src/paper/selection.ts`, `web/src/paper/PageOverlay.tsx`, `web/src/paper/PaperView.tsx`, `web/src/styles.css`
- Modify: `web/src/App.tsx`, `web/src/main.tsx`
- Test: `web/src/paper/selection.test.ts`

**Interfaces:**
- Consumes: `api.getSource`, `api.pdfUrl`, `types.Source | Board | PageRect`.
- Produces:
  - `type LineRect = { left: number; top: number; right: number; bottom: number }`
  - `type PageFrame = { page: number; box: LineRect; widthPt: number }`
  - `selectionToPageRects(lines: LineRect[], frames: PageFrame[]): PageRect[]` — pure; one merged rect per page, in page order
  - `readSelection(container: HTMLElement, source: Source): PageRect[] | null` — wraps the DOM
  - `<PaperView paperId source board focus onSelect />` renders every page at a fixed width with overlays; `focus` scrolls to a `PageRect`.
  - `<PageOverlay page scale board onOutlineClick />`

The paper view is the PDF as printed (SPEC.md section 4). This task draws it and paints what the board already holds. Task 5 adds the gestures.

- [ ] **Step 1: Write the failing test**

`web/src/paper/selection.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { selectionToPageRects } from "./selection";

const frames = [
  { page: 2, box: { left: 100, top: 1000, right: 800, bottom: 1906 }, widthPt: 612 },   // scale 700/612
  { page: 3, box: { left: 100, top: 1920, right: 800, bottom: 2826 }, widthPt: 612 },
];
const scale = 700 / 612;

describe("selectionToPageRects", () => {
  it("converts line rects to points relative to the page, top-left origin", () => {
    const lines = [{ left: 100 + 50 * scale, top: 1000 + 130 * scale, right: 100 + 156 * scale, bottom: 1000 + 139 * scale }];
    const [rect] = selectionToPageRects(lines, frames);
    expect(rect.page).toBe(2);
    expect(rect.rect.map((v) => Math.round(v))).toEqual([50, 130, 156, 139]);
  });

  it("merges the lines of one page into one rectangle and splits across pages", () => {
    const lines = [
      { left: 160, top: 1500, right: 400, bottom: 1512 },
      { left: 150, top: 1514, right: 420, bottom: 1526 },
      { left: 150, top: 2000, right: 300, bottom: 2012 },
    ];
    const rects = selectionToPageRects(lines, frames);
    expect(rects.map((r) => r.page)).toEqual([2, 3]);
    const [x0, y0, x1, y1] = rects[0].rect;
    expect(x0).toBeCloseTo((150 - 100) / scale, 3);
    expect(x1).toBeCloseTo((420 - 100) / scale, 3);
    expect(y0).toBeCloseTo((1500 - 1000) / scale, 3);
    expect(y1).toBeCloseTo((1526 - 1000) / scale, 3);
  });

  it("ignores zero-height line rects browsers emit at range ends", () => {
    const lines = [{ left: 160, top: 1500, right: 400, bottom: 1512 }, { left: 400, top: 1512, right: 400, bottom: 1512 }];
    expect(selectionToPageRects(lines, frames)).toHaveLength(1);
  });

  it("returns nothing when no line lies on a page", () => {
    expect(selectionToPageRects([{ left: 0, top: 0, right: 10, bottom: 10 }], frames)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd web && npm test -- selection`
Expected: FAIL, cannot resolve `./selection`.

- [ ] **Step 3: Write `web/src/paper/selection.ts`**

```ts
import type { PageRect, Rect, Source } from "../model/types";

export type LineRect = { left: number; top: number; right: number; bottom: number };
export type PageFrame = { page: number; box: LineRect; widthPt: number };

const MIN_LINE_PX = 1;

/** CSS pixels to PyMuPDF points: subtract the page's screen origin, divide by scale.
 *  The page element is rendered at widthPx = widthPt * scale, so scale = box.width / widthPt.
 *  Origin is the page's top-left, so no flip. This is the one place the conversion lives. */
export function selectionToPageRects(lines: LineRect[], frames: PageFrame[]): PageRect[] {
  const byPage = new Map<number, Rect>();
  for (const line of lines) {
    if (line.bottom - line.top < MIN_LINE_PX || line.right - line.left < MIN_LINE_PX) continue;
    const cy = (line.top + line.bottom) / 2;
    const frame = frames.find((f) => f.box.top <= cy && cy <= f.box.bottom);
    if (!frame) continue;
    const scale = (frame.box.right - frame.box.left) / frame.widthPt;
    const rect: Rect = [
      (line.left - frame.box.left) / scale, (line.top - frame.box.top) / scale,
      (line.right - frame.box.left) / scale, (line.bottom - frame.box.top) / scale,
    ];
    const prev = byPage.get(frame.page);
    byPage.set(frame.page, prev
      ? [Math.min(prev[0], rect[0]), Math.min(prev[1], rect[1]), Math.max(prev[2], rect[2]), Math.max(prev[3], rect[3])]
      : rect);
  }
  return [...byPage.entries()].sort((a, b) => a[0] - b[0]).map(([page, rect]) => ({ page, rect }));
}

export function pageFrames(container: HTMLElement, source: Source): PageFrame[] {
  return Array.from(container.querySelectorAll<HTMLElement>(".react-pdf__Page")).map((el) => {
    const page = Number(el.dataset.pageNumber) - 1;   // react-pdf numbers pages from 1
    const box = el.getBoundingClientRect();
    return { page, box: { left: box.left, top: box.top, right: box.right, bottom: box.bottom }, widthPt: source.pages[page].width };
  });
}

/** The current DOM selection as page rects, or null if there is none inside `container`. */
export function readSelection(container: HTMLElement, source: Source): PageRect[] | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!container.contains(range.commonAncestorContainer)) return null;
  const lines = Array.from(range.getClientRects()).map((r) => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom }));
  const rects = selectionToPageRects(lines, pageFrames(container, source));
  return rects.length ? rects : null;
}
```

- [ ] **Step 4: Run the selection tests**

Run: `cd web && npm test -- selection`
Expected: 4 passed.

- [ ] **Step 5: Write the overlay and the paper view**

```tsx
// web/src/paper/PageOverlay.tsx
import type { Board, ChunkNode, FigureNode, Rect } from "../model/types";

type Props = { page: number; scale: number; board: Board; onOutlineClick: (nodeId: string) => void };

const px = (rect: Rect, scale: number) => ({
  left: rect[0] * scale, top: rect[1] * scale, width: (rect[2] - rect[0]) * scale, height: (rect[3] - rect[1]) * scale,
});

/** Marks and outlines for one page, drawn over the text layer. Pointer events stay off
 *  so the reader can still select text underneath; outlines take clicks on their border only. */
export function PageOverlay({ page, scale, board, onOutlineClick }: Props) {
  const chunks = board.nodes.filter((n): n is ChunkNode | FigureNode => n.type === "chunk" || n.type === "figure");
  return (
    <div className="overlay">
      {chunks.flatMap((node) => node.data.region.rects.filter((r) => r.page === page).map((r, i) => (
        <div key={`${node.id}-${i}`} className={`outline ${node.data.region.state}`} style={px(r.rect, scale)}
             title={node.data.region.start.exact.slice(0, 60)} onClick={() => onOutlineClick(node.id)} />
      )))}
      {board.highlights.filter((h) => h.anchor.page === page).map((h) => (
        <div key={h.id} className={`mark ${h.anchor.state}`} style={px(h.anchor.rect, scale)} title={h.anchor.quote.exact.slice(0, 80)} />
      ))}
    </div>
  );
}
```

```tsx
// web/src/paper/PaperView.tsx
import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";
import { api } from "../api/client";
import type { Board, PageRect, Source } from "../model/types";
import { PageOverlay } from "./PageOverlay";
import { readSelection } from "./selection";

pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

export const PAGE_WIDTH_PX = 760;

type Props = {
  paperId: string;
  source: Source;
  board: Board;
  focus: PageRect | null;                       // scroll here when it changes
  onSelect: (rects: PageRect[], anchorEl: DOMRect, exact: boolean) => void;
  onOutlineClick: (nodeId: string) => void;
};

export function PaperView({ paperId, source, board, focus, onSelect, onOutlineClick }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!focus || !container.current || !ready) return;
    const el = container.current.querySelector<HTMLElement>(`.react-pdf__Page[data-page-number="${focus.page + 1}"]`);
    if (!el) return;
    const scale = el.clientWidth / source.pages[focus.page].width;
    el.scrollIntoView({ block: "start" });
    container.current.scrollBy({ top: focus.rect[1] * scale - 80 });
  }, [focus, ready, source]);

  const onMouseUp = (event: React.MouseEvent) => {
    if (!container.current) return;
    const rects = readSelection(container.current, source);
    if (!rects) return;
    const range = window.getSelection()!.getRangeAt(0);
    const lines = range.getClientRects();
    onSelect(rects, lines[lines.length - 1], event.altKey);
  };

  return (
    <div ref={container} className="paper" onMouseUp={onMouseUp}>
      <Document file={api.pdfUrl(paperId)} onLoadSuccess={() => setReady(true)} loading={<p>Loading paper</p>}>
        {source.pages.map((p) => (
          <div key={p.index} className="page-wrap">
            <Page pageIndex={p.index} width={PAGE_WIDTH_PX} renderAnnotationLayer={false} renderTextLayer />
            <PageOverlay page={p.index} scale={PAGE_WIDTH_PX / p.width} board={board} onOutlineClick={onOutlineClick} />
          </div>
        ))}
      </Document>
    </div>
  );
}
```

`web/src/styles.css`, the parts this task needs:

```css
:root { --hl: rgba(255, 228, 92, 0.55); --outline: #1d4ed8; --ink: #1c2128; }
body { margin: 0; font-family: system-ui, sans-serif; color: var(--ink); }
.app { display: grid; grid-template-rows: 40px 1fr; height: 100vh; }
.topbar { display: flex; gap: 12px; align-items: center; padding: 0 12px; border-bottom: 1px solid #ddd; }
.paper { overflow: auto; height: 100%; background: #e9e9e6; padding: 16px 0; }
.page-wrap { position: relative; width: 760px; margin: 0 auto 16px; box-shadow: 0 1px 4px rgba(0,0,0,.2); }
.overlay { position: absolute; inset: 0; pointer-events: none; }
.overlay .mark { position: absolute; background: var(--hl); mix-blend-mode: multiply; }
.overlay .mark.relocated { outline: 1px dashed #a16207; }
.overlay .mark.orphaned { background: rgba(185, 28, 28, 0.25); }
.overlay .outline { position: absolute; border: 1.5px dashed var(--outline); pointer-events: auto; background: transparent; cursor: pointer; }
.overlay .outline.orphaned { border-color: #b91c1c; }
```

`web/src/App.tsx`, this task's version: a paper picker, the source and board loaded, the paper view shown. `onSelect` logs the rects for now; Task 5 wires it.

```tsx
import { useEffect, useState } from "react";
import { api } from "./api/client";
import { PaperView } from "./paper/PaperView";
import type { Board, PageRect, PaperSummary, Source } from "./model/types";
import "./styles.css";

export default function App() {
  const [papers, setPapers] = useState<PaperSummary[]>([]);
  const [paperId, setPaperId] = useState<string | null>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [board, setBoard] = useState<Board | null>(null);
  const [focus, setFocus] = useState<PageRect | null>(null);

  useEffect(() => { api.listPapers().then(setPapers); }, []);
  useEffect(() => {
    if (!paperId) return;
    Promise.all([api.getSource(paperId), api.getBoard(paperId)]).then(([s, b]) => { setSource(s); setBoard(b); });
  }, [paperId]);

  return (
    <div className="app">
      <div className="topbar">
        <select value={paperId ?? ""} onChange={(e) => setPaperId(e.target.value || null)}>
          <option value="">Choose a paper</option>
          {papers.map((p) => <option key={p.paper_id} value={p.paper_id}>{p.title}</option>)}
        </select>
      </div>
      {paperId && source && board && (
        <PaperView paperId={paperId} source={source} board={board} focus={focus}
                   onSelect={(rects, _box, exact) => console.log("selected", rects, "exact", exact)}
                   onOutlineClick={(id) => console.log("outline", id)} />
      )}
    </div>
  );
}
```

`web/src/main.tsx`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
```

- [ ] **Step 6: Run it against the real server and look**

```bash
# terminal 1, repo root, with the API plan merged and a data folder holding resnet
.venv/bin/paperboard extract tests/fixtures/papers/resnet.pdf --out /tmp/pb-data/papers
.venv/bin/paperboard serve --root /tmp/pb-data
# terminal 2
cd web && npm run dev
```

Open the dev URL, pick the paper, select the heading "3.1. Residual Learning" on page 3, and read the console: the logged rect must be within 3 points of `[50, 130, 156, 139]` on page 2, the same check the spike made, now through the real code path. Then hand-edit `/tmp/pb-data/papers/<id>/board.json` to add one highlight with that rect and reload: a yellow mark must sit exactly on the heading.

- [ ] **Step 7: Commit**

```bash
git add web/src/paper web/src/App.tsx web/src/main.tsx web/src/styles.css
git commit -m "feat(web): paper view with selection geometry and overlays"
```

---

### Task 5: Highlight and cut, board state, persistence

**Files:**
- Create: `web/src/model/boardReducer.ts`, `web/src/state/persistence.ts`, `web/src/state/BoardProvider.tsx`, `web/src/paper/SelectionPopover.tsx`, `web/src/board/layout.ts`
- Modify: `web/src/App.tsx`
- Test: `web/src/model/boardReducer.test.ts`, `web/src/state/persistence.test.ts`, `web/src/board/layout.test.ts`

**Interfaces:**
- Produces:
  - `BoardAction` union: `{ type: "load"; board }`, `{ type: "nodes"; changes: NodeChange[] }`, `{ type: "edges"; changes: EdgeChange[] }`, `{ type: "addHighlight"; highlight }`, `{ type: "addNode"; node }`, `{ type: "replaceNode"; node }`, `{ type: "removeNode"; id }`, `{ type: "viewport"; viewport }`, `{ type: "saved"; version }`
  - `boardReducer(state: BoardState, action: BoardAction): BoardState` with `BoardState = { board: Board; dirty: boolean }`
  - `createPersistence(opts: { save: (board: Board, version: number) => Promise<...>; reload: () => Promise<Board>; onConflict: (msg: string) => void; delayMs?: number })` returning `{ schedule(board: Board): void; flush(): Promise<void>; dispose(): void }`
  - `<BoardProvider paperId>` with `useBoard(): { state, dispatch, source }`
  - `nextChunkPosition(nodes: BoardNode[]): XY` — the next free spot in a column on the right of the board
  - `<SelectionPopover at onHighlight onCut onDismiss />`

The gesture from SPEC.md section 4: select, then choose highlight or cut, in a popover, no modes. Alt held at mouse-up means exact selection, no snap.

- [ ] **Step 1: Write the failing tests**

`web/src/model/boardReducer.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { boardReducer, initialBoardState } from "./boardReducer";
import { emptyBoard, type BoardNode, type Highlight } from "./types";

const q = { exact: "x", prefix: "", suffix: "" };
const highlight: Highlight = { id: "h-1", tags: [], note: null, anchor: { page: 0, rect: [0, 0, 1, 1], quote: q, position: 0, state: "anchored" } };
const note: BoardNode = { id: "n-1", type: "note", position: { x: 0, y: 0 }, data: { tags: [], collapsed: false, note: "notes/n-1.md" } };

describe("boardReducer", () => {
  it("load replaces the board and is clean", () => {
    const s = boardReducer(initialBoardState, { type: "load", board: { ...emptyBoard("p"), version: 3 } });
    expect(s.board.version).toBe(3);
    expect(s.dirty).toBe(false);
  });
  it("adding a highlight or node marks dirty", () => {
    let s = boardReducer(initialBoardState, { type: "load", board: emptyBoard("p") });
    s = boardReducer(s, { type: "addHighlight", highlight });
    s = boardReducer(s, { type: "addNode", node: note });
    expect(s.board.highlights).toHaveLength(1);
    expect(s.board.nodes).toHaveLength(1);
    expect(s.dirty).toBe(true);
  });
  it("a position change marks dirty but a select change does not", () => {
    let s = boardReducer(initialBoardState, { type: "load", board: { ...emptyBoard("p"), nodes: [note] } });
    s = boardReducer(s, { type: "nodes", changes: [{ type: "select", id: "n-1", selected: true }] });
    expect(s.dirty).toBe(false);
    s = boardReducer(s, { type: "nodes", changes: [{ type: "position", id: "n-1", position: { x: 5, y: 5 } }] });
    expect(s.dirty).toBe(true);
    expect(s.board.nodes[0].position).toEqual({ x: 5, y: 5 });
  });
  it("saved records the version and clears dirty", () => {
    let s = boardReducer(initialBoardState, { type: "load", board: emptyBoard("p") });
    s = boardReducer(s, { type: "addHighlight", highlight });
    s = boardReducer(s, { type: "saved", version: 1 });
    expect(s.board.version).toBe(1);
    expect(s.dirty).toBe(false);
  });
  it("removeNode drops the node and its edges", () => {
    const board = { ...emptyBoard("p"), nodes: [note, { ...note, id: "n-2" }], edges: [{ id: "e-1", source: "n-1", target: "n-2", data: { tags: [] } }] };
    let s = boardReducer(initialBoardState, { type: "load", board });
    s = boardReducer(s, { type: "removeNode", id: "n-2" });
    expect(s.board.nodes.map((n) => n.id)).toEqual(["n-1"]);
    expect(s.board.edges).toEqual([]);
  });
});
```

`web/src/state/persistence.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { createPersistence } from "./persistence";
import { emptyBoard } from "../model/types";

describe("createPersistence", () => {
  it("saves once after the delay with the latest board and the current version", async () => {
    vi.useFakeTimers();
    const save = vi.fn(async () => ({ version: 2 }));
    const saved: number[] = [];
    const p = createPersistence({ save, reload: async () => emptyBoard("p"), onConflict: () => {}, onSaved: (v) => saved.push(v), delayMs: 500 });
    p.schedule({ ...emptyBoard("p"), version: 1, goal: "a" });
    p.schedule({ ...emptyBoard("p"), version: 1, goal: "b" });
    await vi.advanceTimersByTimeAsync(499);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0].goal).toBe("b");
    expect(save.mock.calls[0][1]).toBe(1);
    expect(saved).toEqual([2]);
    vi.useRealTimers();
  });

  it("on conflict reloads, reports, and does not retry the stale board", async () => {
    vi.useFakeTimers();
    const fresh = { ...emptyBoard("p"), version: 9, goal: "theirs" };
    const save = vi.fn(async () => ({ conflict: true as const, current: 9 }));
    const reload = vi.fn(async () => fresh);
    const onConflict = vi.fn();
    const onReload = vi.fn();
    const p = createPersistence({ save, reload, onConflict, onReload, onSaved: () => {}, delayMs: 10 });
    p.schedule({ ...emptyBoard("p"), version: 1, goal: "mine" });
    await vi.advanceTimersByTimeAsync(20);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(onReload).toHaveBeenCalledWith(fresh);
    expect(onConflict).toHaveBeenCalledWith(expect.stringContaining("another"));
    await vi.advanceTimersByTimeAsync(100);
    expect(save).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("flush saves immediately", async () => {
    const save = vi.fn(async () => ({ version: 1 }));
    const p = createPersistence({ save, reload: async () => emptyBoard("p"), onConflict: () => {}, onSaved: () => {}, delayMs: 10_000 });
    p.schedule(emptyBoard("p"));
    await p.flush();
    expect(save).toHaveBeenCalledTimes(1);
  });
});
```

`web/src/board/layout.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { nextChunkPosition } from "./layout";
import type { BoardNode } from "../model/types";

const q = { exact: "x", prefix: "", suffix: "" };
const chunk = (id: string, y: number, height = 120): BoardNode => ({
  id, type: "chunk", position: { x: 40, y }, width: 320, height,
  data: { tags: [], collapsed: false, region: { rects: [{ page: 0, rect: [0, 0, 1, 1] }], start: q, end: q, position: 0, state: "anchored" }, text: "", user_sized: false, source_id: null },
});

describe("nextChunkPosition", () => {
  it("starts at the top-left of an empty board", () => {
    expect(nextChunkPosition([])).toEqual({ x: 40, y: 40 });
  });
  it("stacks below the lowest top-level node with a gap", () => {
    expect(nextChunkPosition([chunk("n-1", 40), chunk("n-2", 200, 90)])).toEqual({ x: 40, y: 200 + 90 + 24 });
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd web && npm test`
Expected: FAIL on three unresolved modules.

- [ ] **Step 3: Write the reducer, persistence, and layout**

```ts
// web/src/model/boardReducer.ts
import { applyEdgeChanges, applyNodeChanges, type EdgeChange, type NodeChange } from "@xyflow/react";
import { emptyBoard, type Board, type BoardEdge, type BoardNode, type Highlight, type Viewport } from "./types";

export type BoardState = { board: Board; dirty: boolean };
export const initialBoardState: BoardState = { board: emptyBoard(""), dirty: false };

export type BoardAction =
  | { type: "load"; board: Board }
  | { type: "nodes"; changes: NodeChange<BoardNode>[] }
  | { type: "edges"; changes: EdgeChange<BoardEdge>[] }
  | { type: "addHighlight"; highlight: Highlight }
  | { type: "addNode"; node: BoardNode }
  | { type: "replaceNode"; node: BoardNode }
  | { type: "removeNode"; id: string }
  | { type: "viewport"; viewport: Viewport }
  | { type: "saved"; version: number };

/** Selection changes are runtime-only; everything else the reader did must be saved. */
const DIRTYING_NODE_CHANGES = new Set(["position", "dimensions", "remove", "add", "replace"]);

export function boardReducer(state: BoardState, action: BoardAction): BoardState {
  const { board } = state;
  switch (action.type) {
    case "load":
      return { board: action.board, dirty: false };
    case "nodes": {
      const nodes = applyNodeChanges(action.changes, board.nodes) as BoardNode[];
      const dirty = state.dirty || action.changes.some((c) => DIRTYING_NODE_CHANGES.has(c.type) && !("dragging" in c && c.dragging));
      return { board: { ...board, nodes }, dirty };
    }
    case "edges": {
      const edges = applyEdgeChanges(action.changes, board.edges) as BoardEdge[];
      const dirty = state.dirty || action.changes.some((c) => c.type !== "select");
      return { board: { ...board, edges }, dirty };
    }
    case "addHighlight":
      return { board: { ...board, highlights: [...board.highlights, action.highlight] }, dirty: true };
    case "addNode":
      return { board: { ...board, nodes: [...board.nodes, action.node] }, dirty: true };
    case "replaceNode":
      return { board: { ...board, nodes: board.nodes.map((n) => (n.id === action.node.id ? action.node : n)) }, dirty: true };
    case "removeNode":
      return {
        board: {
          ...board,
          nodes: board.nodes.filter((n) => n.id !== action.id && n.parentId !== action.id),
          edges: board.edges.filter((e) => e.source !== action.id && e.target !== action.id),
        },
        dirty: true,
      };
    case "viewport":
      return { board: { ...board, viewport: action.viewport }, dirty: state.dirty };
    case "saved":
      return { board: { ...board, version: action.version }, dirty: false };
  }
}
```

The `dragging` guard in the `nodes` case keeps the save off the drag path: React Flow emits position changes with `dragging: true` throughout a drag and one final change with `dragging: false`. Only the last one dirties the board. Viewport changes never dirty it on their own; they are saved along with the next real change.

```ts
// web/src/state/persistence.ts
import { toBoardJson } from "../model/serialize";
import type { Board } from "../model/types";

type SaveResult = { version: number } | { conflict: true; current: number };

export type PersistenceOptions = {
  save: (board: Board, version: number) => Promise<SaveResult>;
  reload: () => Promise<Board>;
  onSaved: (version: number) => void;
  onReload?: (board: Board) => void;
  onConflict: (message: string) => void;
  delayMs?: number;
};

export const SAVE_DELAY_MS = 500;
export const CONFLICT_MESSAGE = "This board was changed in another window. Reloaded it; your last change was not saved.";

/** Debounced, versioned saves. The latest board wins the debounce; a 409 reloads and stops. */
export function createPersistence(opts: PersistenceOptions) {
  const delay = opts.delayMs ?? SAVE_DELAY_MS;
  let pending: Board | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight: Promise<void> | null = null;

  const run = async () => {
    if (!pending) return;
    const board = pending;
    pending = null;
    const result = await opts.save(toBoardJson(board), board.version);
    if ("conflict" in result) {
      pending = null;
      const fresh = await opts.reload();
      opts.onReload?.(fresh);
      opts.onConflict(CONFLICT_MESSAGE);
      return;
    }
    opts.onSaved(result.version);
  };

  const fire = () => {
    timer = null;
    inFlight = run().finally(() => { inFlight = null; if (pending) schedule(pending); });
  };

  const schedule = (board: Board) => {
    pending = board;
    if (timer) clearTimeout(timer);
    timer = setTimeout(fire, delay);
  };

  const flush = async () => {
    if (timer) { clearTimeout(timer); timer = null; }
    if (inFlight) await inFlight;
    await run();
  };

  const dispose = () => { if (timer) clearTimeout(timer); pending = null; };

  return { schedule, flush, dispose };
}
```

```ts
// web/src/board/layout.ts
import type { BoardNode } from "../model/types";

export const MARGIN = 40;
export const GAP = 24;
export const CHUNK_WIDTH = 320;
export const DEFAULT_CHUNK_HEIGHT = 120;

/** A new chunk lands in a column on the left, under the lowest top-level node. The
 *  tool never rearranges anything after that (SPEC.md section 4). */
export function nextChunkPosition(nodes: BoardNode[]): { x: number; y: number } {
  const topLevel = nodes.filter((n) => !n.parentId);
  if (!topLevel.length) return { x: MARGIN, y: MARGIN };
  const bottom = Math.max(...topLevel.map((n) => n.position.y + (n.height ?? n.initialHeight ?? DEFAULT_CHUNK_HEIGHT)));
  return { x: MARGIN, y: bottom + GAP };
}
```

- [ ] **Step 4: Run the tests**

Run: `cd web && npm test`
Expected: all pass.

- [ ] **Step 5: The provider, the popover, and the wiring**

```tsx
// web/src/state/BoardProvider.tsx
import { createContext, useContext, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { api } from "../api/client";
import { boardReducer, initialBoardState, type BoardAction, type BoardState } from "../model/boardReducer";
import type { Source } from "../model/types";
import { createPersistence } from "./persistence";

type Ctx = { state: BoardState; dispatch: React.Dispatch<BoardAction>; source: Source; notice: string | null; paperId: string };
const BoardContext = createContext<Ctx | null>(null);

export function BoardProvider({ paperId, children }: { paperId: string; children: React.ReactNode }) {
  const [state, dispatch] = useReducer(boardReducer, initialBoardState);
  const [source, setSource] = useState<Source | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const persistence = useRef<ReturnType<typeof createPersistence> | null>(null);

  useEffect(() => {
    let live = true;
    Promise.all([api.getSource(paperId), api.getBoard(paperId)]).then(([s, b]) => {
      if (!live) return;
      setSource(s);
      dispatch({ type: "load", board: b });
    });
    persistence.current = createPersistence({
      save: (board, version) => api.putBoard(paperId, board, version),
      reload: () => api.getBoard(paperId),
      onSaved: (version) => dispatch({ type: "saved", version }),
      onReload: (board) => dispatch({ type: "load", board }),
      onConflict: setNotice,
    });
    const flushOnLeave = () => persistence.current?.flush();
    window.addEventListener("beforeunload", flushOnLeave);
    return () => { live = false; window.removeEventListener("beforeunload", flushOnLeave); persistence.current?.dispose(); };
  }, [paperId]);

  useEffect(() => {
    if (state.dirty) persistence.current?.schedule(state.board);
  }, [state]);

  const value = useMemo(() => (source ? { state, dispatch, source, notice, paperId } : null), [state, source, notice, paperId]);
  if (!value) return <p className="loading">Loading</p>;
  return <BoardContext.Provider value={value}>{children}</BoardContext.Provider>;
}

export function useBoard(): Ctx {
  const ctx = useContext(BoardContext);
  if (!ctx) throw new Error("useBoard outside BoardProvider");
  return ctx;
}
```

```tsx
// web/src/paper/SelectionPopover.tsx
type Props = { at: DOMRect; busy: boolean; onHighlight: () => void; onCut: () => void; onDismiss: () => void };

/** One selection, then a choice. No modes (SPEC.md section 4). */
export function SelectionPopover({ at, busy, onHighlight, onCut, onDismiss }: Props) {
  return (
    <div className="popover" style={{ left: at.right + 8, top: at.bottom + 4 }} onMouseDown={(e) => e.stopPropagation()}>
      <button disabled={busy} onClick={onHighlight}>Highlight</button>
      <button disabled={busy} onClick={onCut}>Cut</button>
      <button className="quiet" onClick={onDismiss}>×</button>
    </div>
  );
}
```

`web/src/App.tsx` becomes the shell, and a new `web/src/PaperScreen.tsx` holds the gesture logic:

```tsx
// web/src/PaperScreen.tsx
import { useState } from "react";
import { api } from "./api/client";
import { newId } from "./model/ids";
import type { ChunkNode, PageRect } from "./model/types";
import { PaperView } from "./paper/PaperView";
import { SelectionPopover } from "./paper/SelectionPopover";
import { nextChunkPosition, CHUNK_WIDTH } from "./board/layout";
import { useBoard } from "./state/BoardProvider";

type Pending = { rects: PageRect[]; at: DOMRect; exact: boolean };

export function PaperScreen({ focus, onOpenOnBoard }: { focus: PageRect | null; onOpenOnBoard: (nodeId: string) => void }) {
  const { state, dispatch, source, paperId } = useBoard();
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);

  const choose = async (kind: "highlight" | "cut") => {
    if (!pending) return;
    setBusy(true);
    try {
      const selection = await api.postText(paperId, pending.rects, !pending.exact);
      if (kind === "highlight" && selection.highlight) {
        dispatch({ type: "addHighlight", highlight: { id: newId("h"), tags: [], note: null, anchor: selection.highlight } });
      } else {
        const node: ChunkNode = {
          id: newId("n"), type: "chunk", position: nextChunkPosition(state.board.nodes), initialWidth: CHUNK_WIDTH,
          data: { tags: [], collapsed: false, region: selection.chunk, text: selection.text, user_sized: false, source_id: null },
        };
        dispatch({ type: "addNode", node });
      }
    } finally {
      setBusy(false);
      setPending(null);
      window.getSelection()?.removeAllRanges();
    }
  };

  return (
    <>
      <PaperView paperId={paperId} source={source} board={state.board} focus={focus}
                 onSelect={(rects, at, exact) => setPending({ rects, at, exact })}
                 onOutlineClick={onOpenOnBoard} />
      {pending && <SelectionPopover at={pending.at} busy={busy} onHighlight={() => choose("highlight")} onCut={() => choose("cut")} onDismiss={() => setPending(null)} />}
    </>
  );
}
```

A highlight request whose selection spans pages comes back with `highlight: null`; the code above falls through to a cut, which is the only thing a multi-page selection can be. Say so in the popover later if it proves confusing; for now it is the simplest honest behaviour.

`web/src/App.tsx`:

```tsx
import { useEffect, useState } from "react";
import { api } from "./api/client";
import { PaperScreen } from "./PaperScreen";
import { BoardProvider, useBoard } from "./state/BoardProvider";
import type { PageRect, PaperSummary } from "./model/types";
import "./styles.css";

function Notice() {
  const { notice, state } = useBoard();
  return <span className="notice">{notice ?? (state.dirty ? "Unsaved" : `Saved v${state.board.version}`)}</span>;
}

export default function App() {
  const [papers, setPapers] = useState<PaperSummary[]>([]);
  const [paperId, setPaperId] = useState<string | null>(null);
  const [focus, setFocus] = useState<PageRect | null>(null);
  useEffect(() => { api.listPapers().then(setPapers); }, []);

  return (
    <div className="app">
      {paperId ? (
        <BoardProvider paperId={paperId}>
          <div className="topbar">
            <select value={paperId} onChange={(e) => setPaperId(e.target.value || null)}>
              {papers.map((p) => <option key={p.paper_id} value={p.paper_id}>{p.title}</option>)}
            </select>
            <Notice />
          </div>
          <PaperScreen focus={focus} onOpenOnBoard={(id) => console.log("open on board", id)} />
        </BoardProvider>
      ) : (
        <div className="topbar">
          <select value="" onChange={(e) => setPaperId(e.target.value || null)}>
            <option value="">Choose a paper</option>
            {papers.map((p) => <option key={p.paper_id} value={p.paper_id}>{p.title}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}
```

Add to `styles.css`:

```css
.popover { position: fixed; display: flex; gap: 4px; padding: 4px; background: #fff; border: 1px solid #bbb; border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,.2); z-index: 10; }
.popover button { font: inherit; padding: 4px 10px; }
.popover .quiet { border: 0; background: none; }
.notice { margin-left: auto; font-size: 13px; color: #555; }
```

- [ ] **Step 6: Run it and check the round trip**

With the server up: select a sentence, click Highlight. A yellow mark appears in place. Watch the Notice go "Unsaved" then "Saved v1". Select a paragraph roughly, click Cut: a dashed outline snaps to the paragraph. Reload the page: mark and outline are still there. Open a second tab, move nothing, then in the first tab make a highlight; in the second tab make another: the second tab must show the conflict notice and the first tab's highlight, and must not have written its own.

- [ ] **Step 7: Commit**

```bash
git add web/src
git commit -m "feat(web): highlight and cut from the paper view, board state, debounced versioned saves"
```

---

### Task 6: The board view, switching, and jumping

**Files:**
- Create: `web/src/board/BoardView.tsx`, `web/src/board/nodes/ChunkNode.tsx`, `web/src/board/nodes/FigureNode.tsx`, `web/src/board/nodes/NoteNode.tsx`, `web/src/board/nodes/GroupNode.tsx`, `web/src/board/marks.ts`
- Modify: `web/src/App.tsx`, `web/src/styles.css`
- Test: `web/src/board/marks.test.ts`

**Interfaces:**
- Produces:
  - `paintMarks(text: string, marks: Highlight[]): Array<{ text: string; highlightId: string | null }>` — splits a chunk's text into runs so each contained highlight is wrapped in a `<mark>`, matched with whitespace ignored, the same rule the server uses for quotes
  - `<BoardView onOpenInPaper(rect: PageRect) />` — React Flow with the four node types, resize, drag, drop-into-group re-parenting, delete
  - `App` gains `view: "paper" | "board"`, a switch button, `focusRect` for paper and `focusNode` for board

- [ ] **Step 1: Write the failing test**

`web/src/board/marks.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { paintMarks } from "./marks";
import type { Highlight } from "../model/types";

const mark = (id: string, exact: string): Highlight =>
  ({ id, tags: [], note: null, anchor: { page: 0, rect: [0, 0, 1, 1], quote: { exact, prefix: "", suffix: "" }, position: 0, state: "anchored" } });

describe("paintMarks", () => {
  it("wraps each quote where it occurs, ignoring whitespace differences", () => {
    const text = "Let us consider H(x) as an\nunderlying mapping to be fit.";
    const runs = paintMarks(text, [mark("h-1", "consider H(x) as an underlying")]);
    expect(runs.map((r) => r.highlightId)).toEqual([null, "h-1", null]);
    expect(runs[1].text).toBe("consider H(x) as an\nunderlying");
  });
  it("leaves the text whole when a quote is not found", () => {
    const runs = paintMarks("plain text", [mark("h-1", "absent")]);
    expect(runs).toEqual([{ text: "plain text", highlightId: null }]);
  });
  it("handles two marks in order", () => {
    const runs = paintMarks("one two three four", [mark("h-b", "four"), mark("h-a", "two")]);
    expect(runs.map((r) => r.highlightId)).toEqual([null, "h-a", null, "h-b"]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd web && npm test -- marks`
Expected: FAIL, cannot resolve `./marks`.

- [ ] **Step 3: Write `web/src/board/marks.ts`**

```ts
import type { Highlight } from "../model/types";

export type Run = { text: string; highlightId: string | null };

function stripped(text: string): { s: string; offsets: number[] } {
  const chars: string[] = [];
  const offsets: number[] = [];
  for (let i = 0; i < text.length; i++) {
    if (!/\s/.test(text[i])) { chars.push(text[i]); offsets.push(i); }
  }
  return { s: chars.join(""), offsets };
}

/** Split a chunk's text into runs so each highlight inside it can be drawn as a <mark>. */
export function paintMarks(text: string, marks: Highlight[]): Run[] {
  const { s, offsets } = stripped(text);
  const spans: Array<{ start: number; end: number; id: string }> = [];
  for (const mark of marks) {
    const needle = stripped(mark.anchor.quote.exact).s;
    if (!needle) continue;
    const at = s.indexOf(needle);
    if (at === -1) continue;
    spans.push({ start: offsets[at], end: offsets[at + needle.length - 1] + 1, id: mark.id });
  }
  spans.sort((a, b) => a.start - b.start);
  const runs: Run[] = [];
  let cursor = 0;
  for (const span of spans) {
    if (span.start < cursor) continue;   // overlapping marks: first wins in v1
    if (span.start > cursor) runs.push({ text: text.slice(cursor, span.start), highlightId: null });
    runs.push({ text: text.slice(span.start, span.end), highlightId: span.id });
    cursor = span.end;
  }
  if (cursor < text.length) runs.push({ text: text.slice(cursor), highlightId: null });
  return runs;
}
```

- [ ] **Step 4: Run the marks tests**

Run: `cd web && npm test -- marks`
Expected: 3 passed.

- [ ] **Step 5: Write the node components and the board view**

```tsx
// web/src/board/nodes/ChunkNode.tsx
import { Handle, NodeResizer, Position, type NodeProps } from "@xyflow/react";
import { highlightsIn } from "../../model/geometry";
import type { ChunkNode as ChunkNodeType } from "../../model/types";
import { useBoard } from "../../state/BoardProvider";
import { paintMarks } from "../marks";

export function ChunkNode({ id, data, selected }: NodeProps<ChunkNodeType>) {
  const { state, dispatch } = useBoard();
  const marks = highlightsIn(state.board.highlights, data.region);
  const title = data.region.start.exact.split("\n")[0].slice(0, 80);
  const toggle = () => {
    const node = state.board.nodes.find((n) => n.id === id)!;
    dispatch({ type: "replaceNode", node: { ...node, data: { ...data, collapsed: !data.collapsed } } as ChunkNodeType });
  };
  return (
    <div className={`node chunk ${data.region.state}`}>
      <NodeResizer isVisible={selected} minWidth={200} minHeight={60} />
      <div className="node-head">
        <button className="quiet" onClick={toggle} title={data.collapsed ? "Expand" : "Collapse"}>{data.collapsed ? "▸" : "▾"}</button>
        <span className="title">{title}</span>
        <span className="count">{marks.length ? `${marks.length} marks` : ""}</span>
        <button className="quiet open-source" data-testid="open-source" title="Open in paper">↗</button>
      </div>
      {!data.collapsed && (
        <div className="node-body">
          {paintMarks(data.text, marks).map((run, i) => run.highlightId ? <mark key={i}>{run.text}</mark> : <span key={i}>{run.text}</span>)}
        </div>
      )}
      {marks.map((h, i) => (
        <Handle key={h.id} id={h.id} type="source" position={Position.Right} style={{ top: 36 + i * 14 }} title={h.anchor.quote.exact.slice(0, 60)} />
      ))}
      <Handle id={`${id}-in`} type="target" position={Position.Left} />
    </div>
  );
}
```

```tsx
// web/src/board/nodes/FigureNode.tsx
import { Handle, NodeResizer, Position, type NodeProps } from "@xyflow/react";
import type { FigureNode as FigureNodeType } from "../../model/types";
import { useBoard } from "../../state/BoardProvider";

/** A figure is a clip of the paper as printed. Until the next plan writes clips,
 *  `data.clip` is null and the node shows its caption only. */
export function FigureNode({ id, data, selected }: NodeProps<FigureNodeType>) {
  const { paperId } = useBoard();
  const title = data.caption.split(/[:.]/)[0] || "Figure";
  return (
    <div className={`node figure ${data.region.state}`}>
      <NodeResizer isVisible={selected} minWidth={160} minHeight={60} keepAspectRatio />
      <div className="node-head">
        <span className="title">{title}</span>
        <button className="quiet open-source" data-testid="open-source" title="Open in paper">↗</button>
      </div>
      {!data.collapsed && (
        <div className="node-body">
          {data.clip && data.clip_size
            ? <img src={`/api/papers/${paperId}/${data.clip}`} width={data.clip_size.width} height={data.clip_size.height} alt={data.caption} style={{ maxWidth: "100%", height: "auto" }} />
            : <span>{data.caption}</span>}
        </div>
      )}
      <Handle id={`${id}-in`} type="target" position={Position.Left} />
      <Handle id={`${id}-out`} type="source" position={Position.Right} />
    </div>
  );
}
```

```tsx
// web/src/board/nodes/NoteNode.tsx
import { Handle, NodeResizer, Position, type NodeProps } from "@xyflow/react";
import type { NoteNode as NoteNodeType } from "../../model/types";

/** A note in the reader's own words. This plan draws it; editing and the note file
 *  arrive in the next plan, so the body shows the note path as a placeholder. */
export function NoteNode({ id, data, selected }: NodeProps<NoteNodeType>) {
  return (
    <div className="node note">
      <NodeResizer isVisible={selected} minWidth={160} minHeight={60} />
      <div className="node-head"><span className="title">Note</span></div>
      {!data.collapsed && <div className="node-body">{data.note}</div>}
      <Handle id={`${id}-in`} type="target" position={Position.Left} />
      <Handle id={`${id}-out`} type="source" position={Position.Right} />
    </div>
  );
}
```

`GroupNode.tsx`:

```tsx
// web/src/board/nodes/GroupNode.tsx
import { NodeResizer, type NodeProps } from "@xyflow/react";
import type { GroupNode as GroupNodeType } from "../../model/types";

export function GroupNode({ data, selected }: NodeProps<GroupNodeType>) {
  return (
    <div className="node group">
      <NodeResizer isVisible={selected} minWidth={160} minHeight={120} />
      {data.name && <div className="group-name">{data.name}</div>}
    </div>
  );
}
```

```tsx
// web/src/board/BoardView.tsx
import { useCallback, useMemo } from "react";
import { Background, Controls, ReactFlow, ReactFlowProvider, useReactFlow, type Node, type OnNodeDrag } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { newId } from "../model/ids";
import { reparent } from "../model/reparent";
import type { BoardNode, GroupNode as GroupNodeType, PageRect } from "../model/types";
import { useBoard } from "../state/BoardProvider";
import { ChunkNode } from "./nodes/ChunkNode";
import { FigureNode } from "./nodes/FigureNode";
import { GroupNode } from "./nodes/GroupNode";
import { NoteNode } from "./nodes/NoteNode";

const nodeTypes = { chunk: ChunkNode, figure: FigureNode, note: NoteNode, group: GroupNode };

function Inner({ onOpenInPaper }: { onOpenInPaper: (rect: PageRect) => void }) {
  const { state, dispatch } = useBoard();
  const { getIntersectingNodes, getInternalNode } = useReactFlow<BoardNode>();

  /** Drop a node into a group, or out of one. Coordinates converted explicitly (addendum 4.2). */
  const onNodeDragStop: OnNodeDrag<BoardNode> = useCallback((_, node) => {
    if (node.type === "group") return;
    const groups = getIntersectingNodes(node).filter((n) => n.type === "group" && n.id !== node.parentId) as GroupNodeType[];
    const target = groups[0] ?? null;
    const absolute = getInternalNode(node.id)!.internals.positionAbsolute;
    if (target) {
      const parentAbsolute = getInternalNode(target.id)!.internals.positionAbsolute;
      dispatch({ type: "replaceNode", node: reparent(node, target.id, absolute, parentAbsolute) });
    } else if (node.parentId && getIntersectingNodes(node).every((n) => n.id !== node.parentId)) {
      dispatch({ type: "replaceNode", node: reparent(node, null, absolute, null) });
    }
  }, [dispatch, getIntersectingNodes, getInternalNode]);

  const addGroup = () => {
    const node: GroupNodeType = { id: newId("n"), type: "group", position: { x: 400, y: 40 }, width: 480, height: 320, data: { tags: [], name: null } };
    dispatch({ type: "addNode", node });
  };

  const onNodeClick = (event: React.MouseEvent, node: Node) => {
    if ((event.target as HTMLElement).closest("[data-testid=open-source]") && (node.type === "chunk" || node.type === "figure")) {
      onOpenInPaper((node as BoardNode & { data: { region: { rects: PageRect[] } } }).data.region.rects[0]);
    }
  };

  const nodes = useMemo(() => state.board.nodes, [state.board.nodes]);
  return (
    <div className="board">
      <div className="board-tools"><button onClick={addGroup}>New group</button></div>
      <ReactFlow<BoardNode>
        nodes={nodes} edges={state.board.edges} nodeTypes={nodeTypes}
        onNodesChange={(changes) => dispatch({ type: "nodes", changes })}
        onEdgesChange={(changes) => dispatch({ type: "edges", changes })}
        onNodeDragStop={onNodeDragStop} onNodeClick={onNodeClick}
        onBeforeDelete={async ({ nodes: toDelete, edges: edgesToDelete }) => {
          // Dissolving a group must leave its pieces (addendum 4.2). React Flow hands us
          // the group AND its children here; lift the children out and return a set
          // without them, because returning `true` would delete everything it listed.
          const groupIds = new Set(toDelete.filter((n) => n.type === "group").map((n) => n.id));
          for (const child of state.board.nodes.filter((n) => n.parentId && groupIds.has(n.parentId))) {
            const absolute = getInternalNode(child.id)!.internals.positionAbsolute;
            dispatch({ type: "replaceNode", node: reparent(child, null, absolute, null) });
          }
          return { nodes: toDelete.filter((n) => !(n.parentId && groupIds.has(n.parentId))), edges: edgesToDelete };
        }}
        defaultViewport={state.board.viewport}
        onMoveEnd={(_, viewport) => dispatch({ type: "viewport", viewport })}
        minZoom={0.2} fitView={false} deleteKeyCode={["Backspace", "Delete"]}
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}

export function BoardView(props: { onOpenInPaper: (rect: PageRect) => void }) {
  return <ReactFlowProvider><Inner {...props} /></ReactFlowProvider>;
}
```

`App.tsx` gains the view switch. Inside the provider:

```tsx
const [view, setView] = useState<"paper" | "board">("paper");
const [focusRect, setFocusRect] = useState<PageRect | null>(null);
...
<button onClick={() => setView(view === "paper" ? "board" : "paper")}>{view === "paper" ? "Board" : "Paper"}</button>
...
{view === "paper"
  ? <PaperScreen focus={focusRect} onOpenOnBoard={() => setView("board")} />
  : <BoardView onOpenInPaper={(rect) => { setFocusRect({ ...rect }); setView("paper"); }} />}
```

`focusRect` is set to a fresh object every time so the paper view's effect re-runs even for the same chunk. Add to `styles.css`:

```css
.board { height: 100%; position: relative; }
.board-tools { position: absolute; z-index: 5; top: 8px; left: 8px; }
.node { background: #fff; border: 1px solid #999; border-radius: 3px; font-size: 12px; min-width: 200px; }
.node.chunk.relocated { border-color: #a16207; } .node.chunk.orphaned { border-color: #b91c1c; }
.node-head { display: flex; gap: 6px; align-items: center; padding: 4px 6px; border-bottom: 1px solid #eee; }
.node-head .title { flex: 1; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.node-head .count { color: #666; }
.node-body { padding: 6px 8px; white-space: pre-wrap; max-height: 320px; overflow: auto; user-select: none; }
.node-body mark { background: var(--hl); }
.node.group { background: rgba(0,0,0,.03); border: 1px dashed #666; width: 100%; height: 100%; }
.group-name { padding: 4px 8px; font-weight: 600; }
button.quiet { border: 0; background: none; cursor: pointer; font: inherit; }
```

- [ ] **Step 6: Run it and check every operation**

With the server up and a board holding two chunks and a highlight from Task 5:

1. Board view shows both chunks; the one containing the highlight paints it as a mark and shows a handle for it.
2. Drag one, resize it, collapse it. Notice shows Saved after each. Reload: same.
3. New group; drag a chunk into it; drag the group: the chunk moves with it. Reload: still inside. Read `board.json`: the chunk has `parentId` and a small relative `position`, and the group precedes it in `nodes`.
4. Select the group, press Delete: the chunk survives at the same screen position.
5. Click the ↗ on a chunk: the paper view opens scrolled to that region's page with its outline in view.
6. In the paper view, click an outline: the board view opens.

- [ ] **Step 7: Commit**

```bash
git add web/src
git commit -m "feat(web): board view with chunks, groups, re-parenting, and view switching"
```

---

### Task 7: Playwright: the mechanical half of the acceptance test

**Files:**
- Create: `web/playwright.config.ts`, `web/e2e/step3.spec.ts`, `web/e2e/server.mjs`

**Interfaces:**
- Consumes: the built app, the API server, ResNet.
- Produces: one spec that automates SPEC.md section 11 items 5 and 6 for this plan's scope: highlight five spans and cut three regions, reload, count the same marks and outlines, switch views, click a chunk and land on its page.

- [ ] **Step 1: Config and server helper**

`web/playwright.config.ts`:

```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  use: { baseURL: "http://127.0.0.1:4173", viewport: { width: 1400, height: 1000 } },
  webServer: [
    { command: "node e2e/server.mjs", url: "http://127.0.0.1:8765/api/papers", reuseExistingServer: false, timeout: 120_000 },
    { command: "npm run build && npm run preview", url: "http://127.0.0.1:4173", reuseExistingServer: false },
  ],
});
```

`web/e2e/server.mjs` makes a fresh data folder with ResNet extracted and starts `paperboard serve` on it:

```js
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const repo = resolve(process.cwd(), "..");
const python = join(repo, ".venv", "bin", "paperboard");
const root = mkdtempSync(join(tmpdir(), "pb-e2e-"));
execFileSync(python, ["extract", join(repo, "tests/fixtures/papers/resnet.pdf"), "--out", join(root, "papers")], { stdio: "inherit" });
const server = spawn(python, ["serve", "--root", root, "--web", join(repo, "web", "dist"), "--port", "8765"], { stdio: "inherit" });
process.on("exit", () => server.kill());
```

The preview server proxies `/api` to the API through the `preview.proxy` entry already in `vite.config.ts`, so the spec talks to one origin.

- [ ] **Step 2: Write the spec**

`web/e2e/step3.spec.ts`:

```ts
import { expect, test, type Page } from "@playwright/test";

async function selectSpan(page: Page, pageIndex: number, fromSpan: number, toSpan: number) {
  const spans = page.locator(`.react-pdf__Page[data-page-number="${pageIndex + 1}"] .react-pdf__Page__textContent span`);
  await expect(spans.nth(toSpan)).toBeVisible();
  const a = (await spans.nth(fromSpan).boundingBox())!;
  const b = (await spans.nth(toSpan).boundingBox())!;
  await page.mouse.move(a.x + 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width - 2, b.y + b.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator(".popover")).toBeVisible();
}

test("highlights and cuts survive a reload and the views mirror each other", async ({ page }) => {
  await page.goto("/");
  await page.locator("select").selectOption({ index: 1 });
  await expect(page.locator(".react-pdf__Page").first()).toBeVisible();

  // five highlights on page 3 (index 2), three cuts on pages 3 and 4
  for (const [from, to] of [[4, 6], [10, 12], [20, 22], [30, 31], [40, 43]]) {
    await selectSpan(page, 2, from, to);
    await page.getByRole("button", { name: "Highlight" }).click();
  }
  for (const [pageIndex, from, to] of [[2, 50, 70], [3, 5, 25], [3, 40, 60]]) {
    await selectSpan(page, pageIndex, from, to);
    await page.getByRole("button", { name: "Cut" }).click();
  }
  await expect(page.locator(".overlay .mark")).toHaveCount(5);
  await expect(page.locator(".overlay .outline")).toHaveCount(3);
  await expect(page.locator(".notice")).toHaveText(/Saved v\d+/);

  await page.reload();
  await page.locator("select").selectOption({ index: 1 });
  await expect(page.locator(".overlay .mark")).toHaveCount(5);
  await expect(page.locator(".overlay .outline")).toHaveCount(3);

  await page.getByRole("button", { name: "Board" }).click();
  await expect(page.locator(".node.chunk")).toHaveCount(3);

  const first = page.locator(".node.chunk").first();
  await first.locator("[data-testid=open-source]").click();
  await expect(page.locator(".react-pdf__Page")).toHaveCount(12);
  const target = page.locator(`.react-pdf__Page[data-page-number="3"]`);
  await expect(target).toBeInViewport();
});
```

The span indices are positions in page 3's text layer and depend on ResNet's layout; if a pair lands on an empty span, pick the nearest neighbours and record the change in the commit message. The counts are the assertion; the exact spans are not.

- [ ] **Step 3: Run it**

```bash
cd web && npm run e2e
```

Expected: 1 passed. On a failure, open `playwright-report/` before touching anything: the trace shows whether the selection landed, whether the popover appeared, and what the counts were.

- [ ] **Step 4: Commit**

```bash
git add web/playwright.config.ts web/e2e web/vite.config.ts
git commit -m "test(web): automate acceptance items 5 and 6 for the two views"
```

---

## Done when

- `cd web && npm test && npm run build && npm run e2e` all pass.
- The spike findings file exists and none of its four findings contradicts the code.
- With `paperboard serve --root <data> --web web/dist` running, the whole flow works at `http://127.0.0.1:8765/` with no dev server: choose a paper, select, highlight, cut, arrange, group, close the tab, reopen, everything is where it was.
- You have read one `board.json` written by the app and checked by eye: no `selected`, `dragging`, or `measured`; parents before children; a child inside a group has a small relative position.

## Not in this plan

Split, figure clips, tags and the tag filter, connections drawn by the reader, note editing and margin notes, the question list, the reading goal, export. Those are build steps 4 and 5 and the next plan. Nothing here needs to change for them: they add node data, edges, and panels on top of this state and these routes.
