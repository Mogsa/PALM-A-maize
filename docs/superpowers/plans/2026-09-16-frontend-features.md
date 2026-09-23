# Frontend Features Implementation Plan (build steps 4 and 5, schema 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Everything the fifth revision puts in front of the reader beyond cutting and arranging: highlights painted line by line, mixed text and image chunks, the forgiving rectangle, connections between the things themselves with margin chips, undo and delete, the restored view, the paper's own links, find in paper, Ask elsewhere, the first open already split into a tray beside nine slots, ghost rows, Tidy, tags and the filter, the question list, and export in paper or template order. At the end SPEC.md section 11 can be run in full on a real paper.

**Architecture:** Wave 3 of the build. One serial task (3.0) puts every piece of shared logic in `web/src/model`, `web/src/state` and `web/src/api`: the reducer's actions, the undo history, the filter, containment per line, the tray layout, first open, split, the note store, the tags provider and picker. Then three tasks run in parallel in separate worktrees, each owning a disjoint set of files: 3A the paper view, 3B the board, 3C the shell and its panels. A last serial task (3D) adds one Playwright spec. Every rule that is not a React component is a plain module with a vitest file. No server code: every route used here is in SPEC-ADDENDUM.md section 6 and is built by the server tasks running beside this one.

**Tech Stack:** React 19, `@xyflow/react` 12.11, `react-pdf` 11 over PDF.js, TypeScript 7, Vite 8, vitest 5 with jsdom, Playwright 1.63. One new dependency: `d3-force` 3 (ISC) for Tidy, installed in 3.0. Styles are the restyle plan's: literal colours, fonts, radii and shadows live in `web/src/styles/tokens.css` and nowhere else.

**Spec:** `docs/SPEC.md` (fifth revision; decisions D1 to D19 in section 12) and `docs/SPEC-ADDENDUM.md` sections 4, 4.0 to 4.9, 5.1, 5.3, 6, 6.1, 6.2 and 12. They are the contract; where this plan and they disagree, they win and the plan is wrong. Conventions follow `2026-09-16-frontend-core.md` and `2026-09-20-ui-restyle.md`.

---

## Global Constraints

- All geometry is PyMuPDF page space: PDF points, origin top-left, y down, pages 0-indexed (addendum 2). The one px-to-pt conversion is `web/src/paper/selection.ts`; new code that converts uses `PageFrame` the same way.
- Ids are minted client-side with `newId(kind)`, kinds `n`, `e`, `h`, `t` (addendum 4.5). The server mints nothing the client stores.
- Nothing is generated (principle 1). No summaries, no suggested tags or connections. Ask elsewhere copies a prompt; it calls nothing.
- Nothing is forced (principle 2). No dialog asks a question the reader has not raised. Every slot, tag, name and goal is optional and deletable.
- One gesture, one undo step (addendum 4.7): a drag records on drag stop, a Tidy and a first layout are one step each, the stack holds `UNDO_LIMIT = 100`. View state (`view`, `paper_scroll`, `viewport`, `active_tags`) is saved but never undone.
- Deleting a note or figure never deletes its file (addendum 4.7). The client has no call that deletes a file.
- Saves stay debounced and versioned through `web/src/state/persistence.ts`; nothing in this plan writes `board.json` any other way. Export and Split call `flush()` first.
- Reducer cases return through `next(state, board)`; `revision` counts saveable changes and never resets.
- Pieces are sized with `width`, not `initialWidth` (commit 5f6ed3a). Only a fresh note uses `initialWidth`.
- Every path into `<ReactFlow>` goes through `parentsFirst` (addendum 4.2). BoardView keeps wrapping its existing `nodes` memo; it never maps `state.board.nodes` directly into React Flow.
- Marks, heading zones and margin items never block a text drag: the overlay stays `pointer-events: none`, marks and headings are hit-tested on a click, and only margin items and outline tabs take pointer events.
- CSS uses tokens only. A tag's colour is data and may be an inline style; nothing else is.
- Functions under 50 lines, files under 800 lines, errors shown to the reader or logged with `console.error`, never swallowed.
- Commit messages: `<type>(web): <imperative description>`, with the session trailer:

```
Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01487DAMwQ9qocJcb7QHx5sG
```

## Review Focus

The five inputs most likely to bite a person that the spec implies and no feature test would otherwise exercise, most likely first. Each has its test in the owning task.

1. **A highlight that runs across two chunks, or across a displayed equation inside one.** Each card must paint only the words of its own lines, not nothing and not the whole quote. Test: 3B.1 `paintBlocks` "a mark split across two blocks paints its part in each".
2. **Cmd-Z pressed while typing in a note, the goal, or a tag name.** The text field's own undo must run, not the board's. Test: 3C.1 `undoKeyAction` "ignores keys typed into a text field".
3. **Undo after a save conflict reloaded the board.** The stack refers to a board that no longer exists; applying it would resurrect the other window's losses. Expected: a reload empties the stack. Test: 3.0.3 "load clears the history".
4. **First open under React StrictMode, or a board that was saved once and then emptied.** The layout must happen exactly once, and a board with `version > 0` is never laid out again even when it holds nothing. Tests: 3.0.5 "lays out a new board once under StrictMode" and "never lays out a saved board, even an empty one".
5. **Deleting a tag that is in the active filter.** The filter would keep a tag nobody can see, and the board would show nothing with no chip to clear. Expected: deleting a tag also drops it from `active_tags`. Test: 3C.2 "deleting a tag drops it from the filter".

---

## How Wave 3 runs

```
3.0 (serial) ──► 3A paper  ─┐
                 3B board  ─┼─► 3D acceptance (serial)
                 3C shell  ─┘
```

3A, 3B and 3C branch from the merge of 3.0, each in its own git worktree, and merge in any order: no file is owned by two of them. If one of them finds it needs to change a file it does not own, that is a defect in this plan: stop and raise it, do not edit the file.

| Task | Owns (may create or modify) | Must not touch |
|---|---|---|
| 3.0 | `web/src/model/**`, `web/src/state/**`, `web/src/api/**`, `web/src/tags/TagPicker.tsx`, `web/src/tags/TagChips.tsx`, `web/src/styles/tokens.css`, `web/src/styles/tags.css` (new), `web/src/styles.css`, `web/src/main.tsx`, `web/package.json`, `web/package-lock.json`, `web/e2e/step3.spec.ts`, `web/e2e/restyle.spec.ts` | Anything else, except the mechanical compile fixes in 3.0.3 Step 6, each listed in its commit |
| 3A | `web/src/paper/**`, `web/src/PaperScreen.tsx`, `web/src/styles/paper.css`, `web/e2e/step3.spec.ts` | everything 3.0, 3B, 3C own |
| 3B | `web/src/board/**`, `web/src/styles/board.css`, `web/e2e/board.spec.ts`, `web/e2e/restyle.spec.ts` | everything 3.0, 3A, 3C own |
| 3C | `web/src/App.tsx`, `web/src/tags/**` except `TagPicker.tsx` and `TagChips.tsx`, `web/src/panels/**`, `web/src/styles/shell.css` | everything 3.0, 3A, 3B own |
| 3D | `web/e2e/step5.spec.ts` (new) | everything else |

3.0 edits `step3.spec.ts` and `restyle.spec.ts` before the parallel wave starts, and 3A and 3B edit them after; that is sequential, not shared.

**Stable interfaces between the parallel tasks.** Each of these exists before 3.0 ends and does not change during the wave:

- `PaperScreen` props `{ focus: PageRect | null; onFocusHandled(); onOpenOnBoard(nodeId) }` (3A keeps them; 3C calls them).
- `BoardView` props `{ onOpenInPaper(rect); active?; focusNode?; onFocusHandled? }` (3B keeps them; 3C calls them).
- `web/src/board/layout.ts` exports `MARGIN`, `GAP`, `CHUNK_WIDTH`, `DEFAULT_CHUNK_HEIGHT`, `nextChunkPosition` (3B keeps them; 3.0's `placement.ts` and 3A's `PaperScreen` import them).
- `web/src/board/marks.ts` exports `paperWords` and `reflow` (3B keeps them; `BoardProvider` imports `paperWords`).
- The `.popover` base class in `paper.css` (3A keeps it; 3B's edge popover uses it).
- Everything listed under **Produces** in 3.0.

---

## What 2.0 produces, and this plan consumes

Task 2.0, the schema-2 contract, runs before Wave 3 and is not redone here. This plan expects exactly the following. 3.0.1 checks it mechanically; where 2.0 chose a different name or shape, 3.0.1 adapts 3.0's own files so the names below exist, and records each adaptation in its commit message.

**`web/src/model/types.ts`**, schema 2, matching `board_model.py`:

```ts
export type Rect = [number, number, number, number];
export type PageRect = { page: number; rect: Rect };
export type QuoteSelector = { exact: string; prefix: string; suffix: string };
export type AnchorState = "anchored" | "relocated" | "orphaned";
export type HighlightAnchor = { rects: PageRect[]; quote: QuoteSelector; position: number; state: AnchorState };
export type ChunkAnchor = { rects: PageRect[]; start: QuoteSelector; end: QuoteSelector; position: number; state: AnchorState };
export type Highlight = { id: string; tags: string[]; anchor: HighlightAnchor };

export type TextBlock = { kind: "text"; page: number; rect: Rect; text: string };
export type ClipBlock = { kind: "clip"; page: number; rect: Rect; label: string | null };
export type Block = TextBlock | ClipBlock;

export type NoteOrigin = "reader" | "ai";
export type ChunkData = { tags: string[]; collapsed: boolean; region: ChunkAnchor; blocks: Block[]; user_sized: boolean; source_id?: string | null };
export type FigureData = { tags: string[]; collapsed: boolean; region: ChunkAnchor; clip?: string | null; clip_size?: { width: number; height: number } | null; caption: string; user_sized?: boolean; source_id?: string | null };
export type NoteData = { tags: string[]; collapsed: boolean; note: string; origin: NoteOrigin; user_sized?: boolean };
export type GroupData = { tags: string[]; name?: string | null; tray?: boolean; prompt?: string };

export type ChunkNode = Node<ChunkData, "chunk">;      // Node from @xyflow/react
export type FigureNode = Node<FigureData, "figure">;
export type NoteNode = Node<NoteData, "note">;
export type GroupNode = Node<GroupData, "group">;
export type BoardNode = ChunkNode | FigureNode | NoteNode | GroupNode;
export type BoardEdge = { id: string; from: string; to: string; data: { tags: string[] } };

export type Viewport = { x: number; y: number; zoom: number };
export type View = "paper" | "board";
export type PaperScroll = { page: number; y: number };
export type Board = {
  schema: 2; paper_id: string; version: number; anchor_basis?: string | null;
  goal: string; view: View; paper_scroll?: PaperScroll | null; active_tags: string[]; viewport: Viewport;
  nodes: BoardNode[]; edges: BoardEdge[]; highlights: Highlight[];
};
export const emptyBoard: (paper_id: string) => Board;   // schema 2, version 0, view "paper", no paper_scroll

// Section, Figure, LayoutRegion, PageInfo, Source: unchanged from schema 1.
export type SelectionMode = "text" | "area";
export type Selection = { text: string; rects: PageRect[]; region_label: string | null; highlight: HighlightAnchor; chunk: ChunkAnchor; blocks: Block[] };
export type PaperSummary = { paper_id: string; title: string; page_count: number };
export type Tag = { id: string; name: string; colour: string };
export type TagFile = { schema: 1; tags: Tag[] };
export type Slot = { name: string; prompt: string };
export type TemplateFile = { schema: 1; slots: Slot[] };
export type Question = { id: string; kind: "highlight" | BoardNode["type"]; text: string };
export type SplitDraft =
  | { type: "chunk"; position: { x: number; y: number }; data: ChunkData }
  | { type: "figure"; position: { x: number; y: number }; data: FigureData };
export type ExportOrder = "paper" | "template";
export type ExportResult = { path: string; markdown?: string };
```

**`web/src/model/ids.ts`**: `IdKind = "n" | "e" | "h" | "t"`.

**`web/src/api/client.ts`**, on the `api` object, beside today's `listPapers`, `getSource`, `getBoard`, `pdfUrl`, `putBoard`:

```ts
postText(id: string, rects: PageRect[], snap: boolean, mode?: SelectionMode): Promise<Selection>;   // mode defaults to "text"
getTags(): Promise<TagFile>;                  putTags(file: TagFile): Promise<TagFile>;
getTemplate(): Promise<TemplateFile>;         putTemplate(file: TemplateFile): Promise<TemplateFile>;
getNote(id: string, nodeId: string): Promise<{ markdown: string }>;   // a 404 is { markdown: "" }
putNote(id: string, nodeId: string, markdown: string): Promise<void>;
putClip(id: string, nodeId: string, at: PageRect, dpi?: number): Promise<{ clip: string; clip_size: { width: number; height: number } }>;
renderUrl(id: string, at: PageRect, dpi?: number): string;   // "/api/papers/{id}/render?page&x0&y0&x1&y1&dpi", dpi default 216
split(id: string): Promise<{ nodes: SplitDraft[] }>;
getQuestions(id: string): Promise<Question[]>;
postExport(id: string, tags: string[], order: ExportOrder): Promise<ExportResult>;
```

**`web/src/model/edges.ts`**: `resolveEdges(board: Board): ResolvedEdge[]` with `ResolvedEdge = { id; source: string; sourceHandle: string | null; target: string; targetHandle: string | null; data: { tags: string[] } }`. A node end resolves to the node with a null handle; a highlight end to the first chunk or figure in `nodes` order that contains one of its lines, with the highlight id as handle; an unresolved edge is omitted (D12).

**`web/src/model/geometry.ts`**: `highlightsIn(highlights, region: ChunkAnchor)` true when any line's midpoint lies in one of the region's rects on the same page.

**The existing app, adapted to schema 2 by 2.0:** ChunkNode shows its text blocks; PageOverlay paints one `.mark` per line rect; BoardView renders `resolveEdges`; highlight and cut creation store schema 2 shapes; `removeNode` drops edges by `from`/`to`. The reducer's action union is today's (`load`, `nodes`, `edges`, `addHighlight`, `addNode`, `replaceNode`, `removeNode`, `viewport`, `saved`), possibly with some of 3.0.3's action types declared without behaviour. 3.0.3 owns the union from here on.

---

## Shared DOM contract

3D's spec and the existing specs select by these. The task in the second column creates each and must not rename it.

| Selector or accessible name | Owner | What it is |
|---|---|---|
| `.overlay .mark[data-highlight-id]` | 3A | one element per line rect of a highlight, on its page |
| `.mark-popover` (role dialog, name "Mark"); buttons "Connect", "Ask elsewhere", "Add note", "Remove"; a `TagPicker`; `.note-editor textarea` | 3A | the popover a click on a mark opens |
| `.margin-note[data-note-id]`, `.margin-chip` (buttons) | 3A | margin items beside a mark's first line |
| `.paper.connecting`, `.connect-hint` | 3A | the paper while choosing the other end of a connection |
| selection popover buttons "Highlight", "Cut", "Find", "Open on board" | 3A | as today, plus Find, plus Open on board for a heading |
| `.find-panel li button` | 3A | a find hit |
| `.annotationLayer` inside `.react-pdf__Page` | 3A | the paper's own links (react-pdf) |
| `.node.chunk`, `.node.figure`, `.node.note`, `.node.note.ai`, `.node.group`, `.node.group.tray`, `.node.group.slot` | 3B | cards |
| `.group-name`, `.slot-prompt` (button), `.ghost-row` (button) | 3B | inside groups |
| `.node-body img.block-clip`, `.node-body mark[data-highlight-id]` | 3B | a chunk's clip blocks and painted marks |
| `.count`, `.note-count` | 3B | a card's mark count and note count |
| board tool buttons "New group", "New note", "Split", "Tidy" | 3B | `.board-tools` |
| `.tags-toggle` button (name "Tags") on every card | 3B | opens the card's `TagPicker` |
| `.edge-popover`, button "Remove connection" | 3B | a click on a line |
| view buttons "Paper", "Board" (`aria-pressed`) | 3C | as today |
| input "Reading goal" | 3C | the goal |
| `.filter-bar button.chip` named by tag | 3C | the filter |
| buttons "Questions", "Export", "Tags", "Template" | 3C | open the side panel |
| `.question-list li button` | 3C | a question |
| `.export-dialog`, select "Order", button "Write export", `.export-dialog code` (the path), `.export-dialog pre` | 3C | export |
| `.template-editor`, `.tag-manager` | 3C | the two editors |
| `.tag-picker label` (name = tag name), input "New tag", button "Add" | 3.0 | the picker |
| `.notice` | 3C (today's) | save state, "Saved vN" |

---

## File structure

```
web/src/model/types.ts            (2.0) schema 2 types
web/src/model/contract.test.ts    3.0.1  the names this plan builds on, checked by tsc and vitest
web/src/model/geometry.ts         3.0.2  + lineInside, linesInside
web/src/model/links.ts            3.0.2  neighbours, notesConnectedTo, isNewConnection, newEdge
web/src/model/filter.ts           3.0.2  D8: carriesActive, markDimmed, hiddenNodeIds
web/src/model/paperOrder.ts       3.0.2  addendum 6.1's key: orderKey, trayOrder
web/src/model/sections.ts         3.0.2  sectionAt, sectionRef, sectionLabel
web/src/model/notes.ts            3.0.2  newNote, firstLine, NOTE_WIDTH
web/src/model/placement.ts        3.0.2  spotBeside, spotForNoteOn
web/src/model/reparent.ts         3.0.2  + absoluteIn (moved from the reducer)
web/src/model/history.ts          3.0.3  the undo stack
web/src/model/boardReducer.ts     3.0.3  every action
web/src/model/tray.ts             3.0.4  tray rows, slots, firstLayout, splitIntoTray
web/src/api/client.ts             3.0.1  + CLIP_DPI (and any 2.0 gap)
web/src/state/split.ts            3.0.4  planFirstOpen, planSplit, storeFigureClips
web/src/state/notes.ts            3.0.5  the note store
web/src/state/keys.ts             3.0.5  isTextField
web/src/state/TagsProvider.tsx    3.0.5  global tags
web/src/state/BoardProvider.tsx   3.0.5  + first open, flush, split, notes, useNote
web/src/tags/TagPicker.tsx        3.0.5  toggle tags, add a tag
web/src/tags/TagChips.tsx         3.0.5  read-only chips
web/src/styles/tags.css           3.0.5  chips and picker
web/src/main.tsx                  3.0.5  mounts TagsProvider

web/src/PaperScreen.tsx           3A     popovers, connect mode, cuts, find
web/src/paper/hit.ts              3A.1   click hit-testing on marks and headings
web/src/paper/place.ts            3A.1   keep a popover on screen
web/src/paper/MarkPopover.tsx     3A.1   tags, notes, connect, ask, remove
web/src/paper/cut.ts              3A.2   a chunk or a figure from a selection
web/src/paper/figures.ts          3A.2   the figure a snapped rectangle took
web/src/paper/rectangleDrag.ts    3A.2   Shift-drag to a page rect
web/src/paper/margin.ts           3A.3   margin notes and jump chips
web/src/paper/Margin.tsx          3A.3
web/src/paper/NoteEditor.tsx      3A.3   a note edited inside the mark popover
web/src/paper/ask.ts              3A.4   ASK_PROMPT and its slots
web/src/paper/AskElsewhere.tsx    3A.4
web/src/paper/links.ts            3A.5   a PDF destination to a page point
web/src/paper/find.ts             3A.5   find in paper
web/src/paper/FindPanel.tsx       3A.5
web/src/paper/scroll.ts           3A.6   scrollTop to and from paper_scroll

web/src/board/marks.ts            3B.1   + paintBlocks, partial marks
web/src/board/nodes/ChunkBody.tsx 3B.1   text and clip blocks
web/src/board/nodes/Counts.tsx    3B.1   marks and notes on a card
web/src/board/markOffsets.ts      3B.1   a mark's handle at its first line
web/src/board/handles.ts          3B.2   handle ids, flowEdges, endOf
web/src/board/EdgePopover.tsx     3B.2
web/src/board/BoardActions.tsx    3B.3   focusNode, openInPaper, editing, for nodes
web/src/board/nodes/NodeTags.tsx  3B.3
web/src/board/slots.ts            3B.3   slotPrompt
web/src/board/ghostRows.ts        3B.4   D18
web/src/board/nodes/TrayRows.tsx  3B.4
web/src/board/BoardTools.tsx      3B.4   New group, New note, Split, Tidy
web/src/board/tidy.ts             3B.5   D11

web/src/App.tsx                   3C     Shell inside the provider
web/src/panels/undoKeys.ts        3C.1
web/src/tags/FilterBar.tsx        3C.2
web/src/tags/TagManager.tsx       3C.2
web/src/panels/QuestionList.tsx   3C.3
web/src/panels/ExportDialog.tsx   3C.4
web/src/panels/template.ts        3C.5
web/src/panels/TemplateEditor.tsx 3C.5

web/e2e/step5.spec.ts             3D
```

Every test command below runs from `web/`: `cd web && npm test -- <file>` for one vitest file, `npm test` for all, `npm run build` for tsc plus Vite, `npm run e2e` for Playwright (see `web/e2e/server.mjs` for `PAPERBOARD_BIN` and `PAPERBOARD_FIXTURE` in a worktree).

---

## Task 3.0: Reducer, providers, undo (serial)

**Owns:** `web/src/model/**`, `web/src/state/**`, `web/src/api/**`, `web/src/tags/TagPicker.tsx`, `web/src/tags/TagChips.tsx`, `web/src/styles/tokens.css`, `web/src/styles/tags.css`, `web/src/styles.css`, `web/src/main.tsx`, `web/package.json`, `web/package-lock.json`, `web/e2e/step3.spec.ts`, `web/e2e/restyle.spec.ts`.
**Must not touch:** `web/src/paper/**`, `web/src/PaperScreen.tsx`, `web/src/board/**`, `web/src/App.tsx`, `web/src/panels/**`, the other `web/src/tags/*` files, `paper.css`, `board.css`, `shell.css`, `web/e2e/board.spec.ts`. The one exception is 3.0.3 Step 6: a mechanical call-site fix the build needs after an action is renamed, committed on its own and named in its message.
**Consumes:** everything under "What 2.0 produces".
**Produces:** every name in the **Produces** blocks of 3.0.1 to 3.0.5. 3A, 3B and 3C see only these.

Five sub-tasks, in order, each ending green (`npm test && npm run build`) with a commit.

### Task 3.0.1: Check the contract, add d3-force, add the shared tokens

**Files:**
- Create: `web/src/model/contract.test.ts`
- Modify: `web/src/api/client.ts` (only where the check fails), `web/package.json`, `web/package-lock.json`, `web/src/styles/tokens.css`

**Interfaces:**
- Consumes: the 2.0 contract above.
- Produces: `CLIP_DPI = 216` exported from `web/src/api/client.ts`; the `d3-force` package; tokens `--ai`, `--ai-tint`, `--dim`, `--ghost`.

- [ ] **Step 1: Write the contract test**

`web/src/model/contract.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, CLIP_DPI } from "../api/client";
import type { BoardAction } from "./boardReducer";
import { resolveEdges } from "./edges";
import { highlightsIn } from "./geometry";
import { newId } from "./ids";
import {
  emptyBoard, type Block, type Board, type BoardEdge, type ChunkNode, type ExportOrder, type ExportResult, type GroupData,
  type Highlight, type NoteData, type PaperScroll, type Question, type Rect, type Selection, type SelectionMode, type SplitDraft,
  type TagFile, type TemplateFile, type View,
} from "./types";

const q = { exact: "x", prefix: "", suffix: "" };
const line = (page: number, rect: Rect) => ({ page, rect });
const mark: Highlight = { id: "h-1", tags: [], anchor: { rects: [line(2, [60, 200, 200, 212]), line(2, [320, 80, 500, 92])], quote: q, position: 0, state: "anchored" } };
const clip: Block = { kind: "clip", page: 2, rect: [60, 300, 200, 340], label: "formula" };
const chunk: ChunkNode = { id: "n-c", type: "chunk", position: { x: 0, y: 0 }, width: 320,
  data: { tags: [], collapsed: false, region: { rects: [line(2, [50, 100, 286, 400])], start: q, end: q, position: 0, state: "anchored" }, blocks: [clip], user_sized: false } };
const board: Board = {
  ...emptyBoard("p"),
  nodes: [chunk, { id: "n-n", type: "note", position: { x: 400, y: 0 }, initialWidth: 280, data: { tags: [], collapsed: false, note: "notes/n-n.md", origin: "ai" } }],
  edges: [{ id: "e-1", from: "h-1", to: "n-n", data: { tags: [] } }],
  highlights: [mark],
};

// Type-level half: `npm run build` fails on these lines if a shape differs from the plan's contract.
const view: View = board.view;
const scroll: PaperScroll | null | undefined = board.paper_scroll;
const slot: GroupData = { tags: [], name: "Main point", prompt: "In your own words?", tray: false };
const origin: NoteData["origin"] = "reader";
const mode: SelectionMode = "area";
const order: ExportOrder = "template";
const shapes: [BoardEdge, Question, Selection["blocks"], SplitDraft["type"], TagFile["schema"], TemplateFile["slots"], ExportResult["path"]] | null = null;
const action: BoardAction = { type: "addHighlight", highlight: mark };
void [view, scroll, slot, origin, mode, order, shapes, action];

afterEach(() => vi.unstubAllGlobals());

describe("the schema 2 contract this plan builds on", () => {
  it("starts a board at schema 2, version 0, in the paper view", () => {
    const fresh = emptyBoard("p");
    expect(fresh).toMatchObject({ schema: 2, version: 0, view: "paper" });
    expect(fresh.paper_scroll ?? null).toBeNull();
  });
  it("mints tag ids", () => expect(newId("t")).toMatch(/^t-/));
  it("finds a highlight in a chunk by any one of its lines", () => {
    expect(highlightsIn([mark], chunk.data.region)).toEqual([mark]);
  });
  it("draws an edge from a highlight on the chunk that holds it, and a node end with no handle", () => {
    expect(resolveEdges(board)).toEqual([{ id: "e-1", source: "n-c", sourceHandle: "h-1", target: "n-n", targetHandle: null, data: { tags: [] } }]);
  });
  it("omits an edge whose highlight no chunk holds", () => {
    expect(resolveEdges({ ...board, nodes: [board.nodes[1]] })).toEqual([]);
  });
  it("builds render urls at 216 dpi by default", () => {
    expect(CLIP_DPI).toBe(216);
    const url = new URL(api.renderUrl("p", line(3, [1, 2, 3, 4])), "http://local");
    expect(url.pathname).toBe("/api/papers/p/render");
    expect(Object.fromEntries(url.searchParams)).toEqual({ page: "3", x0: "1", y0: "2", x1: "3", y1: "4", dpi: "216" });
  });
  it("reads a missing note as empty", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { code: "note_not_found", message: "no note" } }), { status: 404 })));
    expect(await api.getNote("p", "n-x")).toEqual({ markdown: "" });
  });
  it("sends the selection mode with the rects", async () => {
    const fetch = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    await api.postText("p", [line(0, [0, 0, 1, 1])], false, "area");
    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ rects: [line(0, [0, 0, 1, 1])], snap: false, mode: "area" });
  });
});
```

- [ ] **Step 2: Run it**

Run: `cd web && npm test -- contract && npm run build`
Expected on a complete 2.0: vitest fails only on the missing `CLIP_DPI` import (2.0 was not asked for it), and tsc reports the same. Any other failure is a 2.0 divergence.

- [ ] **Step 3: Close the gaps in 3.0's own files**

Add to `web/src/api/client.ts`, and make `putClip` and `renderUrl` default to it:

```ts
/** Clips render at three times the page's 72 dpi, so an equation stays sharp (addendum 5.3). */
export const CLIP_DPI = 216;
```

For any other failure, adapt `client.ts`, `types.ts`, `edges.ts` or `geometry.ts` so the contract's names and shapes exist: rename, add an alias, or add the missing one-liner. The likely ones, with their fix:

- `getNote` throws on a 404. On the `api` object:

```ts
  async getNote(id: string, nodeId: string): Promise<{ markdown: string }> {
    try {
      return await call<{ markdown: string }>(`/api/papers/${id}/notes/${nodeId}`);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return { markdown: "" };   // a note never written is empty
      throw error;
    }
  },
```

- `renderUrl` is missing:

```ts
  renderUrl: (id: string, at: PageRect, dpi = CLIP_DPI) => {
    const [x0, y0, x1, y1] = at.rect;
    const query = new URLSearchParams({ page: String(at.page), x0: String(x0), y0: String(y0), x1: String(x1), y1: String(y1), dpi: String(dpi) });
    return `/api/papers/${id}/render?${query}`;
  },
```

- `postText` takes no `mode`:

```ts
  postText: (id: string, rects: PageRect[], snap: boolean, mode: SelectionMode = "text") =>
    call<Selection>(`/api/papers/${id}/text`, { method: "POST", body: JSON.stringify({ rects, snap, mode }) }),
```

- `resolveEdges` or its result type has another name: export them as `resolveEdges` and `ResolvedEdge` from `web/src/model/edges.ts`.

Change call sites of anything renamed, even outside 3.0's paths, in the same commit, and name each such file in the commit message.

- [ ] **Step 4: Add d3-force**

Run: `cd web && npm install d3-force@^3.0.0 && npm install -D @types/d3-force@^3.0.10`
Expected: both in `package.json`, lockfile updated, `npm ls d3-force` prints one `d3-force@3.x`.

- [ ] **Step 5: Add the shared tokens**

In `web/src/styles/tokens.css`, under `/* meaning */`:

```css
  --ai: #7c3aed;                         /* a note pasted from an AI (D14) */
  --ai-tint: rgba(124, 58, 237, 0.08);
  --dim: 0.3;                            /* opacity of what the tag filter dims */
  --ghost: 0.55;                         /* opacity of a tray ghost row */
```

- [ ] **Step 6: Run everything**

Run: `cd web && npm test && npm run build`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add web/src/model/contract.test.ts web/src/api/client.ts web/package.json web/package-lock.json web/src/styles/tokens.css
git commit -m "test(web): check the schema 2 contract, add d3-force and the shared tokens"
```

(With the trailer from Global Constraints, as every commit below.)

---

### Task 3.0.2: Pure model helpers: lines, links, filter, paper order, sections, notes, placement

**Files:**
- Modify: `web/src/model/geometry.ts`, `web/src/model/reparent.ts`
- Create: `web/src/model/links.ts`, `web/src/model/filter.ts`, `web/src/model/paperOrder.ts`, `web/src/model/sections.ts`, `web/src/model/notes.ts`, `web/src/model/placement.ts`
- Test: `web/src/model/geometry.test.ts` (append), `web/src/model/reparent.test.ts` (append), `web/src/model/links.test.ts`, `web/src/model/filter.test.ts`, `web/src/model/paperOrder.test.ts`, `web/src/model/sections.test.ts`, `web/src/model/notes.test.ts`, `web/src/model/placement.test.ts`

**Interfaces:**
- Consumes: `highlightsIn`, `containsPoint`, `midpoint` (geometry), `newId`, `nextChunkPosition` and `GAP` from `web/src/board/layout.ts`.
- Produces:
  - `lineInside(line: PageRect, rects: PageRect[]): boolean`; `linesInside(highlight: Highlight, rects: PageRect[]): PageRect[]`
  - `absoluteIn(nodes: BoardNode[]): (id: string) => XY` in `reparent.ts`
  - `neighbours(edges: BoardEdge[], id: string): string[]`; `notesConnectedTo(board: Board, ids: string[]): NoteNode[]`; `isNewConnection(edges: BoardEdge[], edge: BoardEdge): boolean`; `newEdge(from: string, to: string): BoardEdge`
  - `carriesActive(active: string[], tags: string[]): boolean`; `markDimmed(active: string[], highlight: Highlight): boolean`; `hiddenNodeIds(board: Board): Set<string>`
  - `OrderKey`, `orderKey(source: Source, first: PageRect): OrderKey`, `compareKeys(a, b): number`, `trayOrder(source: Source): string[]`
  - `sectionAt(source: Source, at: PageRect): Section | null` (the section whose extent holds `at`'s midpoint); `sectionRef(section): string` ("§3", or the title when unnumbered); `sectionLabel(section): string` ("§3 Model Architecture")
  - `NOTE_WIDTH = 280`, `newNote(opts: { position: XY; parentId?: string; origin: NoteOrigin }): NoteNode`, `firstLine(markdown: string, max?: number): string`
  - `Spot = { position: XY }`, `spotBeside(nodes: BoardNode[], id: string): Spot | null`, `spotForNoteOn(board: Board, highlightId: string): Spot`

- [ ] **Step 1: Write the failing tests**

Append to `web/src/model/geometry.test.ts` (and add `lineInside, linesInside` to its import from `./geometry`, `Rect` to its type import):

```ts
describe("lines inside (addendum 4.0)", () => {
  const rects = [{ page: 2, rect: [50, 100, 286, 400] as Rect }];
  it("a line is inside when its midpoint lies in a rect on its own page", () => {
    expect(lineInside({ page: 2, rect: [60, 200, 200, 212] }, rects)).toBe(true);
    expect(lineInside({ page: 3, rect: [60, 200, 200, 212] }, rects)).toBe(false);
    expect(lineInside({ page: 2, rect: [270, 200, 400, 212] }, rects)).toBe(false);   // midpoint x 335 is past the rect
  });
  it("linesInside keeps a highlight's lines that are inside, in order", () => {
    const q = { exact: "x", prefix: "", suffix: "" };
    const h = { id: "h-1", tags: [], anchor: { rects: [{ page: 2, rect: [320, 380, 500, 392] as Rect }, { page: 2, rect: [60, 390, 200, 398] as Rect }, { page: 2, rect: [60, 410, 200, 420] as Rect }], quote: q, position: 0, state: "anchored" as const } };
    expect(linesInside(h, rects)).toEqual([h.anchor.rects[1]]);
  });
});
```

Append to `web/src/model/reparent.test.ts` (import `absoluteIn`):

```ts
describe("absoluteIn", () => {
  it("adds every ancestor's position", () => {
    const nodes = [
      { id: "n-g", type: "group", position: { x: 100, y: 100 }, data: { tags: [] } },
      { id: "n-h", type: "group", position: { x: 10, y: 20 }, parentId: "n-g", data: { tags: [] } },
      { id: "n-c", type: "note", position: { x: 5, y: 7 }, parentId: "n-h", data: { tags: [], collapsed: false, note: "notes/n-c.md", origin: "reader" } },
    ] as BoardNode[];
    expect(absoluteIn(nodes)("n-c")).toEqual({ x: 115, y: 127 });
    expect(absoluteIn(nodes)("n-missing")).toEqual({ x: 0, y: 0 });
  });
});
```

`web/src/model/links.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isNewConnection, neighbours, newEdge, notesConnectedTo } from "./links";
import { emptyBoard, type BoardEdge, type BoardNode } from "./types";

const note = (id: string): BoardNode => ({ id, type: "note", position: { x: 0, y: 0 }, data: { tags: [], collapsed: false, note: `notes/${id}.md`, origin: "reader" } });
const edge = (id: string, from: string, to: string): BoardEdge => ({ id, from, to, data: { tags: [] } });
const edges = [edge("e-1", "h-1", "n-a"), edge("e-2", "n-b", "h-1"), edge("e-3", "n-c", "n-x")];

describe("links", () => {
  it("neighbours are the other ends of every edge touching a thing, either direction", () => {
    expect(neighbours(edges, "h-1")).toEqual(["n-a", "n-b"]);
    expect(neighbours(edges, "n-zzz")).toEqual([]);
  });
  it("notesConnectedTo lists each connected note once, in nodes order", () => {
    const board = { ...emptyBoard("p"), nodes: [note("n-b"), note("n-a"), note("n-c")], edges: [...edges, edge("e-4", "n-a", "h-2")] };
    expect(notesConnectedTo(board, ["h-1", "h-2"]).map((n) => n.id)).toEqual(["n-b", "n-a"]);
  });
  it("a connection to itself, or a second line between the same two things, is not new", () => {
    expect(isNewConnection(edges, edge("e-9", "h-1", "h-1"))).toBe(false);
    expect(isNewConnection(edges, edge("e-9", "n-a", "h-1"))).toBe(false);
    expect(isNewConnection(edges, edge("e-9", "n-a", "n-b"))).toBe(true);
  });
  it("newEdge mints an id and starts with no tags", () => {
    expect(newEdge("h-1", "n-a")).toMatchObject({ id: expect.stringMatching(/^e-/), from: "h-1", to: "n-a", data: { tags: [] } });
  });
});
```

`web/src/model/filter.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { carriesActive, hiddenNodeIds, markDimmed } from "./filter";
import { emptyBoard, type BoardNode, type Highlight, type Rect } from "./types";

const q = { exact: "x", prefix: "", suffix: "" };
const region = { rects: [{ page: 0, rect: [0, 0, 100, 100] as Rect }], start: q, end: q, position: 0, state: "anchored" as const };
const chunk = (id: string, tags: string[], parentId?: string): BoardNode =>
  ({ id, type: "chunk", position: { x: 0, y: 0 }, ...(parentId ? { parentId } : {}), data: { tags, collapsed: false, region, blocks: [], user_sized: false } });
const group = (id: string, tags: string[] = []): BoardNode => ({ id, type: "group", position: { x: 0, y: 0 }, data: { tags } });
const mark = (tags: string[]): Highlight => ({ id: "h-1", tags, anchor: { rects: [{ page: 0, rect: [10, 10, 50, 20] }], quote: q, position: 0, state: "anchored" } });
const board = (active: string[], nodes: BoardNode[], highlights: Highlight[] = []) => ({ ...emptyBoard("p"), active_tags: active, nodes, highlights });

describe("the filter rule (D8)", () => {
  it("with no tag active nothing is hidden and nothing dims", () => {
    expect(carriesActive([], [])).toBe(true);
    expect(hiddenNodeIds(board([], [chunk("n-1", [])])).size).toBe(0);
    expect(markDimmed([], mark([]))).toBe(false);
  });
  it("a node shows when it carries any active tag", () => {
    const hidden = hiddenNodeIds(board(["t-a", "t-b"], [chunk("n-1", ["t-b"]), chunk("n-2", ["t-c"])]));
    expect([...hidden]).toEqual(["n-2"]);
  });
  it("a chunk also shows when a mark inside it carries an active tag, as export decides", () => {
    expect(hiddenNodeIds(board(["t-a"], [chunk("n-1", [])], [mark(["t-a"])])).size).toBe(0);
  });
  it("a group shows while any child shows, and hides when none does", () => {
    expect(hiddenNodeIds(board(["t-a"], [group("n-g"), chunk("n-1", ["t-a"], "n-g"), chunk("n-2", [], "n-g")]))).toEqual(new Set(["n-2"]));
    expect(hiddenNodeIds(board(["t-a"], [group("n-g"), chunk("n-2", [], "n-g")]))).toEqual(new Set(["n-g", "n-2"]));
  });
  it("a group carrying an active tag shows even with every child hidden", () => {
    expect(hiddenNodeIds(board(["t-a"], [group("n-g", ["t-a"]), chunk("n-2", [], "n-g")]))).toEqual(new Set(["n-2"]));
  });
  it("a mark dims unless it carries an active tag", () => {
    expect(markDimmed(["t-a"], mark([]))).toBe(true);
    expect(markDimmed(["t-a"], mark(["t-a"]))).toBe(false);
  });
});
```

`web/src/model/paperOrder.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { compareKeys, orderKey, trayOrder } from "./paperOrder";
import type { Rect, Source } from "./types";

const pr = (page: number, rect: Rect) => ({ page, rect });
// A two-column page: the left column's region is listed before the right column's, which is reading order.
const source = {
  regions: [
    { page: 0, rect: [50, 50, 300, 700], label: "text" },
    { page: 0, rect: [320, 50, 560, 700], label: "text" },
    { page: 1, rect: [50, 50, 560, 700], label: "text" },
  ],
  sections: [
    { id: "sec-2", number: "2", depth: 1, title: "Two", heading_rect: pr(1, [50, 60, 200, 70]), extent: [pr(1, [50, 60, 560, 700])], text: "" },
    { id: "sec-1", number: "1", depth: 1, title: "One", heading_rect: pr(0, [50, 600, 200, 610]), extent: [pr(0, [50, 600, 300, 700])], text: "" },
  ],
  figures: [{ id: "fig-1", kind: "figure", label: "Figure 1", caption: "Figure 1: x", caption_rect: null, rect: pr(0, [320, 60, 560, 200]), confidence: "region" }],
} as unknown as Source;

describe("paper order (addendum 6.1)", () => {
  it("reads the left column before the right, whatever the y", () => {
    expect(compareKeys(orderKey(source, pr(0, [50, 600, 300, 700])), orderKey(source, pr(0, [320, 60, 560, 200])))).toBeLessThan(0);
  });
  it("puts a rect that starts in no region after the page's regions", () => {
    expect(orderKey(source, pr(0, [5, 5, 10, 10]))[1]).toBe(Number.MAX_SAFE_INTEGER);
  });
  it("orders sections and figures together", () => {
    expect(trayOrder(source)).toEqual(["sec-1", "fig-1", "sec-2"]);
  });
});
```

`web/src/model/sections.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { sectionAt, sectionLabel, sectionRef } from "./sections";
import type { Rect, Section, Source } from "./types";

const pr = (page: number, rect: Rect) => ({ page, rect });
const model: Section = { id: "sec-3", number: "3.", depth: 1, title: "Model Architecture", heading_rect: pr(2, [108, 280, 303, 290]), extent: [pr(2, [108, 280, 504, 720]), pr(3, [108, 72, 504, 410])], text: "" };
const abstract: Section = { ...model, id: "sec-0", number: null, title: "Abstract", extent: [pr(0, [108, 300, 504, 500])] };
const source = { sections: [abstract, model] } as unknown as Source;

describe("sections", () => {
  it("finds the section whose extent holds a line's midpoint, on any of its pages", () => {
    expect(sectionAt(source, pr(3, [120, 100, 300, 110]))?.id).toBe("sec-3");
    expect(sectionAt(source, pr(0, [120, 310, 300, 320]))?.id).toBe("sec-0");
    expect(sectionAt(source, pr(5, [0, 0, 1, 1]))).toBeNull();
  });
  it("names a section by its number, or by its title when it has none", () => {
    expect(sectionRef(model)).toBe("§3");
    expect(sectionRef(abstract)).toBe("Abstract");
    expect(sectionLabel(model)).toBe("§3 Model Architecture");
    expect(sectionLabel(abstract)).toBe("Abstract");
  });
});
```

`web/src/model/notes.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { firstLine, NOTE_WIDTH, newNote } from "./notes";

describe("notes", () => {
  it("a new note is empty, sized to its content, and keeps its origin", () => {
    const note = newNote({ position: { x: 10, y: 20 }, origin: "ai" });
    expect(note).toMatchObject({ type: "note", position: { x: 10, y: 20 }, initialWidth: NOTE_WIDTH, data: { tags: [], collapsed: false, origin: "ai" } });
    expect(note.data.note).toBe(`notes/${note.id}.md`);
    expect(note.parentId).toBeUndefined();
  });
  it("a note made inside a group is its child", () => {
    expect(newNote({ position: { x: 0, y: 0 }, parentId: "n-g", origin: "reader" }).parentId).toBe("n-g");
  });
  it("firstLine is the first non-empty line without Markdown heading marks, cut at max", () => {
    expect(firstLine("\n\n  ## Multi-head attention  \nmore")).toBe("Multi-head attention");
    expect(firstLine("abcdefghij", 5)).toBe("abcd…");
    expect(firstLine("")).toBe("");
  });
});
```

`web/src/model/placement.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { GAP, nextChunkPosition } from "../board/layout";
import { spotBeside, spotForNoteOn } from "./placement";
import { emptyBoard, type BoardNode, type Highlight, type Rect } from "./types";

const q = { exact: "x", prefix: "", suffix: "" };
const region = { rects: [{ page: 0, rect: [0, 0, 100, 100] as Rect }], start: q, end: q, position: 0, state: "anchored" as const };
const chunk: BoardNode = { id: "n-c", type: "chunk", position: { x: 20, y: 48 }, parentId: "n-g", width: 320, data: { tags: [], collapsed: false, region, blocks: [], user_sized: false } };
const group: BoardNode = { id: "n-g", type: "group", position: { x: 100, y: 100 }, width: 360, height: 900, data: { tags: [] } };
const mark = (page: number): Highlight => ({ id: "h-1", tags: [], anchor: { rects: [{ page, rect: [10, 10, 50, 20] }], quote: q, position: 0, state: "anchored" } });

describe("placement", () => {
  it("a spot beside a node is to its right, at the top level, in absolute coordinates", () => {
    expect(spotBeside([group, chunk], "n-c")).toEqual({ position: { x: 100 + 20 + 320 + GAP, y: 148 } });
    expect(spotBeside([group], "n-missing")).toBeNull();
  });
  it("a note on a mark goes beside the chunk that holds it, else under everything", () => {
    const board = { ...emptyBoard("p"), nodes: [group, chunk], highlights: [mark(0)] };
    expect(spotForNoteOn(board, "h-1")).toEqual(spotBeside(board.nodes, "n-c"));
    const loose = { ...board, highlights: [mark(5)] };
    expect(spotForNoteOn(loose, "h-1")).toEqual({ position: nextChunkPosition(board.nodes) });
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd web && npm test -- geometry reparent links filter paperOrder sections notes placement`
Expected: FAIL on the new imports (`lineInside`, `absoluteIn`, and six unresolved modules).

- [ ] **Step 3: Write the helpers**

Append to `web/src/model/geometry.ts` (and add `PageRect` to its type import):

```ts
/** A line is inside when its midpoint lies in one of `rects` on the same page (addendum 4.0). */
export function lineInside(line: PageRect, rects: PageRect[]): boolean {
  const [mx, my] = midpoint(line.rect);
  return rects.some((r) => r.page === line.page && containsPoint(r.rect, mx, my));
}

/** The lines of a highlight that lie inside `rects`, in the highlight's order: what a chunk or a section paints or counts. */
export function linesInside(highlight: Highlight, rects: PageRect[]): PageRect[] {
  return highlight.anchor.rects.filter((line) => lineInside(line, rects));
}
```

If 2.0's `highlightsIn` does not already test lines this way, make it `return highlights.filter((h) => linesInside(h, region.rects).length > 0);`.

Append to `web/src/model/reparent.ts` (the reducer's private `absoluteIn` moves here in 3.0.3):

```ts
/** A node's absolute position from the stored ones: its own plus every ancestor's. */
export function absoluteIn(nodes: BoardNode[]): (id: string) => XY {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return (id) => {
    let x = 0, y = 0;
    for (let node = byId.get(id); node; node = node.parentId ? byId.get(node.parentId) : undefined) {
      x += node.position.x;
      y += node.position.y;
    }
    return { x, y };
  };
}
```

`web/src/model/links.ts`:

```ts
import { newId } from "./ids";
import type { Board, BoardEdge, NoteNode } from "./types";

/** The ids at the other end of every edge touching `id`. Edges carry no direction (addendum 4.0). */
export function neighbours(edges: BoardEdge[], id: string): string[] {
  return edges.flatMap((e) => (e.from === id ? [e.to] : e.to === id ? [e.from] : []));
}

/** Note nodes connected to any of `ids`, each once, in nodes order. Nothing caches this (D7). */
export function notesConnectedTo(board: Board, ids: string[]): NoteNode[] {
  const linked = new Set(ids.flatMap((id) => neighbours(board.edges, id)));
  return board.nodes.filter((n): n is NoteNode => n.type === "note" && linked.has(n.id));
}

/** Not a line to itself, and not a second line between the same two things. */
export function isNewConnection(edges: BoardEdge[], edge: BoardEdge): boolean {
  if (edge.from === edge.to) return false;
  return !edges.some((e) => (e.from === edge.from && e.to === edge.to) || (e.from === edge.to && e.to === edge.from));
}

export function newEdge(from: string, to: string): BoardEdge {
  return { id: newId("e"), from, to, data: { tags: [] } };
}
```

`web/src/model/filter.ts`:

```ts
import { highlightsIn } from "./geometry";
import type { Board, BoardNode, Highlight } from "./types";

/** With no tag active, everything passes; otherwise a thing passes when it carries any active tag (D8). */
export function carriesActive(active: string[], tags: string[]): boolean {
  return active.length === 0 || tags.some((t) => active.includes(t));
}

/** A mark inside a chunk is painted at full strength when it carries an active tag, dimmed otherwise. */
export function markDimmed(active: string[], highlight: Highlight): boolean {
  return active.length > 0 && !carriesActive(active, highlight.tags);
}

/** Nodes the filter hides. Computed at render, never stored (addendum 4.2). A chunk or figure also shows
 *  when a mark inside it carries an active tag, the rule export uses (addendum 6.1). */
export function hiddenNodeIds(board: Board): Set<string> {
  const active = board.active_tags;
  if (!active.length) return new Set();
  const children = new Map<string, BoardNode[]>();
  for (const n of board.nodes) if (n.parentId) children.set(n.parentId, [...(children.get(n.parentId) ?? []), n]);
  const shown = new Map<string, boolean>();
  const isShown = (node: BoardNode): boolean => {
    const known = shown.get(node.id);
    if (known !== undefined) return known;
    shown.set(node.id, false);   // a guard against a parent cycle in a hand-edited file
    let result = carriesActive(active, node.data.tags);
    if (!result && (node.type === "chunk" || node.type === "figure")) {
      result = highlightsIn(board.highlights, node.data.region).some((h) => carriesActive(active, h.tags));
    }
    if (!result && node.type === "group") result = (children.get(node.id) ?? []).some(isShown);
    shown.set(node.id, result);
    return result;
  };
  return new Set(board.nodes.filter((n) => !isShown(n)).map((n) => n.id));
}
```

`web/src/model/paperOrder.ts`:

```ts
import { containsPoint } from "./geometry";
import type { PageRect, Source } from "./types";

/** Addendum 6.1's paper order: page, then the index in `regions` of the region the first rect starts in, then (y0, x0).
 *  Never (page, y0) alone, which puts the right column before the left. */
export type OrderKey = [page: number, region: number, y0: number, x0: number];

export function orderKey(source: Source, first: PageRect): OrderKey {
  const [x0, y0] = first.rect;
  const index = source.regions.findIndex((r) => r.page === first.page && containsPoint(r.rect, x0, y0));
  return [first.page, index === -1 ? Number.MAX_SAFE_INTEGER : index, y0, x0];
}

export function compareKeys(a: OrderKey, b: OrderKey): number {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

/** Every section and figure id in paper order: the rows of the tray (addendum 4.9). */
export function trayOrder(source: Source): string[] {
  const items = [
    ...source.sections.map((s) => ({ id: s.id, key: orderKey(source, s.extent[0] ?? s.heading_rect) })),
    ...source.figures.map((f) => ({ id: f.id, key: orderKey(source, f.rect) })),
  ];
  return items.sort((a, b) => compareKeys(a.key, b.key)).map((item) => item.id);
}
```

`web/src/model/sections.ts`:

```ts
import { lineInside } from "./geometry";
import type { PageRect, Section, Source } from "./types";

/** The section a line or rect starts in: the one whose extent holds its midpoint (addendum 4.0's test). Extents run
 *  from one heading to the next, so they do not nest and the first match is the only one. */
export function sectionAt(source: Source, at: PageRect): Section | null {
  return source.sections.find((s) => lineInside(at, s.extent)) ?? null;
}

const number = (s: Section) => (s.number ?? "").replace(/\.$/, "");

/** "§3" for a numbered section, its title otherwise: the short name a margin chip uses. */
export function sectionRef(s: Section): string {
  return number(s) ? `§${number(s)}` : s.title;
}

/** "§3 Model Architecture": the name a tray ghost row uses. */
export function sectionLabel(s: Section): string {
  return number(s) ? `§${number(s)} ${s.title}` : s.title;
}
```

`web/src/model/notes.ts`:

```ts
import { newId } from "./ids";
import type { XY } from "./reparent";
import type { NoteNode, NoteOrigin } from "./types";

export const NOTE_WIDTH = 280;
export const FIRST_LINE_CHARS = 60;

/** An empty note. Its text lives in notes/<id>.md, written on first save; a missing file reads as empty. */
export function newNote({ position, parentId, origin }: { position: XY; parentId?: string; origin: NoteOrigin }): NoteNode {
  const id = newId("n");
  return {
    id, type: "note", position, ...(parentId ? { parentId } : {}), initialWidth: NOTE_WIDTH,
    data: { tags: [], collapsed: false, note: `notes/${id}.md`, origin },
  };
}

/** A note's title: its first non-empty line, without heading marks, cut at `max` characters. */
export function firstLine(markdown: string, max = FIRST_LINE_CHARS): string {
  const line = markdown.split("\n").map((l) => l.replace(/^\s*#+\s*/, "").trim()).find(Boolean) ?? "";
  return line.length <= max ? line : `${line.slice(0, max - 1)}…`;
}
```

`web/src/model/placement.ts`:

```ts
import { GAP, nextChunkPosition } from "../board/layout";
import { highlightsIn } from "./geometry";
import { absoluteIn, type XY } from "./reparent";
import type { Board, BoardNode } from "./types";

export type Spot = { position: XY };
export const FALLBACK_WIDTH = 320;

/** To the right of a node, at the top level. Never inside the node's group: a child outside its group's box
 *  would break the drop rule (addendum 4.2). */
export function spotBeside(nodes: BoardNode[], id: string): Spot | null {
  const node = nodes.find((n) => n.id === id);
  if (!node) return null;
  const at = absoluteIn(nodes)(id);
  const width = node.width ?? node.measured?.width ?? node.initialWidth ?? FALLBACK_WIDTH;
  return { position: { x: at.x + width + GAP, y: at.y } };
}

/** Where a note written on a mark lands on the board: beside the first chunk holding the mark, else under everything. */
export function spotForNoteOn(board: Board, highlightId: string): Spot {
  const mark = board.highlights.find((h) => h.id === highlightId);
  const holder = mark && board.nodes.find((n) => (n.type === "chunk" || n.type === "figure") && highlightsIn([mark], n.data.region).length > 0);
  return (holder && spotBeside(board.nodes, holder.id)) || { position: nextChunkPosition(board.nodes) };
}
```

- [ ] **Step 4: Run the tests**

Run: `cd web && npm test -- geometry reparent links filter paperOrder sections notes placement`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add web/src/model
git commit -m "feat(web): lines inside a region, links, the tag filter, paper order, sections, notes and placement"
```

---

### Task 3.0.3: Every reducer action, and the undo history

**Files:**
- Create: `web/src/model/history.ts`
- Modify: `web/src/model/boardReducer.ts` (rewrite)
- Test: `web/src/model/boardReducer.test.ts` (append; update fixtures that build `BoardState` by hand)

**Interfaces:**
- Consumes: `planDelete` (dissolve), `absoluteIn`, `isNewConnection`, the 2.0 types.
- Produces (3A, 3B, 3C dispatch exactly these; nothing else changes the board):
  - `BoardState = { board: Board; dirty: boolean; revision: number; history: History }`
  - `History = { past: Snapshot[]; future: Snapshot[]; pending: Snapshot | null }`, `Snapshot = { nodes; edges; highlights }`, `UNDO_LIMIT = 100`
  - `TagTarget = "node" | "highlight" | "edge"`, `Removal = { nodeIds?: string[]; edgeIds?: string[]; highlightIds?: string[] }`
  - `BoardAction`, one undo step each: `add { nodes?, edges?, highlights? }`, `addNode { node }`, `addHighlight { highlight }`, `replaceNode { node; merge? }`, `upsertNodes { nodes; merge? }`, `remove` + `Removal`, `removeNode { id }`, `setTags { target; id; tags }`; the gesture rule for `nodes { changes }`; never recorded: `setFigureClip { id; clip; clip_size }`, `setGoal { goal }`, `setView { view }`, `setPaperScroll { scroll }`, `setActiveTags { tags }`, `viewport { viewport }`; plus `load`, `saved`, `undo`, `redo`.
  - `merge: true` joins an edit to the gesture in progress instead of making a step: BoardView's re-parent on drop uses it.

- [ ] **Step 1: Write the failing tests**

Append to `web/src/model/boardReducer.test.ts`. Add to its imports: `type BoardAction, type BoardState` from `./boardReducer`, `UNDO_LIMIT` from `./history`, and `type Board, type BoardEdge, type NoteNode, type Rect` from `./types`.

```ts
const qq = { exact: "x", prefix: "", suffix: "" };
const area = { rects: [{ page: 0, rect: [0, 0, 100, 100] as Rect }], start: qq, end: qq, position: 0, state: "anchored" as const };
const aNote = (id: string, extra: Partial<NoteNode> = {}): BoardNode =>
  ({ id, type: "note", position: { x: 0, y: 0 }, data: { tags: [], collapsed: false, note: `notes/${id}.md`, origin: "reader" }, ...extra } as BoardNode);
const aChunk = (id: string): BoardNode => ({ id, type: "chunk", position: { x: 0, y: 0 }, width: 320, data: { tags: [], collapsed: false, region: area, blocks: [], user_sized: false } });
const aGroup = (id: string, x: number, y: number): BoardNode => ({ id, type: "group", position: { x, y }, width: 400, height: 300, data: { tags: [] } });
const aMark = (id: string): Highlight => ({ id, tags: [], anchor: { rects: [{ page: 0, rect: [10, 10, 50, 20] }], quote: qq, position: 0, state: "anchored" } });
const anEdge = (id: string, from: string, to: string): BoardEdge => ({ id, from, to, data: { tags: [] } });
const opened = (parts: Partial<Board> = {}) => boardReducer(initialBoardState, { type: "load", board: { ...emptyBoard("p"), version: 1, ...parts } });
const run = (state: BoardState, ...actions: BoardAction[]) => actions.reduce(boardReducer, state);

describe("undo and redo (addendum 4.7)", () => {
  it("an edit is one step: undo takes it back and saves, redo puts it again", () => {
    const added = run(opened(), { type: "add", nodes: [aNote("n-1")] });
    const undone = run(added, { type: "undo" });
    expect(undone.board.nodes).toEqual([]);
    expect(undone.dirty).toBe(true);
    expect(undone.revision).toBe(added.revision + 1);
    expect(run(undone, { type: "redo" }).board.nodes.map((n) => n.id)).toEqual(["n-1"]);
  });

  it("a drag is one step, recorded when it stops", () => {
    const s = run(opened({ nodes: [aNote("n-1")] }),
      { type: "nodes", changes: [{ type: "position", id: "n-1", position: { x: 5, y: 5 }, dragging: true }] },
      { type: "nodes", changes: [{ type: "position", id: "n-1", position: { x: 9, y: 9 }, dragging: true }] },
      { type: "nodes", changes: [{ type: "position", id: "n-1", position: { x: 10, y: 10 }, dragging: false }] });
    expect(s.history.past).toHaveLength(1);
    expect(run(s, { type: "undo" }).board.nodes[0].position).toEqual({ x: 0, y: 0 });
  });

  it("a re-parent merged into the drag undoes with it, whichever arrives first", () => {
    const s = run(opened({ nodes: [aGroup("n-g", 100, 100), aNote("n-1")] }),
      { type: "nodes", changes: [{ type: "position", id: "n-1", position: { x: 150, y: 150 }, dragging: true }] },
      { type: "replaceNode", node: aNote("n-1", { parentId: "n-g", position: { x: 50, y: 50 } }), merge: true },
      { type: "nodes", changes: [{ type: "position", id: "n-1", position: { x: 50, y: 50 }, dragging: false }] });
    expect(s.history.past).toHaveLength(1);
    const back = run(s, { type: "undo" }).board.nodes.find((n) => n.id === "n-1")!;
    expect(back.parentId).toBeUndefined();
    expect(back.position).toEqual({ x: 0, y: 0 });
  });

  it("a resize is one step, recorded when it ends", () => {
    const s = run(opened({ nodes: [aNote("n-1")] }),
      { type: "nodes", changes: [{ type: "dimensions", id: "n-1", resizing: true, setAttributes: true, dimensions: { width: 300, height: 90 } }] },
      { type: "nodes", changes: [{ type: "dimensions", id: "n-1", resizing: false, dimensions: { width: 300, height: 90 } }] });
    expect(s.history.past).toHaveLength(1);
    expect(run(s, { type: "undo" }).board.nodes[0].width).toBeUndefined();
  });

  it("selecting and measuring are neither saved nor recorded", () => {
    const start = opened({ nodes: [aNote("n-1")] });
    const s = run(start,
      { type: "nodes", changes: [{ type: "select", id: "n-1", selected: true }] },
      { type: "nodes", changes: [{ type: "dimensions", id: "n-1", dimensions: { width: 200, height: 80 } }] });
    expect(s.history.past).toHaveLength(0);
    expect(s.revision).toBe(start.revision);
  });

  it("view state and the goal are saved but never undone", () => {
    let s = run(opened(), { type: "add", nodes: [aNote("n-1")] },
      { type: "setView", view: "board" }, { type: "setActiveTags", tags: ["t-claim"] },
      { type: "setPaperScroll", scroll: { page: 2, y: 40 } }, { type: "setGoal", goal: "why" },
      { type: "viewport", viewport: { x: 5, y: 6, zoom: 1.5 } });
    expect(s.history.past).toHaveLength(1);
    s = run(s, { type: "undo" });
    expect(s.board.nodes).toEqual([]);
    expect(s.board).toMatchObject({ view: "board", active_tags: ["t-claim"], paper_scroll: { page: 2, y: 40 }, goal: "why", viewport: { x: 5, y: 6, zoom: 1.5 } });
  });

  it("a new edit clears what could be redone", () => {
    const s = run(opened(), { type: "add", nodes: [aNote("n-1")] }, { type: "undo" }, { type: "add", nodes: [aNote("n-2")] });
    expect(s.history.future).toEqual([]);
    expect(run(s, { type: "redo" })).toBe(s);
  });

  it("keeps the last 100 steps, and undo with nothing left changes nothing", () => {
    let s = opened();
    for (let i = 0; i < UNDO_LIMIT + 5; i++) s = run(s, { type: "add", nodes: [aNote(`n-${i}`)] });
    expect(s.history.past).toHaveLength(UNDO_LIMIT);
    for (let i = 0; i < UNDO_LIMIT; i++) s = run(s, { type: "undo" });
    expect(s.board.nodes).toHaveLength(5);
    expect(run(s, { type: "undo" })).toBe(s);
  });

  it("load clears the history, so undo never reaches past a conflict reload", () => {
    const s = run(opened(), { type: "add", nodes: [aNote("n-1")] }, { type: "load", board: { ...emptyBoard("p"), version: 7 } });
    expect(s.history).toEqual({ past: [], future: [], pending: null });
  });

  it("an edit that changes nothing records nothing and saves nothing", () => {
    const start = opened({ nodes: [aNote("n-1")] });
    expect(run(start, { type: "replaceNode", node: aNote("n-missing") })).toBe(start);
    expect(run(start, { type: "add" })).toBe(start);
    expect(run(start, { type: "remove", nodeIds: ["n-missing"] })).toBe(start);
  });
});

describe("add, remove, tags", () => {
  it("add puts nodes, highlights and edges in together, as one step", () => {
    const s = run(opened(), { type: "add", nodes: [aNote("n-1")], highlights: [aMark("h-1")], edges: [anEdge("e-1", "h-1", "n-1")] });
    expect(s.board.edges).toHaveLength(1);
    expect(s.history.past).toHaveLength(1);
  });

  it("add skips a line to itself and a second line between the same two things", () => {
    const s = run(opened({ nodes: [aNote("n-1"), aNote("n-2")], edges: [anEdge("e-1", "n-1", "n-2")] }),
      { type: "add", edges: [anEdge("e-2", "n-2", "n-1"), anEdge("e-3", "n-1", "n-1")] });
    expect(s.board.edges.map((e) => e.id)).toEqual(["e-1"]);
  });

  it("remove dissolves a group in place, drops edges on what it removed, and undoes in one step", () => {
    const child = aNote("n-C", { parentId: "n-G", position: { x: 5, y: 7 } });
    const start = opened({
      nodes: [aGroup("n-G", 100, 100), child, aNote("n-O")], highlights: [aMark("h-1")],
      edges: [anEdge("e-1", "n-C", "n-O"), anEdge("e-2", "n-G", "n-O"), anEdge("e-3", "h-1", "n-O")],
    });
    const s = run(start, { type: "remove", nodeIds: ["n-G"] });
    const lifted = s.board.nodes.find((n) => n.id === "n-C")!;
    expect(lifted.parentId).toBeUndefined();
    expect(lifted.position).toEqual({ x: 105, y: 107 });
    expect(s.board.edges.map((e) => e.id)).toEqual(["e-1", "e-3"]);
    expect(s.board.highlights).toHaveLength(1);
    expect(run(s, { type: "undo" }).board).toEqual(start.board);
  });

  it("removing a highlight drops its edges; removing a chunk keeps the highlights on the paper", () => {
    const start = opened({ nodes: [aChunk("n-c"), aNote("n-1")], highlights: [aMark("h-1")], edges: [anEdge("e-1", "h-1", "n-1")] });
    expect(run(start, { type: "remove", highlightIds: ["h-1"] }).board).toMatchObject({ highlights: [], edges: [] });
    const cut = run(start, { type: "remove", nodeIds: ["n-c"] }).board;
    expect(cut.highlights).toHaveLength(1);
    expect(cut.edges).toHaveLength(1);   // the edge ends on the highlight, not on the chunk that held it (D12)
  });

  it("removes selected edges by id", () => {
    const s = run(opened({ nodes: [aNote("n-1"), aNote("n-2")], edges: [anEdge("e-1", "n-1", "n-2")] }), { type: "remove", edgeIds: ["e-1"] });
    expect(s.board.edges).toEqual([]);
  });

  it("setTags tags a node, a highlight or an edge", () => {
    const s = run(opened({ nodes: [aNote("n-1"), aNote("n-2")], highlights: [aMark("h-1")], edges: [anEdge("e-1", "n-1", "n-2")] }),
      { type: "setTags", target: "node", id: "n-1", tags: ["t-a"] },
      { type: "setTags", target: "highlight", id: "h-1", tags: ["t-b"] },
      { type: "setTags", target: "edge", id: "e-1", tags: ["t-c"] });
    expect(s.board.nodes[0].data.tags).toEqual(["t-a"]);
    expect(s.board.highlights[0].tags).toEqual(["t-b"]);
    expect(s.board.edges[0].data.tags).toEqual(["t-c"]);
    expect(s.history.past).toHaveLength(3);
  });

  it("upsertNodes replaces what exists and appends the rest, as one step", () => {
    const s = run(opened({ nodes: [aGroup("n-t", 0, 0)] }),
      { type: "upsertNodes", nodes: [{ ...aGroup("n-t", 0, 0), height: 900 }, aNote("n-1", { parentId: "n-t" })] });
    expect(s.board.nodes.map((n) => n.id)).toEqual(["n-t", "n-1"]);
    expect(s.board.nodes[0].height).toBe(900);
    expect(s.history.past).toHaveLength(1);
  });

  it("a resize by the reader marks notes and figures user_sized too", () => {
    const s = run(opened({ nodes: [aNote("n-1")] }),
      { type: "nodes", changes: [{ type: "dimensions", id: "n-1", resizing: false, dimensions: { width: 300, height: 90 } }] });
    expect((s.board.nodes[0].data as { user_sized?: boolean }).user_sized).toBe(true);
  });
});

describe("figure clips are outside undo", () => {
  it("setFigureClip fills the clip on the board and in every snapshot, and records nothing", () => {
    const figure: BoardNode = { id: "n-f", type: "figure", position: { x: 0, y: 0 }, width: 320, data: { tags: [], collapsed: true, region: area, caption: "Figure 1", clip: null, clip_size: null } };
    let s = run(opened({ nodes: [figure] }), { type: "add", nodes: [aNote("n-1")] });
    s = run(s, { type: "setFigureClip", id: "n-f", clip: "clips/n-f.png", clip_size: { width: 600, height: 400 } });
    expect(s.history.past).toHaveLength(1);
    expect(s.dirty).toBe(true);
    const inPast = s.history.past[0].nodes.find((n) => n.id === "n-f")!;
    expect(inPast.data).toMatchObject({ clip: "clips/n-f.png" });
    expect(run(s, { type: "undo" }).board.nodes[0].data).toMatchObject({ clip: "clips/n-f.png" });
  });
});
```

Also: if any existing test in the file builds a `BoardState` literal, add `history: { past: [], future: [], pending: null }` to it; delete any test that still refers to `highlights[].note` (gone in schema 2) or dispatches the `edges` action (removed in Step 4).

- [ ] **Step 2: Run them and watch them fail**

Run: `cd web && npm test -- boardReducer`
Expected: FAIL: `./history` does not resolve, and the new action types are unknown.

- [ ] **Step 3: Write `history.ts`**

`web/src/model/history.ts`:

```ts
import type { Board, BoardEdge, BoardNode, Highlight } from "./types";

/** Addendum 4.7: 100 steps, the oldest drops. */
export const UNDO_LIMIT = 100;

/** The board without its view state and without note text: what one undo step restores. */
export type Snapshot = { nodes: BoardNode[]; edges: BoardEdge[]; highlights: Highlight[] };
/** `pending` is the board before a drag or resize began; it becomes a step when the gesture ends. */
export type History = { past: Snapshot[]; future: Snapshot[]; pending: Snapshot | null };

export const emptyHistory: History = { past: [], future: [], pending: null };

export const snapshot = (board: Board): Snapshot => ({ nodes: board.nodes, edges: board.edges, highlights: board.highlights });

export function record(history: History, before: Snapshot): History {
  return { past: [...history.past, before].slice(-UNDO_LIMIT), future: [], pending: null };
}

export function begin(history: History, before: Snapshot): History {
  return history.pending ? history : { ...history, pending: before };
}

type Step = { history: History; restore: Snapshot };

export function undo(history: History, current: Snapshot): Step | null {
  const restore = history.past.at(-1);
  if (!restore) return null;
  return { history: { past: history.past.slice(0, -1), future: [current, ...history.future], pending: null }, restore };
}

export function redo(history: History, current: Snapshot): Step | null {
  const restore = history.future[0];
  if (!restore) return null;
  return { history: { past: [...history.past, current].slice(-UNDO_LIMIT), future: history.future.slice(1), pending: null }, restore };
}

/** Apply a change that is outside undo, such as a figure's clip landing, to every snapshot too. */
export function patchNodes(history: History, patch: (node: BoardNode) => BoardNode): History {
  const apply = (s: Snapshot): Snapshot => ({ ...s, nodes: s.nodes.map(patch) });
  return { past: history.past.map(apply), future: history.future.map(apply), pending: history.pending && apply(history.pending) };
}
```

- [ ] **Step 4: Rewrite `boardReducer.ts`**

`web/src/model/boardReducer.ts`, whole file:

```ts
import { applyNodeChanges, type NodeChange } from "@xyflow/react";
import { planDelete } from "./dissolve";
import { begin, emptyHistory, patchNodes, record, redo, snapshot, undo, type History } from "./history";
import { isNewConnection } from "./links";
import { absoluteIn } from "./reparent";
import { emptyBoard, type Board, type BoardEdge, type BoardNode, type Highlight, type PaperScroll, type View, type Viewport } from "./types";

/** `revision` counts the reader's saveable changes. It never resets, so a "saved" can tell whether the
 *  snapshot it saved is still the latest one. */
export type BoardState = { board: Board; dirty: boolean; revision: number; history: History };
export const initialBoardState: BoardState = { board: emptyBoard(""), dirty: false, revision: 0, history: emptyHistory };

export type TagTarget = "node" | "highlight" | "edge";
export type Removal = { nodeIds?: string[]; edgeIds?: string[]; highlightIds?: string[] };
export type FigureClip = { id: string; clip: string; clip_size: { width: number; height: number } };

/** What the reader made or changed: one undo step each, unless `merge` joins it to the gesture in progress. */
type EditAction =
  | { type: "add"; nodes?: BoardNode[]; edges?: BoardEdge[]; highlights?: Highlight[] }
  | { type: "addNode"; node: BoardNode }
  | { type: "addHighlight"; highlight: Highlight }
  | { type: "replaceNode"; node: BoardNode; merge?: boolean }
  | { type: "upsertNodes"; nodes: BoardNode[]; merge?: boolean }
  | ({ type: "remove" } & Removal)
  | { type: "removeNode"; id: string }
  | { type: "setTags"; target: TagTarget; id: string; tags: string[] };

export type BoardAction =
  | EditAction
  | { type: "load"; board: Board }
  | { type: "saved"; version: number; revision?: number }
  | { type: "nodes"; changes: NodeChange<BoardNode>[] }
  | ({ type: "setFigureClip" } & FigureClip)
  | { type: "setGoal"; goal: string }
  | { type: "setView"; view: View }
  | { type: "setPaperScroll"; scroll: PaperScroll | null }
  | { type: "setActiveTags"; tags: string[] }
  | { type: "viewport"; viewport: Viewport }
  | { type: "undo" }
  | { type: "redo" };

const DIRTYING_NODE_CHANGES = new Set(["position", "remove", "add", "replace"]);

/** React Flow (12.11) emits "dimensions" three ways; only the end of a resize and an expanding parent save. */
function isSavedDimensionsChange(c: NodeChange<BoardNode>): boolean {
  if (c.type !== "dimensions") return false;
  if (c.resizing === false) return true;
  return Boolean(c.setAttributes) && c.resizing !== true;
}

function dirtiesNodes(c: NodeChange<BoardNode>): boolean {
  if (c.type === "dimensions") return isSavedDimensionsChange(c);
  return DIRTYING_NODE_CHANGES.has(c.type) && !("dragging" in c && c.dragging);
}

/** A frame of a drag or a resize: the gesture is in progress and is recorded when it ends. */
function isGestureStep(c: NodeChange<BoardNode>): boolean {
  return (c.type === "position" && c.dragging === true) || (c.type === "dimensions" && c.resizing === true);
}

/** Once the reader resizes a piece it keeps that size (addendum 4.2, 4.1): chunks, figures and notes. */
function markUserSized(nodes: BoardNode[], changes: NodeChange<BoardNode>[]): BoardNode[] {
  const resized = new Set(changes.filter((c) => c.type === "dimensions" && c.resizing !== undefined).map((c) => (c as { id: string }).id));
  if (!resized.size) return nodes;
  return nodes.map((n) => (n.type !== "group" && resized.has(n.id) && !n.data.user_sized ? ({ ...n, data: { ...n.data, user_sized: true } } as BoardNode) : n));
}

function next(state: BoardState, board: Board): BoardState {
  return { ...state, board, dirty: true, revision: state.revision + 1 };
}

function applyNodes(state: BoardState, changes: NodeChange<BoardNode>[]): BoardState {
  const board = { ...state.board, nodes: markUserSized(applyNodeChanges(changes, state.board.nodes) as BoardNode[], changes) };
  if (!changes.some(dirtiesNodes)) {
    const history = changes.some(isGestureStep) ? begin(state.history, snapshot(state.board)) : state.history;
    return { ...state, board, history };
  }
  return { ...next(state, board), history: record(state.history, state.history.pending ?? snapshot(state.board)) };
}

function addThings(board: Board, { nodes = [], edges = [], highlights = [] }: { nodes?: BoardNode[]; edges?: BoardEdge[]; highlights?: Highlight[] }): Board {
  const fresh: BoardEdge[] = [];
  for (const edge of edges) if (isNewConnection([...board.edges, ...fresh], edge)) fresh.push(edge);
  if (!nodes.length && !fresh.length && !highlights.length) return board;
  return { ...board, nodes: [...board.nodes, ...nodes], edges: [...board.edges, ...fresh], highlights: [...board.highlights, ...highlights] };
}

function upsert(board: Board, nodes: BoardNode[], appendMissing: boolean): Board {
  const present = new Set(board.nodes.map((n) => n.id));
  const added = appendMissing ? nodes.filter((n) => !present.has(n.id)) : [];
  if (!nodes.some((n) => present.has(n.id)) && !added.length) return board;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return { ...board, nodes: [...board.nodes.map((n) => byId.get(n.id) ?? n), ...added] };
}

/** Delete (addendum 4.7): a group dissolves in place (4.2); edges with an end on a removed node or highlight go;
 *  a chunk's removal never removes a highlight. */
function removeThings(board: Board, { nodeIds = [], edgeIds = [], highlightIds = [] }: Removal): Board {
  // planDelete removes the nodes marked selected: here, exactly the ones asked for.
  const chosen = board.nodes.filter((n) => nodeIds.includes(n.id)).map((n) => ({ ...n, selected: true }) as BoardNode);
  const plan = planDelete(board.nodes, chosen, [], absoluteIn(board.nodes));
  const removed = new Set(plan.nodes.map((n) => n.id));
  const gone = new Set([...removed, ...highlightIds]);
  const edges = board.edges.filter((e) => !edgeIds.includes(e.id) && !gone.has(e.from) && !gone.has(e.to));
  const highlights = board.highlights.filter((h) => !highlightIds.includes(h.id));
  if (!removed.size && edges.length === board.edges.length && highlights.length === board.highlights.length) return board;
  const lifted = new Map(plan.lifted.map((n) => [n.id, n]));
  return { ...board, nodes: board.nodes.filter((n) => !removed.has(n.id)).map((n) => lifted.get(n.id) ?? n), edges, highlights };
}

function setTags(board: Board, target: TagTarget, id: string, tags: string[]): Board {
  if (target === "node") return { ...board, nodes: board.nodes.map((n) => (n.id === id ? ({ ...n, data: { ...n.data, tags } } as BoardNode) : n)) };
  if (target === "highlight") return { ...board, highlights: board.highlights.map((h) => (h.id === id ? { ...h, tags } : h)) };
  return { ...board, edges: board.edges.map((e) => (e.id === id ? { ...e, data: { ...e.data, tags } } : e)) };
}

function applyEdit(board: Board, action: EditAction): Board {
  switch (action.type) {
    case "add": return addThings(board, action);
    case "addNode": return addThings(board, { nodes: [action.node] });
    case "addHighlight": return addThings(board, { highlights: [action.highlight] });
    case "replaceNode": return upsert(board, [action.node], false);
    case "upsertNodes": return upsert(board, action.nodes, true);
    case "remove": return removeThings(board, action);
    case "removeNode": return removeThings(board, { nodeIds: [action.id] });
    case "setTags": return setTags(board, action.target, action.id, action.tags);
  }
}

function edit(state: BoardState, action: EditAction): BoardState {
  const board = applyEdit(state.board, action);
  if (board === state.board) return state;
  const merge = "merge" in action && action.merge === true;
  return { ...next(state, board), history: merge ? state.history : record(state.history, snapshot(state.board)) };
}

function travel(state: BoardState, direction: "undo" | "redo"): BoardState {
  const step = (direction === "undo" ? undo : redo)(state.history, snapshot(state.board));
  if (!step) return state;
  return { ...next(state, { ...state.board, ...step.restore }), history: step.history };
}

/** Saved on the usual debounce, never an undo step: view state (addendum 4) and the goal's text. */
function unrecorded(state: BoardState, patch: Partial<Board>): BoardState {
  return next(state, { ...state.board, ...patch });
}

function figureClip(state: BoardState, { id, clip, clip_size }: FigureClip): BoardState {
  const patch = (n: BoardNode): BoardNode => (n.id === id && n.type === "figure" ? { ...n, data: { ...n.data, clip, clip_size } } : n);
  const history = patchNodes(state.history, patch);
  if (!state.board.nodes.some((n) => n.id === id)) return { ...state, history };
  return { ...next(state, { ...state.board, nodes: state.board.nodes.map(patch) }), history };
}

const sameViewport = (a: Viewport, b: Viewport) => a.x === b.x && a.y === b.y && a.zoom === b.zoom;

export function boardReducer(state: BoardState, action: BoardAction): BoardState {
  const { board } = state;
  switch (action.type) {
    case "load":
      return { board: action.board, dirty: false, revision: state.revision, history: emptyHistory };
    case "saved": {
      // A save without a revision (or of the latest revision) settles the board; an older one does not.
      const current = action.revision === undefined || action.revision === state.revision;
      return { ...state, board: { ...board, version: action.version }, dirty: state.dirty && !current };
    }
    case "nodes": return applyNodes(state, action.changes);
    case "setFigureClip": return figureClip(state, action);
    case "setGoal": return unrecorded(state, { goal: action.goal });
    case "setView": return board.view === action.view ? state : unrecorded(state, { view: action.view });
    case "setPaperScroll": return unrecorded(state, { paper_scroll: action.scroll });
    case "setActiveTags": return unrecorded(state, { active_tags: action.tags });
    case "viewport": return sameViewport(board.viewport, action.viewport) ? state : unrecorded(state, { viewport: action.viewport });
    case "undo":
    case "redo": return travel(state, action.type);
    default: return edit(state, action);
  }
}
```

The `edges` action (React Flow edge changes) is gone: schema 2 edges are not React Flow's, and edge selection is BoardView's own state from 3B.2.

- [ ] **Step 5: Run the reducer tests**

Run: `cd web && npm test -- boardReducer`
Expected: all pass, old and new.

- [ ] **Step 6: Fix the call sites the build names**

Run: `cd web && npm run build`
Expected: tsc errors only where code outside `model/` dispatched the removed `edges` action (BoardView's `onEdgesChange`) or built a `BoardState` without `history`. Make the smallest change that compiles: delete `onEdgesChange={(changes) => dispatch({ type: "edges", changes })}` from `web/src/board/BoardView.tsx` (3B.2 replaces it with local edge selection). Commit that separately:

```bash
git add web/src/board/BoardView.tsx
git commit -m "refactor(web): BoardView stops dispatching the removed edges action (mechanical, for 3.0.3)"
```

- [ ] **Step 7: Run everything and commit**

Run: `cd web && npm test && npm run build`
Expected: all pass.

```bash
git add web/src/model
git commit -m "feat(web): every board action, one undo step per gesture, view state saved but never undone"
```

---

### Task 3.0.4: The tray, the slots, first open and split

**Files:**
- Create: `web/src/model/tray.ts`, `web/src/state/split.ts`
- Test: `web/src/model/tray.test.ts`, `web/src/state/split.test.ts`

**Interfaces:**
- Consumes: `trayOrder`, `newId`, `api.split`, `api.getTemplate`, `api.putClip`, `CLIP_DPI`, the `setFigureClip` action.
- Produces:
  - `TRAY_NAME = "Paper"`, `TRAY_PAD = 20`, `TRAY_TOP = 48`, `TRAY_STEP = 44`, `TRAY_PIECE_WIDTH = 320`, `TRAY_WIDTH = 360`, `SLOT_WIDTH = 400`, `SLOT_HEIGHT = 300`, `SLOT_GAP = 24`, `SLOT_COLUMNS = 3`, `SLOTS_OFFSET = 60`
  - `trayRow(index: number): XY` (relative to the tray), `trayHeight(rows: number): number`, `findTray(nodes: BoardNode[]): GroupNode | undefined`
  - `firstLayout(drafts: SplitDraft[], template: TemplateFile, source: Source): BoardNode[]`: `[tray, ...pieces, ...slots]`, ids minted
  - `splitIntoTray(board: Board, drafts: SplitDraft[], source: Source): BoardNode[]`: `[tray (existing and grown, or new), ...pieces]`
  - `planFirstOpen(paperId: string, source: Source): Promise<BoardNode[]>`
  - `planSplit(paperId: string, source: Source, board: () => Board, flush: () => Promise<void>): Promise<BoardNode[]>`
  - `storeFigureClips(paperId: string, nodes: BoardNode[], dispatch: Dispatch<BoardAction>): Promise<string[]>`: the ids that failed
  - `CLIP_FAILED_MESSAGE(count: number): string`

The client places the tray's rows itself, at `trayRow(index)` for the piece's index in `trayOrder(source)`, and ignores the drafts' own `position`. That keeps the ghost rows of 3B.4 exactly in their sections' places without the client knowing the server's spacing. The server's positions follow the same rule (one column, paper order, each piece at its own index), so nothing is lost.

- [ ] **Step 1: Write the failing tests**

`web/src/model/tray.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  findTray, firstLayout, SLOT_GAP, SLOT_HEIGHT, SLOT_WIDTH, SLOTS_OFFSET, splitIntoTray,
  TRAY_NAME, TRAY_PIECE_WIDTH, TRAY_WIDTH, trayHeight, trayRow,
} from "./tray";
import { emptyBoard, type BoardNode, type GroupNode, type Rect, type Source, type SplitDraft, type TemplateFile } from "./types";

const q = { exact: "x", prefix: "", suffix: "" };
const pr = (page: number, rect: Rect) => ({ page, rect });
const section = (id: string, y: number) => ({ id, number: id.slice(4), depth: 1, title: id, heading_rect: pr(0, [60, y, 200, y + 10]), extent: [pr(0, [60, y, 500, y + 100])], text: "" });
const source = {
  regions: [{ page: 0, rect: [50, 50, 560, 700], label: "text" }],
  sections: [section("sec-1", 100), section("sec-2", 400)],
  figures: [{ id: "fig-1", kind: "figure", label: "Figure 1", caption: "Figure 1: x", caption_rect: null, rect: pr(0, [60, 250, 500, 350]), confidence: "region" }],
} as unknown as Source;
const region = (y: number) => ({ rects: [pr(0, [60, y, 500, y + 100])], start: q, end: q, position: 0, state: "anchored" as const });
const draft = (source_id: string, y: number, type: "chunk" | "figure" = "chunk"): SplitDraft => (type === "chunk"
  ? { type, position: { x: 0, y: 999 }, data: { tags: [], collapsed: true, region: region(y), blocks: [], user_sized: false, source_id } }
  : { type, position: { x: 0, y: 999 }, data: { tags: [], collapsed: true, region: region(y), caption: "Figure 1: x", clip: null, clip_size: null, source_id } });
const template: TemplateFile = { schema: 1, slots: Array.from({ length: 9 }, (_, i) => ({ name: `Slot ${i}`, prompt: `Question ${i}?` })) };
const sourceId = (n: BoardNode) => (n.data as { source_id?: string }).source_id;

describe("first layout (D15, addendum 4.9)", () => {
  it("is the tray, its pieces at their paper-order rows, then nine slots in three columns to its right", () => {
    const [tray, ...rest] = firstLayout([draft("sec-2", 400), draft("fig-1", 250, "figure"), draft("sec-1", 100)], template, source);
    expect(tray).toMatchObject({ type: "group", position: { x: 0, y: 0 }, width: TRAY_WIDTH, height: trayHeight(3), data: { name: TRAY_NAME, tray: true } });
    const pieces = rest.filter((n) => n.parentId === tray.id);
    expect(pieces.map(sourceId)).toEqual(["sec-2", "fig-1", "sec-1"]);
    expect(pieces.map((n) => n.position)).toEqual([trayRow(2), trayRow(1), trayRow(0)]);
    expect(pieces.every((n) => n.width === TRAY_PIECE_WIDTH && n.id.startsWith("n-"))).toBe(true);
    const slots = rest.filter((n): n is GroupNode => n.type === "group");
    expect(slots).toHaveLength(9);
    expect(slots[0]).toMatchObject({ position: { x: TRAY_WIDTH + SLOTS_OFFSET, y: 0 }, width: SLOT_WIDTH, height: SLOT_HEIGHT, data: { name: "Slot 0", prompt: "Question 0?" } });
    expect(slots[4].position).toEqual({ x: TRAY_WIDTH + SLOTS_OFFSET + SLOT_WIDTH + SLOT_GAP, y: SLOT_HEIGHT + SLOT_GAP });
    expect(slots.every((g) => !g.parentId && !g.data.tray)).toBe(true);
  });
});

describe("split into the tray (D16)", () => {
  const tray = (height: number): BoardNode => ({ id: "n-tray", type: "group", position: { x: 10, y: 10 }, width: TRAY_WIDTH, height, data: { tags: [], name: TRAY_NAME, tray: true } });

  it("grows the tray to hold every row and adds the pieces as its children", () => {
    const [grown, piece] = splitIntoTray({ ...emptyBoard("p"), nodes: [tray(50)] }, [draft("fig-1", 250, "figure")], source);
    expect(grown).toMatchObject({ id: "n-tray", height: trayHeight(3) });
    expect(piece).toMatchObject({ type: "figure", parentId: "n-tray", position: trayRow(1) });
  });
  it("never shrinks a tray the reader made bigger", () => {
    expect(splitIntoTray({ ...emptyBoard("p"), nodes: [tray(5000)] }, [draft("sec-1", 100)], source)[0].height).toBe(5000);
  });
  it("makes a new tray left of everything when the board has none", () => {
    const other: BoardNode = { id: "n-g", type: "group", position: { x: 500, y: 80 }, width: 400, height: 300, data: { tags: [] } };
    const [made] = splitIntoTray({ ...emptyBoard("p"), nodes: [other] }, [draft("sec-1", 100)], source);
    expect(made).toMatchObject({ position: { x: 500 - TRAY_WIDTH - SLOTS_OFFSET, y: 80 }, data: { tray: true, name: TRAY_NAME } });
    expect(made.id).not.toBe("n-g");
  });
  it("the tray is the first group marked tray", () => {
    expect(findTray([{ ...tray(50), id: "n-a", data: { tags: [] } }, tray(50)])?.id).toBe("n-tray");
    expect(findTray([])).toBeUndefined();
  });
});
```

`web/src/state/split.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyBoard, type BoardNode, type Rect, type Source } from "../model/types";

vi.mock("../api/client", () => ({ CLIP_DPI: 216, api: { split: vi.fn(), getTemplate: vi.fn(), putClip: vi.fn() } }));
import { api } from "../api/client";
import { planFirstOpen, planSplit, storeFigureClips } from "./split";

const q = { exact: "x", prefix: "", suffix: "" };
const region = { rects: [{ page: 1, rect: [60, 250, 500, 350] as Rect }], start: q, end: q, position: 0, state: "anchored" as const };
const source = { regions: [], sections: [], figures: [] } as unknown as Source;
const figure = (id: string, clip: string | null = null): BoardNode => ({ id, type: "figure", position: { x: 0, y: 0 }, data: { tags: [], collapsed: true, region, caption: "c", clip, clip_size: null } });

beforeEach(() => { vi.clearAllMocks(); vi.spyOn(console, "error").mockImplementation(() => undefined); });

describe("first open and split", () => {
  it("planFirstOpen asks for the drafts and the template, and lays them out", async () => {
    vi.mocked(api.split).mockResolvedValue({ nodes: [{ type: "figure", position: { x: 0, y: 0 }, data: { ...figure("x").data, source_id: "fig-1" } as never }] });
    vi.mocked(api.getTemplate).mockResolvedValue({ schema: 1, slots: [{ name: "A", prompt: "a?" }, { name: "B", prompt: "b?" }] });
    const nodes = await planFirstOpen("p", source);
    expect(nodes.map((n) => n.type)).toEqual(["group", "figure", "group", "group"]);
  });
  it("planSplit saves pending changes before asking the server, and adds nothing when nothing is missing", async () => {
    const order: string[] = [];
    vi.mocked(api.split).mockImplementation(async () => { order.push("split"); return { nodes: [] }; });
    expect(await planSplit("p", source, () => emptyBoard("p"), async () => { order.push("flush"); })).toEqual([]);
    expect(order).toEqual(["flush", "split"]);
  });
  it("storeFigureClips stores each figure that has no clip at 216 dpi, and returns the ones that failed", async () => {
    vi.mocked(api.putClip)
      .mockResolvedValueOnce({ clip: "clips/n-f1.png", clip_size: { width: 3, height: 4 } })
      .mockRejectedValueOnce(new Error("render failed"));
    const dispatch = vi.fn();
    const failed = await storeFigureClips("p", [figure("n-f1"), figure("n-f2"), figure("n-f3", "clips/n-f3.png")], dispatch);
    expect(api.putClip).toHaveBeenCalledTimes(2);
    expect(api.putClip).toHaveBeenCalledWith("p", "n-f1", region.rects[0], 216);
    expect(dispatch).toHaveBeenCalledWith({ type: "setFigureClip", id: "n-f1", clip: "clips/n-f1.png", clip_size: { width: 3, height: 4 } });
    expect(failed).toEqual(["n-f2"]);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd web && npm test -- tray split`
Expected: FAIL, `./tray` and `./split` do not resolve.

- [ ] **Step 3: Write `tray.ts` and `split.ts`**

`web/src/model/tray.ts`:

```ts
import { newId } from "./ids";
import { trayOrder } from "./paperOrder";
import type { XY } from "./reparent";
import type { Board, BoardNode, GroupNode, Source, SplitDraft, TemplateFile } from "./types";

export const TRAY_NAME = "Paper";
export const TRAY_PAD = 20;
export const TRAY_TOP = 48;                // below the group's name
export const TRAY_STEP = 44;               // a collapsed piece and a gap
export const TRAY_PIECE_WIDTH = 320;
export const TRAY_WIDTH = TRAY_PIECE_WIDTH + 2 * TRAY_PAD;
export const SLOT_WIDTH = 400;
export const SLOT_HEIGHT = 300;
export const SLOT_GAP = 24;
export const SLOT_COLUMNS = 3;
export const SLOTS_OFFSET = 60;            // between the tray and the first column of slots

/** A row of the tray, relative to the tray: one column in paper order, each piece at its own index (addendum 6). */
export const trayRow = (index: number): XY => ({ x: TRAY_PAD, y: TRAY_TOP + index * TRAY_STEP });
export const trayHeight = (rows: number): number => TRAY_TOP + rows * TRAY_STEP + TRAY_PAD;

export function findTray(nodes: BoardNode[]): GroupNode | undefined {
  return nodes.find((n): n is GroupNode => n.type === "group" && n.data.tray === true);
}

function newGroup(position: XY, width: number, height: number, data: GroupNode["data"]): GroupNode {
  return { id: newId("n"), type: "group", position, width, height, data };
}

/** Split drafts become the tray's children at their paper-order rows. Drafts carry no id; the client mints them. */
function placeInTray(drafts: SplitDraft[], order: string[], trayId: string): BoardNode[] {
  return drafts.map((draft, i) => {
    const at = order.indexOf(draft.data.source_id ?? "");
    const row = at === -1 ? order.length + i : at;
    return { ...draft, id: newId("n"), parentId: trayId, position: trayRow(row), width: TRAY_PIECE_WIDTH } as BoardNode;
  });
}

function slotGroups(template: TemplateFile, left: number): GroupNode[] {
  return template.slots.map((slot, i) => newGroup(
    { x: left + (i % SLOT_COLUMNS) * (SLOT_WIDTH + SLOT_GAP), y: Math.floor(i / SLOT_COLUMNS) * (SLOT_HEIGHT + SLOT_GAP) },
    SLOT_WIDTH, SLOT_HEIGHT, { tags: [], name: slot.name, prompt: slot.prompt }));
}

/** First open (D15): the tray on the left holding every piece, the template's slots in a grid to its right. */
export function firstLayout(drafts: SplitDraft[], template: TemplateFile, source: Source): BoardNode[] {
  const order = trayOrder(source);
  const tray = newGroup({ x: 0, y: 0 }, TRAY_WIDTH, trayHeight(order.length), { tags: [], name: TRAY_NAME, tray: true });
  return [tray, ...placeInTray(drafts, order, tray.id), ...slotGroups(template, TRAY_WIDTH + SLOTS_OFFSET)];
}

function leftOfEverything(nodes: BoardNode[]): XY {
  const top = nodes.filter((n) => !n.parentId);
  if (!top.length) return { x: 0, y: 0 };
  return { x: Math.min(...top.map((n) => n.position.x)) - TRAY_WIDTH - SLOTS_OFFSET, y: Math.min(...top.map((n) => n.position.y)) };
}

/** Split (D16): the tray grown to hold every row (never shrunk), or a new one left of everything, then the new pieces in it. */
export function splitIntoTray(board: Board, drafts: SplitDraft[], source: Source): BoardNode[] {
  const order = trayOrder(source);
  const needed = trayHeight(order.length);
  const existing = findTray(board.nodes);
  const tray = existing
    ? { ...existing, height: Math.max(existing.height ?? 0, needed) }
    : newGroup(leftOfEverything(board.nodes), TRAY_WIDTH, needed, { tags: [], name: TRAY_NAME, tray: true });
  return [tray, ...placeInTray(drafts, order, tray.id)];
}
```

`web/src/state/split.ts`:

```ts
import type { Dispatch } from "react";
import { api, CLIP_DPI } from "../api/client";
import type { BoardAction } from "../model/boardReducer";
import { firstLayout, splitIntoTray } from "../model/tray";
import type { Board, BoardNode, Source } from "../model/types";

export const CLIP_FAILED_MESSAGE = (count: number) =>
  `${count} figure image${count === 1 ? "" : "s"} could not be made. Cut ${count === 1 ? "it" : "them"} again from the paper.`;

/** First open (D15): every section and figure from the server, and the template, laid out. Writes nothing. */
export async function planFirstOpen(paperId: string, source: Source): Promise<BoardNode[]> {
  const [{ nodes: drafts }, template] = await Promise.all([api.split(paperId), api.getTemplate()]);
  return firstLayout(drafts, template, source);
}

/** Split (D16) reads the board as saved, so pending changes are saved first (addendum 6). */
export async function planSplit(paperId: string, source: Source, board: () => Board, flush: () => Promise<void>): Promise<BoardNode[]> {
  await flush();
  const { nodes: drafts } = await api.split(paperId);
  return drafts.length ? splitIntoTray(board(), drafts, source) : [];
}

/** Clip files are outside undo (addendum 4.7, 4.9): each lands with setFigureClip. Returns the ids that failed. */
export async function storeFigureClips(paperId: string, nodes: BoardNode[], dispatch: Dispatch<BoardAction>): Promise<string[]> {
  const failed: string[] = [];
  for (const node of nodes) {
    if (node.type !== "figure" || node.data.clip) continue;
    try {
      const { clip, clip_size } = await api.putClip(paperId, node.id, node.data.region.rects[0], CLIP_DPI);
      dispatch({ type: "setFigureClip", id: node.id, clip, clip_size });
    } catch (error) {
      console.error(`Could not store the clip for ${node.id}`, error);
      failed.push(node.id);
    }
  }
  return failed;
}
```

- [ ] **Step 4: Run the tests**

Run: `cd web && npm test -- tray split`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add web/src/model/tray.ts web/src/model/tray.test.ts web/src/state/split.ts web/src/state/split.test.ts
git commit -m "feat(web): the tray, the template's slots, first open and split into the tray"
```

---

### Task 3.0.5: The note store, the tags provider and picker, and the board provider

**Files:**
- Create: `web/src/state/notes.ts`, `web/src/state/keys.ts`, `web/src/state/TagsProvider.tsx`, `web/src/tags/TagPicker.tsx`, `web/src/tags/TagChips.tsx`, `web/src/styles/tags.css`
- Modify: `web/src/state/BoardProvider.tsx`, `web/src/main.tsx`, `web/src/styles.css`, `web/e2e/step3.spec.ts`, `web/e2e/restyle.spec.ts`
- Test: `web/src/state/notes.test.ts`, `web/src/state/keys.test.ts`, `web/src/state/TagsProvider.test.tsx`, `web/src/state/BoardProvider.test.tsx` (update mocks, append)

**Interfaces:**
- Consumes: `api.getNote`, `api.putNote`, `api.getTags`, `api.putTags`, `newId("t")`, 3.0.4's `planFirstOpen`, `planSplit`, `storeFigureClips`.
- Produces:
  - `NoteStore = { peek(id): string | undefined; load(id): Promise<string>; save(id, markdown): Promise<void>; settled(): Promise<void>; subscribe(listener): () => void }`; `createNoteStore(io: NoteIO): NoteStore`; `noteIO(paperId): NoteIO`
  - `useBoard()` gains `notes: NoteStore`, `flush(): Promise<void>` (board save plus note writes), `split(): Promise<number>` (pieces added)
  - `useNote(nodeId: string): { text: string | undefined; error: string | null; save(markdown: string): Promise<void> }` from `web/src/state/BoardProvider.tsx`
  - `TagsProvider`, `useTags(): { tags: Tag[]; byId: ReadonlyMap<string, Tag>; error: string | null; add(name): Promise<Tag>; update(tag): Promise<void>; remove(id): Promise<void> }`, `NEW_TAG_COLOUR`, `TAGS_FAILED_MESSAGE`
  - `<TagPicker value: string[] onChange(ids) />`, `<TagChips ids: string[] />`; CSS classes `.chips`, `.chip`, `.tag-picker`, `.tag-error`
  - `isTextField(target: EventTarget | null): boolean` from `web/src/state/keys.ts`: true for an input, textarea, select or contenteditable, whose own keys (undo, Delete) must win
  - Messages: `FIRST_OPEN_FAILED_MESSAGE`, `NOTE_LOAD_FAILED_MESSAGE`, `NOTE_SAVE_FAILED_MESSAGE` from `BoardProvider.tsx`
  - First open: a board whose `version` is 0 is laid out once, as one undo step, before the views see it; figure clips follow.

- [ ] **Step 1: Write the failing tests**

`web/src/state/notes.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { createNoteStore } from "./notes";

describe("the note store", () => {
  it("loads a note once and shares it", async () => {
    const get = vi.fn(async () => "text");
    const store = createNoteStore({ get, put: vi.fn() });
    await Promise.all([store.load("n-1"), store.load("n-1")]);
    expect(get).toHaveBeenCalledTimes(1);
    expect(store.peek("n-1")).toBe("text");
  });
  it("save shows the new text at once and tells subscribers", async () => {
    const store = createNoteStore({ get: vi.fn(), put: vi.fn(async () => undefined) });
    const listener = vi.fn();
    store.subscribe(listener);
    const saving = store.save("n-1", "mine");
    expect(store.peek("n-1")).toBe("mine");
    expect(listener).toHaveBeenCalled();
    await saving;
  });
  it("a failed write rejects for its caller but does not stop the next; settled waits for both", async () => {
    const put = vi.fn().mockRejectedValueOnce(new Error("down")).mockResolvedValue(undefined);
    const store = createNoteStore({ get: vi.fn(), put });
    await expect(store.save("n-1", "a")).rejects.toThrow("down");
    await store.save("n-1", "b");
    await store.settled();
    expect(put).toHaveBeenNthCalledWith(2, "n-1", "b");
  });
  it("a failed load can be tried again", async () => {
    const get = vi.fn().mockRejectedValueOnce(new Error("down")).mockResolvedValue("ok");
    const store = createNoteStore({ get, put: vi.fn() });
    await expect(store.load("n-1")).rejects.toThrow("down");
    expect(await store.load("n-1")).toBe("ok");
  });
});
```

`web/src/state/keys.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isTextField } from "./keys";

describe("isTextField", () => {
  it("is true where typing happens, false elsewhere", () => {
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    for (const tag of ["input", "textarea", "select"]) expect(isTextField(document.createElement(tag))).toBe(true);
    expect(isTextField(editable)).toBe(true);
    expect(isTextField(document.createElement("button"))).toBe(false);
    expect(isTextField(document.body)).toBe(false);
    expect(isTextField(null)).toBe(false);
  });
});
```

`web/src/state/TagsProvider.test.tsx`:

```tsx
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Tag, TagFile } from "../model/types";

const claim: Tag = { id: "t-claim", name: "claim", colour: "#B91C1C" };
vi.mock("../api/client", () => ({
  api: { getTags: vi.fn(async () => ({ schema: 1, tags: [claim] })), putTags: vi.fn(async (file: TagFile) => file) },
}));
import { api } from "../api/client";
import { TagChips } from "../tags/TagChips";
import { TagPicker } from "../tags/TagPicker";
import { TAGS_FAILED_MESSAGE, TagsProvider, useTags } from "./TagsProvider";

let ctx: ReturnType<typeof useTags> | null = null;
function Probe() { ctx = useTags(); return null; }
afterEach(() => { cleanup(); ctx = null; vi.clearAllMocks(); });

describe("TagsProvider", () => {
  it("loads the global tags, adds one with a minted id, and saves the whole list", async () => {
    render(<TagsProvider><Probe /></TagsProvider>);
    await waitFor(() => expect(ctx!.tags).toEqual([claim]));
    let added: Tag | null = null;
    await act(async () => { added = await ctx!.add("pass 3"); });
    expect(added!.id).toMatch(/^t-/);
    expect(api.putTags).toHaveBeenLastCalledWith({ schema: 1, tags: [claim, added] });
  });
  it("shows an error when a save fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(api.putTags).mockRejectedValueOnce(new Error("down"));
    render(<TagsProvider><Probe /></TagsProvider>);
    await waitFor(() => expect(ctx!.tags).toHaveLength(1));
    await act(async () => { await ctx!.remove("t-claim"); });
    expect(ctx!.error).toBe(TAGS_FAILED_MESSAGE);
  });
  it("chips ignore a tag id nobody defines any more (addendum 4.3)", async () => {
    const { container } = render(<TagsProvider><TagChips ids={["t-claim", "t-deleted"]} /></TagsProvider>);
    await waitFor(() => expect(container.querySelectorAll(".chip")).toHaveLength(1));
  });
  it("the picker toggles a tag, and a new tag is added and checked", async () => {
    const onChange = vi.fn();
    render(<TagsProvider><TagPicker value={[]} onChange={onChange} /></TagsProvider>);
    fireEvent.click(await screen.findByLabelText("claim"));
    expect(onChange).toHaveBeenLastCalledWith(["t-claim"]);
    fireEvent.change(screen.getByLabelText("New tag"), { target: { value: "pass 3" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Add" })); });
    expect(onChange).toHaveBeenLastCalledWith([expect.stringMatching(/^t-/)]);
  });
});
```

In `web/src/state/BoardProvider.test.tsx`, replace the `vi.mock` block so a saved board is the default and the new calls exist:

```tsx
vi.mock("../api/client", () => ({
  CLIP_DPI: 216,
  api: {
    getSource: vi.fn(async () => source),
    getBoard: vi.fn(async () => ({ ...emptyBoard("p"), version: 1 })),
    putBoard: vi.fn(async () => ({ version: 2 })),
    split: vi.fn(async () => ({ nodes: [] })),
    getTemplate: vi.fn(async () => ({ schema: 1, slots: [{ name: "Main point", prompt: "What is it?" }] })),
    putClip: vi.fn(),
    getNote: vi.fn(async () => ({ markdown: "" })),
    putNote: vi.fn(async () => undefined),
  },
}));
```

and update its `highlight` fixture to schema 2 if 2.0 has not (`anchor: { rects: [{ page: 0, rect: [0, 0, 1, 1] }], quote: q, position: 0, state: "anchored" }`, no `note`). Then append (import `StrictMode` from `react` and `FIRST_OPEN_FAILED_MESSAGE` from `./BoardProvider`):

```tsx
const q2 = { exact: "x", prefix: "", suffix: "" };
const draft = { type: "chunk" as const, position: { x: 0, y: 0 },
  data: { tags: [], collapsed: true, region: { rects: [{ page: 0, rect: [0, 0, 9, 9] as [number, number, number, number] }], start: q2, end: q2, position: 0, state: "anchored" as const }, blocks: [], user_sized: false, source_id: "sec-1" } };
const groups = () => ctx!.state.board.nodes.filter((n) => n.type === "group");

describe("BoardProvider, first open (D15)", () => {
  it("lays out a new board once under StrictMode, as one undo step, before showing it", async () => {
    // StrictMode runs the load effect twice, so the board is fetched twice; split must run once.
    vi.mocked(api.getBoard).mockResolvedValueOnce(emptyBoard("p")).mockResolvedValueOnce(emptyBoard("p"));
    vi.mocked(api.split).mockResolvedValueOnce({ nodes: [draft] });
    render(<StrictMode><BoardProvider paperId="p"><Probe /></BoardProvider></StrictMode>);
    await waitFor(() => expect(ctx).not.toBeNull());
    expect(groups().map((g) => g.data)).toEqual([
      { tags: [], name: "Paper", tray: true },
      { tags: [], name: "Main point", prompt: "What is it?" },
    ]);
    expect(ctx!.state.board.nodes.filter((n) => n.type === "chunk")).toHaveLength(1);
    expect(ctx!.state.history.past).toHaveLength(1);
    expect(api.split).toHaveBeenCalledTimes(1);
  });
  it("never lays out a saved board, even an empty one", async () => {
    render(<BoardProvider paperId="p"><Probe /></BoardProvider>);
    await waitFor(() => expect(ctx).not.toBeNull());
    expect(api.split).not.toHaveBeenCalled();
    expect(ctx!.state.board.nodes).toEqual([]);
  });
  it("shows the board with a notice when first open fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(api.getBoard).mockResolvedValueOnce(emptyBoard("p"));
    vi.mocked(api.split).mockRejectedValueOnce(new Error("down"));
    const { findByText } = render(<BoardProvider paperId="p"><Probe /></BoardProvider>);
    expect(await findByText(FIRST_OPEN_FAILED_MESSAGE)).toBeTruthy();
    expect(ctx!.state.board.nodes).toEqual([]);
  });
});

describe("BoardProvider, flush and split", () => {
  it("flush waits for a note still being written", async () => {
    let finish: () => void = () => undefined;
    vi.mocked(api.putNote).mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    render(<BoardProvider paperId="p"><Probe /></BoardProvider>);
    await waitFor(() => expect(ctx).not.toBeNull());
    void ctx!.notes.save("n-1", "text");
    let flushed = false;
    const flushing = ctx!.flush().then(() => { flushed = true; });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(flushed).toBe(false);
    finish();
    await flushing;
    expect(flushed).toBe(true);
  });
  it("split adds what is missing to a new tray as one undo step and says how many", async () => {
    vi.mocked(api.split).mockResolvedValueOnce({ nodes: [draft] });
    render(<BoardProvider paperId="p"><Probe /></BoardProvider>);
    await waitFor(() => expect(ctx).not.toBeNull());
    let added = 0;
    await act(async () => { added = await ctx!.split(); });
    expect(added).toBe(1);
    expect(groups()).toHaveLength(1);
    expect(ctx!.state.history.past).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd web && npm test -- notes keys TagsProvider BoardProvider`
Expected: FAIL, missing modules and missing `notes`, `flush`, `split` on the context.

- [ ] **Step 3: Write the note store**

`web/src/state/notes.ts`:

```ts
import { api } from "../api/client";

/** Note text is not in board.json (addendum 4.4). One store per paper, so the paper's margin, the mark popover and
 *  the board's card show the same text without fetching it three times. */
export type NoteStore = {
  peek: (nodeId: string) => string | undefined;
  load: (nodeId: string) => Promise<string>;
  save: (nodeId: string, markdown: string) => Promise<void>;
  settled: () => Promise<void>;
  subscribe: (listener: () => void) => () => void;
};
export type NoteIO = { get: (nodeId: string) => Promise<string>; put: (nodeId: string, markdown: string) => Promise<void> };

export function noteIO(paperId: string): NoteIO {
  return { get: async (id) => (await api.getNote(paperId, id)).markdown, put: (id, markdown) => api.putNote(paperId, id, markdown) };
}

export function createNoteStore(io: NoteIO): NoteStore {
  const texts = new Map<string, string>();
  const loading = new Map<string, Promise<string>>();
  const listeners = new Set<() => void>();
  let writes: Promise<void> = Promise.resolve();
  const emit = () => listeners.forEach((listener) => listener());
  const load = (id: string): Promise<string> => {
    const known = texts.get(id);
    if (known !== undefined) return Promise.resolve(known);
    const inFlight = loading.get(id);
    if (inFlight) return inFlight;
    const request = io.get(id).then(
      (text) => { loading.delete(id); texts.set(id, text); emit(); return text; },
      (error: unknown) => { loading.delete(id); throw error; });
    loading.set(id, request);
    return request;
  };
  const save = (id: string, markdown: string): Promise<void> => {
    texts.set(id, markdown);
    emit();
    const write = writes.then(() => io.put(id, markdown));
    writes = write.catch(() => undefined);   // the queue goes on; the caller of save sees the failure
    return write;
  };
  return {
    peek: (id) => texts.get(id), load, save, settled: () => writes,
    subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}
```

`web/src/state/keys.ts`:

```ts
/** Keys typed into a text field belong to it: its own undo, its own Delete (addendum 4.7). jsdom has no
 *  isContentEditable, so the attribute is read as well. */
export function isTextField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target.getAttribute("contenteditable") === "true") return true;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}
```

- [ ] **Step 4: Write the tags provider, picker and chips**

`web/src/state/TagsProvider.tsx`:

```tsx
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api/client";
import { newId } from "../model/ids";
import type { Tag } from "../model/types";

/** A tag's colour is data in tags.json; a new tag starts slate, the colour of the pass presets (addendum 4.3). */
export const NEW_TAG_COLOUR = "#64748B";
export const TAGS_FAILED_MESSAGE = "Could not load or save the tags. Changes to tags may be lost.";

type TagsCtx = {
  tags: Tag[]; byId: ReadonlyMap<string, Tag>; error: string | null;
  add: (name: string) => Promise<Tag>; update: (tag: Tag) => Promise<void>; remove: (id: string) => Promise<void>;
};
const TagsContext = createContext<TagsCtx | null>(null);

/** Tags are global across boards, never per paper (SPEC 5.2). Loaded once for the whole app. */
export function TagsProvider({ children }: { children: React.ReactNode }) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [error, setError] = useState<string | null>(null);
  const current = useRef<Tag[]>([]);
  const fail = useCallback((cause: unknown) => { console.error(TAGS_FAILED_MESSAGE, cause); setError(TAGS_FAILED_MESSAGE); }, []);
  useEffect(() => {
    api.getTags().then((file) => { current.current = file.tags; setTags(file.tags); }, fail);
  }, [fail]);
  const write = useCallback(async (next: Tag[]) => {
    current.current = next;
    setTags(next);
    try {
      const file = await api.putTags({ schema: 1, tags: next });
      current.current = file.tags;
      setTags(file.tags);
      setError(null);
    } catch (cause) { fail(cause); }
  }, [fail]);
  const add = useCallback(async (name: string) => {
    const tag: Tag = { id: newId("t"), name, colour: NEW_TAG_COLOUR };
    await write([...current.current, tag]);
    return tag;
  }, [write]);
  const update = useCallback((tag: Tag) => write(current.current.map((t) => (t.id === tag.id ? tag : t))), [write]);
  const remove = useCallback((id: string) => write(current.current.filter((t) => t.id !== id)), [write]);
  const value = useMemo(() => ({ tags, byId: new Map(tags.map((t) => [t.id, t])), error, add, update, remove }), [tags, error, add, update, remove]);
  return <TagsContext.Provider value={value}>{children}</TagsContext.Provider>;
}

export function useTags(): TagsCtx {
  const ctx = useContext(TagsContext);
  if (!ctx) throw new Error("useTags outside TagsProvider");
  return ctx;
}
```

`web/src/tags/TagChips.tsx`:

```tsx
import { useTags } from "../state/TagsProvider";

/** The tags on one thing, read-only. An id no tag has any more is skipped (addendum 4.3). */
export function TagChips({ ids }: { ids: string[] }) {
  const { byId } = useTags();
  const known = ids.flatMap((id) => byId.get(id) ?? []);
  if (!known.length) return null;
  return (
    <span className="chips">
      {known.map((t) => <span key={t.id} className="chip" style={{ borderColor: t.colour, color: t.colour }}>{t.name}</span>)}
    </span>
  );
}
```

`web/src/tags/TagPicker.tsx`:

```tsx
import { useState } from "react";
import { useTags } from "../state/TagsProvider";

/** Toggle tags on one thing. The list is the global list; a tag added here is added for every board.
 *  `nodrag` and the stopped mousedown keep React Flow from dragging the card under the picker. */
export function TagPicker({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const { tags, add, error } = useTags();
  const [draft, setDraft] = useState("");
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  const create = async () => {
    const name = draft.trim();
    if (!name) return;
    const tag = await add(name);
    onChange([...value, tag.id]);
    setDraft("");
  };
  return (
    <div className="tag-picker nodrag" onMouseDown={(e) => e.stopPropagation()}>
      {tags.map((t) => (
        <label key={t.id}>
          <input type="checkbox" checked={value.includes(t.id)} onChange={() => toggle(t.id)} />
          <span style={{ color: t.colour }}>{t.name}</span>
        </label>
      ))}
      <div className="new-tag">
        <input type="text" value={draft} placeholder="new tag" aria-label="New tag"
               onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void create(); }} />
        <button type="button" onClick={() => void create()}>Add</button>
      </div>
      {error && <p className="tag-error" role="alert">{error}</p>}
    </div>
  );
}
```

`web/src/styles/tags.css`:

```css
/* tags: chips on things, and the picker every popover and card uses */
.chips { display: inline-flex; gap: 4px; flex-wrap: wrap; }
.chip { font-size: var(--text-ui-small); line-height: 18px; padding: 0 8px; border: 1px solid var(--border-strong); border-radius: var(--radius-pill); background: var(--surface); white-space: nowrap; }
.tag-picker { display: flex; flex-direction: column; gap: 4px; padding: 6px 8px; font-size: var(--text-ui); background: var(--surface); }
.tag-picker label { display: flex; align-items: center; gap: 6px; cursor: pointer; }
.tag-picker .new-tag { display: flex; gap: 6px; margin-top: 4px; }
.tag-picker input[type="text"] { flex: 1; min-width: 0; padding: 3px 6px; border: 1px solid var(--border); border-radius: var(--radius-small); }
.tag-picker button { padding: 3px 10px; border: 1px solid var(--border); border-radius: var(--radius-small); background: var(--surface); }
.tag-error { margin: 4px 0 0; color: var(--lost); font-size: var(--text-ui-small); }
```

Add `@import "./styles/tags.css";` to `web/src/styles.css` after the `tokens.css` import.

`web/src/main.tsx`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { TagsProvider } from "./state/TagsProvider";

createRoot(document.getElementById("root")!).render(<StrictMode><TagsProvider><App /></TagsProvider></StrictMode>);
```

- [ ] **Step 5: Extend the board provider**

In `web/src/state/BoardProvider.tsx`: add the imports (`useCallback`, `useSyncExternalStore` from react; `BoardNode` type; `createNoteStore`, `noteIO`, `NoteStore` from `./notes`; `CLIP_FAILED_MESSAGE`, `planFirstOpen`, `planSplit`, `storeFigureClips` from `./split`), the messages, the wider context, and replace the load effect. The persistence effect, the `schedule` effect and the failure screen stay as they are.

```tsx
export const FIRST_OPEN_FAILED_MESSAGE = "Could not lay out this paper's sections. Use Split on the board to try again.";
export const NOTE_LOAD_FAILED_MESSAGE = "Could not load this note.";
export const NOTE_SAVE_FAILED_MESSAGE = "Could not save this note. Your text is kept here; edit it again to retry.";

/** `words` is the paper's vocabulary, for reflowing its text (board/marks). */
type Ctx = {
  state: BoardState; dispatch: React.Dispatch<BoardAction>; source: Source; words: ReadonlySet<string>; notice: string | null; paperId: string;
  notes: NoteStore;
  /** Saves any pending board change and waits for note writes: what export and split need first (SPEC 6). */
  flush: () => Promise<void>;
  /** Split (D16): what the board is missing goes into the tray as one undo step. Resolves to the pieces added. */
  split: () => Promise<number>;
};
```

Inside `BoardProvider`, before the effects:

```tsx
  const latest = useRef(state);
  latest.current = state;
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const notes = useMemo(() => createNoteStore(noteIO(paperId)), [paperId]);

  const storeClips = useCallback(async (nodes: BoardNode[]) => {
    const failed = await storeFigureClips(paperId, nodes, dispatch);
    if (failed.length && mounted.current) setNotice(CLIP_FAILED_MESSAGE(failed.length));
  }, [paperId]);
```

The load effect becomes:

```tsx
  useEffect(() => {
    let live = true;
    // First open (D15): a board never written (version 0) is laid out before the views see it. Under StrictMode the
    // first run is cleaned up before its fetch lands, so only one run lays out.
    const layOut = async (s: Source) => {
      try {
        const nodes = await planFirstOpen(paperId, s);
        if (!live) return;
        dispatch({ type: "upsertNodes", nodes });
        void storeClips(nodes);
      } catch (error) {
        console.error(FIRST_OPEN_FAILED_MESSAGE, error);
        if (live) setNotice(FIRST_OPEN_FAILED_MESSAGE);
      }
    };
    const open = async () => {
      const [s, b] = await Promise.all([api.getSource(paperId), api.getBoard(paperId)]);
      if (!live) return;
      dispatch({ type: "load", board: b });
      if (b.version === 0) await layOut(s);
      if (live) setSource(s);
    };
    open().catch((error: unknown) => {
      // An ApiError's message is the server's own ({"error": {code, message}}).
      console.error("Could not open the paper", error);
      if (live) setFailure(error instanceof Error ? error.message : String(error));
    });
    return () => { live = false; };
  }, [paperId, attempt, storeClips]);
```

After the persistence effects:

```tsx
  const flush = useCallback(async () => {
    await persistence.current?.flush();
    await notes.settled();
  }, [notes]);

  const split = useCallback(async () => {
    if (!source) return 0;
    const nodes = await planSplit(paperId, source, () => latest.current.board, flush);
    if (!nodes.length) return 0;
    dispatch({ type: "upsertNodes", nodes });
    void storeClips(nodes);
    return nodes.length - 1;   // the first node is the tray
  }, [paperId, source, flush, storeClips]);
```

and the value:

```tsx
  const value = useMemo(() => (source ? { state, dispatch, source, words, notice, paperId, notes, flush, split } : null),
    [state, source, words, notice, paperId, notes, flush, split]);
```

At the end of the file:

```tsx
/** One note's text, shared by every view that shows it. Loads on first use; `save` writes the file (addendum 4.4). */
export function useNote(nodeId: string): { text: string | undefined; error: string | null; save: (markdown: string) => Promise<void> } {
  const { notes } = useBoard();
  const text = useSyncExternalStore(notes.subscribe, () => notes.peek(nodeId));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    notes.load(nodeId).catch((cause: unknown) => { console.error(NOTE_LOAD_FAILED_MESSAGE, cause); setError(NOTE_LOAD_FAILED_MESSAGE); });
  }, [notes, nodeId]);
  const save = useCallback(async (markdown: string) => {
    try {
      await notes.save(nodeId, markdown);
      setError(null);
    } catch (cause) {
      console.error(NOTE_SAVE_FAILED_MESSAGE, cause);
      setError(NOTE_SAVE_FAILED_MESSAGE);
    }
  }, [notes, nodeId]);
  return { text, error, save };
}
```

- [ ] **Step 6: Run the unit tests**

Run: `cd web && npm test && npm run build`
Expected: all pass.

- [ ] **Step 7: Start the existing specs from a saved, empty board**

First open now lays out any board with `version` 0, and the specs share one paper store in file order. Add this at the top of `web/e2e/step3.spec.ts` and of `web/e2e/restyle.spec.ts`, after the imports, so each spec starts from the same state whether it runs alone or after the others:

```ts
/** Every test here starts from a saved, empty board: first open (D15) never runs, and no earlier spec's pieces remain. */
test.beforeEach(async ({ request }) => {
  const [paper] = await (await request.get("/api/papers")).json();
  const path = `/api/papers/${paper.paper_id}/board`;
  const board = await (await request.get(path)).json();
  const empty = { ...board, nodes: [], edges: [], highlights: [], active_tags: [], view: "paper" };
  delete empty.paper_scroll;
  const saved = await request.put(path, { data: empty, headers: { "If-Match": String(board.version) } });
  expect(saved.ok()).toBeTruthy();
});
```

- [ ] **Step 8: Run the whole suite**

Run: `cd web && npm test && npm run build && npm run e2e`
Expected: every vitest file passes; Playwright 12 passed. Also run `npx playwright test step3` and `npx playwright test restyle` alone: each passes.

By hand, with a paper whose board was never saved (delete its `board.json` in a scratch copy of the data folder): the paper opens, the board holds the tray named Paper with every section and figure collapsed, and nine slots in three columns; figures show their clips within a few seconds. Cmd-Z does nothing yet (3C wires the keys).

- [ ] **Step 9: Commit**

```bash
git add web/src/state web/src/tags/TagPicker.tsx web/src/tags/TagChips.tsx web/src/styles/tags.css web/src/styles.css web/src/main.tsx web/e2e/step3.spec.ts web/e2e/restyle.spec.ts
git commit -m "feat(web): first open lays the board out; note store, global tags, flush and split on the provider"
```

**3.0 is done when** `npm test && npm run build && npm run e2e` pass on its branch and the branch is merged. 3A, 3B and 3C branch from that merge.

---

## Task 3A: The paper view (parallel)

**Owns:** `web/src/paper/**`, `web/src/PaperScreen.tsx`, `web/src/styles/paper.css`, `web/e2e/step3.spec.ts`.
**Must not touch:** `web/src/model/**`, `web/src/state/**`, `web/src/api/**`, `web/src/board/**`, `web/src/App.tsx`, `web/src/tags/**`, `web/src/panels/**`, `board.css`, `shell.css`, `tokens.css`, `tags.css`, the other e2e specs.
**Consumes (from 3.0):** `useBoard()` with `state`, `dispatch`, `source`, `paperId`; `useNote`; the actions `add`, `remove`, `setTags`, `addNode`, `addHighlight`, `setPaperScroll`; `newEdge`, `newNote`, `spotForNoteOn`, `notesConnectedTo`, `linesInside`, `lineInside`, `sectionAt`, `sectionRef`, `firstLine`, `isTextField`, `TagPicker`, `api.postText(…, mode)`, `api.putClip`, `CLIP_DPI`; tokens `--ai`, `--ai-tint`. From the existing code: `selection.ts` (`PageFrame`, `pageFrames`, `readSelection`), `preview.ts`, `board/layout.ts` (`nextChunkPosition`, `CHUNK_WIDTH`).
**Produces:** the paper half of the Shared DOM contract. `PaperScreen`'s props stay `{ focus, onFocusHandled, onOpenOnBoard }`.

Six sub-tasks, each ending with `npm test && npm run build` green and a commit. `npm run e2e` at the end of 3A.1 and 3A.6.

### Task 3A.1: Clicking a mark or a heading

A click on the paper (a mouse-up with no selection and almost no movement) is hit-tested against the marks and the section headings in page space. Marks and headings never take pointer events, so a drag that starts on them still selects text. A mark opens the mark popover: its tags and Remove (Delete or Backspace does the same while it is open). A heading opens the selection popover holding the section's extent: Cut cuts the section as a chunk with `source_id` the section's id; Open on board appears when a chunk with that `source_id` exists.

**Files:**
- Create: `web/src/paper/hit.ts`, `web/src/paper/place.ts`, `web/src/paper/MarkPopover.tsx`
- Modify: `web/src/paper/PaperView.tsx`, `web/src/paper/SelectionPopover.tsx`, `web/src/PaperScreen.tsx`, `web/src/styles/paper.css`
- Test: `web/src/paper/hit.test.ts`, `web/src/paper/place.test.ts`

**Interfaces:**
- Produces: `pagePoint(clientX, clientY, frames: PageFrame[]): PagePoint | null`; `markAt(point, highlights): Highlight | null` (the last drawn wins); `headingAt(point, sections): Section | null`; `isClick(down: XY | null, up: XY): boolean`, `CLICK_SLOP_PX = 4`; `popoverPlace(at: DOMRect, width: number, height: number): { left: number; top: number }`; `PaperHit = { mark: Highlight | null; heading: Section | null; at: DOMRect }`; `PaperView` prop `onClickPaper(hit: PaperHit)`; `SelectionPopover` props `canHighlight`, `onOpen?`.

- [ ] **Step 1: Write the failing tests**

`web/src/paper/hit.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Highlight, Rect, Section } from "../model/types";
import { headingAt, isClick, markAt, pagePoint } from "./hit";

const frames = [
  { page: 0, box: { left: 100, top: 0, right: 712, bottom: 792 }, widthPt: 612 },
  { page: 1, box: { left: 100, top: 800, right: 712, bottom: 1592 }, widthPt: 612 },
];
const q = { exact: "x", prefix: "", suffix: "" };
const mark = (id: string, page: number, rect: Rect): Highlight => ({ id, tags: [], anchor: { rects: [{ page, rect }], quote: q, position: 0, state: "anchored" } });
const heading = { id: "sec-3", number: "3", depth: 1, title: "Model", heading_rect: { page: 1, rect: [108, 280, 303, 290] }, extent: [], text: "" } as unknown as Section;

describe("hit testing a click on the paper", () => {
  it("converts a client point to page space", () => {
    expect(pagePoint(400, 900, frames)).toEqual({ page: 1, x: 300, y: 100 });
    expect(pagePoint(50, 50, frames)).toBeNull();
  });
  it("finds the mark under the point, the last drawn winning, on its own page only", () => {
    const under = mark("h-1", 1, [250, 90, 350, 110]);
    const over = mark("h-2", 1, [290, 95, 320, 105]);
    expect(markAt({ page: 1, x: 300, y: 100 }, [under, over])?.id).toBe("h-2");
    expect(markAt({ page: 0, x: 300, y: 100 }, [under])).toBeNull();
  });
  it("finds a heading by its rect", () => {
    expect(headingAt({ page: 1, x: 150, y: 285 }, [heading])?.id).toBe("sec-3");
    expect(headingAt({ page: 1, x: 150, y: 300 }, [heading])).toBeNull();
  });
  it("a click moved at most a few pixels", () => {
    expect(isClick({ x: 10, y: 10 }, { x: 12, y: 13 })).toBe(true);
    expect(isClick({ x: 10, y: 10 }, { x: 30, y: 10 })).toBe(false);
    expect(isClick(null, { x: 10, y: 10 })).toBe(false);
  });
});
```

`web/src/paper/place.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { popoverPlace } from "./place";

const at = (left: number, top: number, right: number, bottom: number) => ({ left, top, right, bottom, x: left, y: top, width: right - left, height: bottom - top, toJSON: () => null }) as DOMRect;
const size = { innerWidth: window.innerWidth, innerHeight: window.innerHeight };
afterEach(() => Object.assign(window, size));

describe("popoverPlace", () => {
  it("sits right of and below the anchor", () => {
    Object.assign(window, { innerWidth: 1400, innerHeight: 1000 });
    expect(popoverPlace(at(100, 100, 200, 120), 300, 90)).toEqual({ left: 208, top: 126 });
  });
  it("flips above near the bottom and stays inside the right edge", () => {
    Object.assign(window, { innerWidth: 1400, innerHeight: 1000 });
    expect(popoverPlace(at(1300, 950, 1350, 970), 300, 90)).toEqual({ left: 1092, top: 854 });
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd web && npm test -- hit place`
Expected: FAIL, `./hit` and `./place` do not resolve.

- [ ] **Step 3: Write `hit.ts` and `place.ts`**

`web/src/paper/hit.ts`:

```ts
import { containsPoint } from "../model/geometry";
import type { XY } from "../model/reparent";
import type { Highlight, Section } from "../model/types";
import type { PageFrame } from "./selection";

export type PagePoint = { page: number; x: number; y: number };
/** What a click on the paper landed on. Marks and headings take no pointer events, so a drag that starts on them
 *  still selects text; a click is resolved here instead. */
export type PaperHit = { mark: Highlight | null; heading: Section | null; at: DOMRect };

export const CLICK_SLOP_PX = 4;

export function pagePoint(clientX: number, clientY: number, frames: PageFrame[]): PagePoint | null {
  const frame = frames.find((f) => f.box.left <= clientX && clientX <= f.box.right && f.box.top <= clientY && clientY <= f.box.bottom);
  if (!frame) return null;
  const scale = (frame.box.right - frame.box.left) / frame.widthPt;
  return { page: frame.page, x: (clientX - frame.box.left) / scale, y: (clientY - frame.box.top) / scale };
}

export function markAt(point: PagePoint, highlights: Highlight[]): Highlight | null {
  for (let i = highlights.length - 1; i >= 0; i--) {
    if (highlights[i].anchor.rects.some((r) => r.page === point.page && containsPoint(r.rect, point.x, point.y))) return highlights[i];
  }
  return null;
}

export function headingAt(point: PagePoint, sections: Section[]): Section | null {
  return sections.find((s) => s.heading_rect.page === point.page && containsPoint(s.heading_rect.rect, point.x, point.y)) ?? null;
}

export function isClick(down: XY | null, up: XY): boolean {
  return down !== null && Math.hypot(up.x - down.x, up.y - down.y) <= CLICK_SLOP_PX;
}
```

`web/src/paper/place.ts`:

```ts
export const POPOVER_MARGIN = 8;
export const POPOVER_GAP = 6;

/** Keep a popover on screen: right of and below its anchor, above it near the bottom, never past the right edge. */
export function popoverPlace(at: DOMRect, width: number, height: number): { left: number; top: number } {
  const left = Math.max(POPOVER_MARGIN, Math.min(at.right + POPOVER_MARGIN, window.innerWidth - width - POPOVER_MARGIN));
  const below = at.bottom + POPOVER_GAP;
  const top = below + height <= window.innerHeight ? below : Math.max(POPOVER_MARGIN, at.top - height - POPOVER_GAP);
  return { left, top };
}
```

In `SelectionPopover.tsx`, replace the inline `left`/`below`/`top` computation with `const { left, top } = popoverPlace(at, POPOVER_WIDTH, POPOVER_HEIGHT);`, delete `ONE_COLUMN_HINT` (a text highlight is never refused under schema 2), and add an optional `onOpen` prop drawn as a third action:

```tsx
type Props = { at: DOMRect; preview: string; busy: boolean; canHighlight: boolean; onHighlight: () => void; onCut: () => void; onDismiss: () => void; onOpen?: () => void };
...
        <button className="action highlight" disabled={busy || !canHighlight} title="Mark this on the paper" onClick={onHighlight}>
          <span className="swatch" aria-hidden="true" />Highlight
        </button>
        <button className="action cut" disabled={busy} title="Cut this out as a piece on the board" onClick={onCut}>
          <span className="glyph" aria-hidden="true">✂</span>Cut
        </button>
        {onOpen && <button className="action" onClick={onOpen} title="This section is already a piece">Open on board</button>}
```

- [ ] **Step 4: Write the mark popover**

`web/src/paper/MarkPopover.tsx`:

```tsx
import { useCallback, useEffect } from "react";
import type { Highlight } from "../model/types";
import { useBoard } from "../state/BoardProvider";
import { isTextField } from "../state/keys";
import { TagPicker } from "../tags/TagPicker";
import { popoverPlace } from "./place";
import { previewText } from "./preview";

export const MARK_POPOVER_WIDTH = 320;
export const MARK_POPOVER_HEIGHT = 360;

type Props = { highlight: Highlight; at: DOMRect; onClose: () => void; onConnect: () => void };

/** Everything a mark can take (SPEC 5.1): tags, notes, connections. Delete or Backspace removes it (D4). */
export function MarkPopover({ highlight, at, onClose, onConnect }: Props) {
  const { dispatch } = useBoard();
  const remove = useCallback(() => {
    dispatch({ type: "remove", highlightIds: [highlight.id] });
    onClose();
  }, [dispatch, highlight.id, onClose]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isTextField(event.target)) return;
      if (event.key === "Escape") onClose();
      if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); remove(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, remove]);
  const { left, top } = popoverPlace(at, MARK_POPOVER_WIDTH, MARK_POPOVER_HEIGHT);
  return (
    <div className="popover mark-popover" role="dialog" aria-label="Mark" style={{ left, top }} onMouseDown={(e) => e.stopPropagation()}>
      <div className="popover-preview" title={highlight.anchor.quote.exact}>{previewText(highlight.anchor.quote.exact)}</div>
      <TagPicker value={highlight.tags} onChange={(tags) => dispatch({ type: "setTags", target: "highlight", id: highlight.id, tags })} />
      <div className="popover-actions">
        <button className="action" onClick={onConnect} title="Then click another mark or a section heading">Connect</button>
        <button className="action" onClick={remove} title="Delete">Remove</button>
        <button className="quiet close" aria-label="Dismiss" onClick={onClose}>×</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Wire the click into the paper view and the screen**

In `PaperView.tsx`: add `onClickPaper: (hit: PaperHit) => void` to `Props`; track the mouse-down point; after `readSelection` returns null, resolve a click. The body of today's `onMouseUp` after `readSelection` moves unchanged into `selectText`.

```tsx
/** Clicks on these are theirs, not a click on the paper. */
export const OWN_CLICK_TARGETS = "a, button, input, textarea, select, .margin, .annotationLayer, .popover";

  const down = useRef<XY | null>(null);
  const onMouseDown = (event: React.MouseEvent) => { down.current = { x: event.clientX, y: event.clientY }; };
  const clickAt = (event: React.MouseEvent) => {
    if (!container.current || !isClick(down.current, { x: event.clientX, y: event.clientY })) return;
    if ((event.target as HTMLElement).closest(OWN_CLICK_TARGETS)) return;
    const point = pagePoint(event.clientX, event.clientY, pageFrames(container.current, source));
    if (!point) return;
    const mark = markAt(point, board.highlights);
    const heading = mark ? null : headingAt(point, source.sections);
    if (mark || heading) onClickPaper({ mark, heading, at: new DOMRect(event.clientX, event.clientY, 0, 0) });
  };
  const onMouseUp = (event: React.MouseEvent) => {
    if (!container.current) return;
    const rects = readSelection(container.current, source);
    if (rects) selectText(rects, event.altKey);
    else clickAt(event);
  };
...
    <div ref={container} className="paper" onMouseDown={onMouseDown} onMouseUp={onMouseUp}>
```

and in `PageOverlay.tsx` give each mark its highlight id: `data-highlight-id={h.id}` on every `.mark` element.

`PaperScreen.tsx`: extend `Pending` and add the mark popover.

```tsx
type Pending = { rects: PageRect[]; at: DOMRect; exact: boolean; preview: string; section?: Section };
type OpenMark = { id: string; at: DOMRect };
...
  const [openMark, setOpenMark] = useState<OpenMark | null>(null);
  const onClickPaper = (hit: PaperHit) => {
    setError(null);
    if (hit.mark) { setPending(null); setOpenMark({ id: hit.mark.id, at: hit.at }); return; }
    if (hit.heading) {
      setOpenMark(null);
      setPending({ rects: hit.heading.extent, at: hit.at, exact: true, preview: sectionLabel(hit.heading), section: hit.heading });
    }
  };
  const existingPiece = (section: Section | undefined) =>
    section ? state.board.nodes.find((n) => n.type === "chunk" && n.data.source_id === section.id) : undefined;
  const markOpen = openMark && state.board.highlights.find((h) => h.id === openMark.id);
```

In `choose`, the cut branch now keeps the section: `source_id: pending.section?.id ?? null` (3A.2 replaces this branch with `makeCut`). The render gains:

```tsx
      {pending && (() => {
        const piece = existingPiece(pending.section);
        return <SelectionPopover at={pending.at} preview={pending.preview} busy={busy} canHighlight={!pending.section}
                                 onHighlight={() => choose("highlight")} onCut={() => choose("cut")} onDismiss={() => setPending(null)}
                                 onOpen={piece ? () => { setPending(null); onOpenOnBoard(piece.id); } : undefined} />;
      })()}
      {markOpen && <MarkPopover highlight={markOpen} at={openMark!.at} onClose={() => setOpenMark(null)} onConnect={() => setOpenMark(null)} />}
```

(`onConnect` becomes real in 3A.3.) Import `sectionLabel` from `./model/sections`.

Add to `web/src/styles/paper.css`:

```css
/* the popover a click on a mark opens */
.mark-popover { width: 320px; display: flex; flex-direction: column; gap: 6px; max-height: 70vh; overflow: auto; }
.mark-popover .tag-picker { padding: 4px 2px; border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); }
```

- [ ] **Step 6: Run the tests, then check by hand**

Run: `cd web && npm test && npm run build`
Expected: all pass.

Run: `cd web && npm run e2e`
Expected: 12 passed (the selection popover keeps its Highlight and Cut buttons).

By hand: highlight a phrase; click it: the mark popover opens with its quote; tick `question`; the tag is saved (reload, click again, still ticked). Press Delete: the mark goes. Drag across a marked phrase: text is selected as before, the popover offers Highlight and Cut. Click the heading "3.2 Attention" on page 3 of Attention: the popover offers Cut and, on a board that came from first open, Open on board.

- [ ] **Step 7: Commit**

```bash
git add web/src/paper web/src/PaperScreen.tsx web/src/styles/paper.css
git commit -m "feat(web): a click on a mark opens its popover, a click on a heading offers to cut the section"
```

---

### Task 3A.2: The forgiving rectangle, and a figure cut from it (D3)

Shift-drag on a page draws a rectangle (Shift, because Alt already means "exactly what I selected" and stays that here: Shift-Alt-drag keeps the rectangle exact). Releasing opens the selection popover. Both choices send `mode: "area"`. Highlight stores the snapped rect as a one-rect highlight. Cut makes a figure node: its clip is stored at 216 dpi under its new id, and its caption and `source_id` come from the paired figure when the snap took one.

**Files:**
- Create: `web/src/paper/rectangleDrag.ts`, `web/src/paper/figures.ts`, `web/src/paper/cut.ts`
- Modify: `web/src/paper/PaperView.tsx`, `web/src/PaperScreen.tsx`, `web/src/styles/paper.css`
- Test: `web/src/paper/rectangleDrag.test.ts`, `web/src/paper/figures.test.ts`, `web/src/paper/cut.test.ts`

**Interfaces:**
- Produces: `rectangleFromDrag(start: XY, end: XY, frame: PageFrame): PageRect | null`, `MIN_DRAG_PX = 8`; `useRectangleDrag(container, source, onRect)`; `pairedFigure(source, snapped: PageRect): Figure | null`; `makeCut(paperId, source, board, selection, request: { mode: SelectionMode; sectionId?: string }): Promise<BoardNode>`; `PaperView`'s `onSelect(rects, at, exact, mode)`.

- [ ] **Step 1: Write the failing tests**

`web/src/paper/rectangleDrag.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { rectangleFromDrag } from "./rectangleDrag";

const frame = { page: 1, box: { left: 100, top: 1000, right: 800, bottom: 1906 }, widthPt: 612 };
const scale = 700 / 612;

describe("rectangleFromDrag", () => {
  it("orders the corners and converts to points", () => {
    const rect = rectangleFromDrag({ x: 500, y: 1400 }, { x: 300, y: 1200 }, frame)!;
    expect(rect.page).toBe(1);
    expect(rect.rect.map((v) => Math.round(v))).toEqual([200, 200, 400, 400].map((v) => Math.round(v / scale)));
  });
  it("clamps to the page", () => {
    const rect = rectangleFromDrag({ x: 50, y: 950 }, { x: 300, y: 1200 }, frame)!;
    expect(rect.rect[0]).toBe(0);
    expect(rect.rect[1]).toBe(0);
  });
  it("rejects a drag too small to mean anything", () => {
    expect(rectangleFromDrag({ x: 300, y: 1200 }, { x: 304, y: 1203 }, frame)).toBeNull();
  });
});
```

`web/src/paper/figures.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Rect, Source } from "../model/types";
import { pairedFigure } from "./figures";

const pr = (page: number, rect: Rect) => ({ page, rect });
const source = { figures: [
  { id: "fig-1", kind: "figure", label: "Figure 1", caption: "Figure 1: The Transformer.", caption_rect: pr(2, [108, 400, 504, 420]), rect: pr(2, [197, 72, 415, 394]), confidence: "region" },
  { id: "tab-1", kind: "table", label: "Table 1", caption: "Table 1: x", caption_rect: null, rect: pr(5, [108, 100, 504, 300]), confidence: "region" },
] } as unknown as Source;

describe("pairedFigure", () => {
  it("is the figure whose picture and caption the snapped rect holds", () => {
    expect(pairedFigure(source, pr(2, [108, 72, 504, 420]))?.id).toBe("fig-1");
  });
  it("is nothing when the rect left the caption out, or holds no figure", () => {
    expect(pairedFigure(source, pr(2, [190, 70, 420, 396]))).toBeNull();
    expect(pairedFigure(source, pr(3, [0, 0, 600, 800]))).toBeNull();
  });
  it("takes a figure with no caption on its picture alone", () => {
    expect(pairedFigure(source, pr(5, [100, 90, 510, 310]))?.id).toBe("tab-1");
  });
});
```

`web/src/paper/cut.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyBoard, type Rect, type Selection, type Source } from "../model/types";

vi.mock("../api/client", () => ({ CLIP_DPI: 216, api: { putClip: vi.fn(async () => ({ clip: "clips/x.png", clip_size: { width: 900, height: 600 } })) } }));
import { api } from "../api/client";
import { makeCut } from "./cut";

const q = { exact: "x", prefix: "", suffix: "" };
const at = { page: 2, rect: [108, 72, 504, 420] as Rect };
const selection: Selection = {
  text: "t", rects: [at], region_label: "picture",
  highlight: { rects: [at], quote: q, position: 0, state: "anchored" },
  chunk: { rects: [at], start: q, end: q, position: 0, state: "anchored" },
  blocks: [{ kind: "clip", page: 2, rect: at.rect, label: "picture" }],
};
const source = { figures: [{ id: "fig-1", kind: "figure", label: "Figure 1", caption: "Figure 1: The Transformer.", caption_rect: { page: 2, rect: [108, 400, 504, 420] }, rect: { page: 2, rect: [197, 72, 415, 394] }, confidence: "region" }] } as unknown as Source;

beforeEach(() => vi.clearAllMocks());

describe("makeCut", () => {
  it("a text cut is a chunk that shows its blocks and remembers its section", async () => {
    const node = await makeCut("p", source, emptyBoard("p"), selection, { mode: "text", sectionId: "sec-3" });
    expect(node).toMatchObject({ type: "chunk", data: { region: selection.chunk, blocks: selection.blocks, source_id: "sec-3", collapsed: false } });
    expect(api.putClip).not.toHaveBeenCalled();
  });
  it("an area cut is a figure with its clip stored at 216 dpi under its own id, and the paired figure's caption", async () => {
    const node = await makeCut("p", source, emptyBoard("p"), selection, { mode: "area" });
    expect(api.putClip).toHaveBeenCalledWith("p", node.id, at, 216);
    expect(node).toMatchObject({ type: "figure", data: { clip: "clips/x.png", clip_size: { width: 900, height: 600 }, caption: "Figure 1: The Transformer.", source_id: "fig-1" } });
  });
  it("an area cut that snapped to nothing has no caption and no source", async () => {
    const loose = { ...selection, rects: [{ page: 7, rect: [0, 0, 50, 50] as Rect }] };
    expect(await makeCut("p", source, emptyBoard("p"), loose, { mode: "area" })).toMatchObject({ data: { caption: "", source_id: null } });
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd web && npm test -- rectangleDrag figures cut`
Expected: FAIL, three unresolved modules.

- [ ] **Step 3: Write the modules**

`web/src/paper/rectangleDrag.ts`:

```ts
import { useEffect, useState, type RefObject } from "react";
import type { XY } from "../model/reparent";
import type { PageRect, Source } from "../model/types";
import { pageFrames, type PageFrame } from "./selection";

export const MIN_DRAG_PX = 8;

type Band = { start: XY; end: XY; frame: PageFrame };

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/** A Shift-drag on a page as one page rect in points, corners in any order, clamped to the page. */
export function rectangleFromDrag(start: XY, end: XY, frame: PageFrame): PageRect | null {
  if (Math.abs(end.x - start.x) < MIN_DRAG_PX || Math.abs(end.y - start.y) < MIN_DRAG_PX) return null;
  const { left, top, right, bottom } = frame.box;
  const scale = (right - left) / frame.widthPt;
  const x = (px: number) => (clamp(px, left, right) - left) / scale;
  const y = (px: number) => (clamp(px, top, bottom) - top) / scale;
  return { page: frame.page, rect: [x(Math.min(start.x, end.x)), y(Math.min(start.y, end.y)), x(Math.max(start.x, end.x)), y(Math.max(start.y, end.y))] };
}

export function bandBox(start: XY, end: XY): DOMRect {
  return new DOMRect(Math.min(start.x, end.x), Math.min(start.y, end.y), Math.abs(end.x - start.x), Math.abs(end.y - start.y));
}

/** Shift-drag draws a rectangle instead of selecting text. `begin` returns true when it took the mouse-down. */
export function useRectangleDrag(container: RefObject<HTMLElement | null>, source: Source, onRect: (rect: PageRect, at: DOMRect, exact: boolean) => void) {
  const [band, setBand] = useState<Band | null>(null);
  const begin = (event: React.MouseEvent): boolean => {
    if (!event.shiftKey || !container.current) return false;
    const frame = pageFrames(container.current, source).find((f) =>
      f.box.left <= event.clientX && event.clientX <= f.box.right && f.box.top <= event.clientY && event.clientY <= f.box.bottom);
    if (!frame) return false;
    event.preventDefault();   // no text selection while the rectangle is drawn
    const at = { x: event.clientX, y: event.clientY };
    setBand({ start: at, end: at, frame });
    return true;
  };
  useEffect(() => {
    if (!band) return;
    const move = (e: MouseEvent) => setBand((b) => (b ? { ...b, end: { x: e.clientX, y: e.clientY } } : b));
    const up = (e: MouseEvent) => {
      const end = { x: e.clientX, y: e.clientY };
      setBand(null);
      const rect = rectangleFromDrag(band.start, end, band.frame);
      if (rect) onRect(rect, bandBox(band.start, end), e.altKey);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
  }, [band, onRect]);
  return { band, begin };
}
```

`web/src/paper/figures.ts`:

```ts
import { lineInside } from "../model/geometry";
import type { Figure, PageRect, Source } from "../model/types";

/** The figure a snapped rectangle took (addendum 5.3): its picture's midpoint inside, and its caption's too when
 *  it has one, since the snap takes a figure with its caption. */
export function pairedFigure(source: Source, snapped: PageRect): Figure | null {
  return source.figures.find((f) => lineInside(f.rect, [snapped]) && (!f.caption_rect || lineInside(f.caption_rect, [snapped]))) ?? null;
}
```

`web/src/paper/cut.ts`:

```ts
import { api, CLIP_DPI } from "../api/client";
import { CHUNK_WIDTH, nextChunkPosition } from "../board/layout";
import { newId } from "../model/ids";
import type { Board, BoardNode, Selection, SelectionMode, Source } from "../model/types";
import { pairedFigure } from "./figures";

export type CutRequest = { mode: SelectionMode; sectionId?: string };

/** A cut becomes a piece (SPEC 4). A text cut is a chunk showing the server's blocks (D2); a rectangle cut is a figure
 *  whose clip is stored under its own new id (addendum 6, "area"). */
export async function makeCut(paperId: string, source: Source, board: Board, selection: Selection, request: CutRequest): Promise<BoardNode> {
  const id = newId("n");
  const position = nextChunkPosition(board.nodes);
  if (request.mode === "area") {
    const at = selection.rects[0];
    const { clip, clip_size } = await api.putClip(paperId, id, at, CLIP_DPI);
    const figure = pairedFigure(source, at);
    return { id, type: "figure", position, width: CHUNK_WIDTH,
      data: { tags: [], collapsed: false, region: selection.chunk, clip, clip_size, caption: figure?.caption ?? "", user_sized: false, source_id: figure?.id ?? null } };
  }
  return { id, type: "chunk", position, width: CHUNK_WIDTH,
    data: { tags: [], collapsed: false, region: selection.chunk, blocks: selection.blocks, user_sized: false, source_id: request.sectionId ?? null } };
}
```

- [ ] **Step 4: Wire the rectangle and the cut**

`PaperView.tsx`: `onSelect` gains the mode, `(rects: PageRect[], at: DOMRect, exact: boolean, mode: SelectionMode) => void`; the text path calls it with `"text"`. Add the hook and the band:

```tsx
  const onRect = useCallback((rect: PageRect, at: DOMRect, exact: boolean) => onSelect([rect], at, exact, "area"), [onSelect]);
  const rectangle = useRectangleDrag(container, source, onRect);
  const onMouseDown = (event: React.MouseEvent) => {
    if (rectangle.begin(event)) return;
    down.current = { x: event.clientX, y: event.clientY };
  };
  const onMouseUp = (event: React.MouseEvent) => {
    if (!container.current || rectangle.band) return;   // the rectangle's own mouse-up handles it
    ...as before...
  };
...
      {rectangle.band && <div className="rubber-band" style={bandStyle(rectangle.band.start, rectangle.band.end)} />}
```

with `const bandStyle = (a: XY, b: XY) => { const r = bandBox(a, b); return { left: r.left, top: r.top, width: r.width, height: r.height }; };`.

`PaperScreen.tsx`: `Pending` gains `mode: SelectionMode`, set from `onSelect`'s fourth argument (`"text"` for a heading). `choose` becomes:

```tsx
  const choose = async (kind: "highlight" | "cut") => {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      const selection = await api.postText(paperId, pending.rects, !pending.exact, pending.mode);
      if (kind === "highlight") dispatch({ type: "addHighlight", highlight: { id: newId("h"), tags: [], anchor: selection.highlight } });
      else dispatch({ type: "addNode", node: await makeCut(paperId, source, state.board, selection, { mode: pending.mode, sectionId: pending.section?.id }) });
    } catch (failure) {
      console.error(SELECTION_FAILED_MESSAGE, failure);
      setError(SELECTION_FAILED_MESSAGE);
    } finally {
      setBusy(false);
      setPending(null);
      window.getSelection()?.removeAllRanges();
    }
  };
```

Add to `paper.css`:

```css
/* the rectangle a Shift-drag draws */
.rubber-band { position: fixed; z-index: 9; pointer-events: none; border: 1px dashed var(--cut-edge); background: var(--cut-tint); }
```

- [ ] **Step 5: Run the tests, then check by hand**

Run: `cd web && npm test && npm run build`
Expected: all pass.

By hand on Attention: Shift-drag loosely around Figure 1 on page 3 (index 2): the popover appears; Cut: a figure node on the board shows the figure sharp with its caption as title. Shift-drag loosely around equation (1) on page 4: Cut: a figure node showing only the equation. Shift-Alt-drag the same loose box: the clip keeps the loose box.

- [ ] **Step 6: Commit**

```bash
git add web/src/paper web/src/PaperScreen.tsx web/src/styles/paper.css
git commit -m "feat(web): Shift-drag a rectangle to highlight or cut a figure, table or equation"
```

---

### Task 3A.3: Notes on a mark, the margin, and connecting from the paper (D12)

The mark popover lists the notes connected to the mark, each editable in place, and Add note makes a reader note beside the chunk that holds the mark (or under everything), connected to it in one undo step. Connect puts the paper in connect mode: the next click on another mark connects the two; on a heading, it makes a highlight of the heading through `POST /text` with `snap: false` (or reuses a mark already on it) and connects to that. Escape cancels. The margin beside each mark's first line shows every connection with an end on that mark: a note as the note, anything else as a chip naming the other end; a chip jumps.

**Files:**
- Create: `web/src/paper/margin.ts`, `web/src/paper/Margin.tsx`, `web/src/paper/NoteEditor.tsx`
- Modify: `web/src/paper/MarkPopover.tsx`, `web/src/paper/PageOverlay.tsx`, `web/src/paper/PaperView.tsx`, `web/src/PaperScreen.tsx`, `web/src/styles/paper.css`
- Test: `web/src/paper/margin.test.ts`

**Interfaces:**
- Produces: `JumpTarget = { paper: PageRect } | { board: string }`; `MarginItem`; `marginItems(board, source, highlightId): MarginItem[]`; `firstWords(text, count?)`, `CHIP_WORDS = 3`; `stackTops(tops: number[], step?): number[]`; `<NoteEditor noteId origin />`; `PaperView` props `connecting: boolean`, `onJump(target: JumpTarget)`, `onOpenNote(noteId)`.

- [ ] **Step 1: Write the failing test**

`web/src/paper/margin.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { emptyBoard, type BoardNode, type Highlight, type Rect, type Source } from "../model/types";
import { firstWords, marginItems, stackTops } from "./margin";

const q = (exact: string) => ({ exact, prefix: "", suffix: "" });
const pr = (page: number, rect: Rect) => ({ page, rect });
const mark = (id: string, page: number, exact: string): Highlight => ({ id, tags: [], anchor: { rects: [pr(page, [120, 100, 300, 110])], quote: q(exact), position: 0, state: "anchored" } });
const source = { sections: [
  { id: "sec-3", number: "3", depth: 1, title: "Model", heading_rect: pr(3, [0, 0, 1, 1]), extent: [pr(3, [100, 50, 500, 700])], text: "" },
] } as unknown as Source;
const nodes: BoardNode[] = [
  { id: "n-note", type: "note", position: { x: 0, y: 0 }, data: { tags: [], collapsed: false, note: "notes/n-note.md", origin: "ai" } },
  { id: "n-g", type: "group", position: { x: 0, y: 0 }, data: { tags: [], name: "Method" } },
];
const edge = (id: string, from: string, to: string) => ({ id, from, to, data: { tags: [] } });

describe("the margin beside a mark (addendum 4.0)", () => {
  const board = {
    ...emptyBoard("p"), nodes,
    highlights: [mark("h-1", 1, "we use it"), mark("h-2", 3, "scaled dot-product attention computes")],
    edges: [edge("e-1", "h-1", "n-note"), edge("e-2", "h-2", "h-1"), edge("e-3", "h-1", "n-g"), edge("e-4", "h-1", "n-gone")],
  };
  it("shows a note as the note, and anything else as a chip naming the section and first words of the other end", () => {
    expect(marginItems(board, source, "h-1")).toEqual([
      { kind: "note", key: "e-1", noteId: "n-note", origin: "ai" },
      { kind: "chip", key: "e-2", label: "→ §3 scaled dot-product attention", target: { paper: pr(3, [120, 100, 300, 110]) } },
      { kind: "chip", key: "e-3", label: "→ Method", target: { board: "n-g" } },
    ]);
  });
  it("shows the same connection from the other end", () => {
    expect(marginItems(board, source, "h-2")).toEqual([
      { kind: "chip", key: "e-2", label: "→ we use it", target: { paper: pr(1, [120, 100, 300, 110]) } },
    ]);
  });
  it("first words, and margin items pushed down so they never overlap", () => {
    expect(firstWords("  one two\nthree four ")).toBe("one two three");
    expect(stackTops([10, 12, 100], 30)).toEqual([10, 40, 100]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd web && npm test -- margin`
Expected: FAIL, `./margin` does not resolve.

- [ ] **Step 3: Write `margin.ts`**

```ts
import { sectionAt, sectionRef } from "../model/sections";
import type { Board, NoteOrigin, PageRect, Source } from "../model/types";

export const CHIP_WORDS = 3;
export const MARGIN_ITEM_PX = 26;
export const MARGIN_GAP_PX = 6;

export type JumpTarget = { paper: PageRect } | { board: string };
export type MarginItem =
  | { kind: "note"; key: string; noteId: string; origin: NoteOrigin }
  | { kind: "chip"; key: string; label: string; target: JumpTarget };

export function firstWords(text: string, count = CHIP_WORDS): string {
  return text.trim().split(/\s+/).slice(0, count).join(" ");
}

function chip(key: string, source: Source, at: PageRect, text: string): MarginItem {
  const section = sectionAt(source, at);
  return { kind: "chip", key, label: `→ ${section ? `${sectionRef(section)} ` : ""}${firstWords(text)}`, target: { paper: at } };
}

function describe(board: Board, source: Source, id: string, key: string): MarginItem | null {
  const mark = board.highlights.find((h) => h.id === id);
  if (mark) return chip(key, source, mark.anchor.rects[0], mark.anchor.quote.exact);
  const node = board.nodes.find((n) => n.id === id);
  if (!node) return null;
  if (node.type === "note") return { kind: "note", key, noteId: node.id, origin: node.data.origin };
  if (node.type === "group") return { kind: "chip", key, label: `→ ${node.data.name || "a group"}`, target: { board: node.id } };
  return chip(key, source, node.data.region.rects[0], node.data.region.start.exact);
}

/** Every connection with an end on this mark, whether or not the board draws it: a note as the note, anything else as a
 *  chip naming the other end, in edge order. An end that no longer exists is skipped. */
export function marginItems(board: Board, source: Source, highlightId: string): MarginItem[] {
  return board.edges.flatMap((edge) => {
    const other = edge.from === highlightId ? edge.to : edge.to === highlightId ? edge.from : null;
    const item = other ? describe(board, source, other, edge.id) : null;
    return item ? [item] : [];
  });
}

/** Tops in ascending order, each pushed down to clear the one before it. */
export function stackTops(tops: number[], step = MARGIN_ITEM_PX + MARGIN_GAP_PX): number[] {
  let floor = -Infinity;
  return tops.map((top) => { const at = Math.max(top, floor); floor = at + step; return at; });
}
```

- [ ] **Step 4: Write the note editor and the margin**

`web/src/paper/NoteEditor.tsx`:

```tsx
import { useState } from "react";
import type { NoteOrigin } from "../model/types";
import { useNote } from "../state/BoardProvider";

export const READER_PLACEHOLDER = "In your own words…";
export const AI_PLACEHOLDER = "Paste the AI's answer here";

/** One note, edited in place. Saves when it loses focus; the text area keeps its own undo (addendum 4.7). */
export function NoteEditor({ noteId, origin }: { noteId: string; origin: NoteOrigin }) {
  const { text, error, save } = useNote(noteId);
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft !== null && draft !== text) void save(draft);
    setDraft(null);
  };
  return (
    <div className={`note-editor ${origin}`}>
      {origin === "ai" && <span className="ai-label">AI</span>}
      <textarea value={draft ?? text ?? ""} placeholder={origin === "ai" ? AI_PLACEHOLDER : READER_PLACEHOLDER}
                aria-label={origin === "ai" ? "AI answer" : "Your note"} onChange={(e) => setDraft(e.target.value)} onBlur={commit} />
      {error && <p className="note-error" role="alert">{error}</p>}
    </div>
  );
}
```

`web/src/paper/Margin.tsx`:

```tsx
import { firstLine } from "../model/notes";
import type { Board, Source } from "../model/types";
import { useNote } from "../state/BoardProvider";
import { marginItems, stackTops, type JumpTarget, type MarginItem } from "./margin";

export const MARGIN_NOTE_CHARS = 120;

type Props = { page: number; scale: number; board: Board; source: Source; onJump: (target: JumpTarget) => void; onOpenNote: (noteId: string) => void };

function MarginNote({ item, top, onOpen }: { item: Extract<MarginItem, { kind: "note" }>; top: number; onOpen: (id: string) => void }) {
  const { text } = useNote(item.noteId);
  return (
    <button type="button" className={`margin-note ${item.origin}`} data-note-id={item.noteId} style={{ top }} onClick={() => onOpen(item.noteId)} title="Open on the board">
      {item.origin === "ai" && <span className="ai-label">AI</span>}
      {firstLine(text ?? "", MARGIN_NOTE_CHARS) || "empty note"}
    </button>
  );
}

/** Beside each mark's first line on this page: its notes and its jump chips (D12). */
export function Margin({ page, scale, board, source, onJump, onOpenNote }: Props) {
  const rows = board.highlights
    .filter((h) => h.anchor.rects[0]?.page === page)
    .flatMap((h) => marginItems(board, source, h.id).map((item) => ({ item, key: `${h.id}:${item.key}`, top: h.anchor.rects[0].rect[1] * scale })))
    .sort((a, b) => a.top - b.top);
  const tops = stackTops(rows.map((r) => r.top));
  return (
    <div className="margin">
      {rows.map(({ item, key }, i) => (item.kind === "note"
        ? <MarginNote key={key} item={item} top={tops[i]} onOpen={onOpenNote} />
        : <button key={key} type="button" className="margin-chip" style={{ top: tops[i] }} onClick={() => onJump(item.target)}>{item.label}</button>))}
    </div>
  );
}
```

`PageOverlay.tsx` gains `source`, `onJump`, `onOpenNote` props and renders `<Margin page={page} scale={scale} board={board} source={source} onJump={onJump} onOpenNote={onOpenNote} />` as its last child. `PaperView` passes them through, adds `connecting: boolean` to its props, and sets `className={connecting ? "paper connecting" : "paper"}`.

- [ ] **Step 5: Notes in the mark popover, and connect mode**

In `MarkPopover.tsx`, between the tag picker and the actions:

```tsx
  const { state, dispatch } = useBoard();
  const notes = notesConnectedTo(state.board, [highlight.id]);
  const addNote = () => {
    const note = newNote({ ...spotForNoteOn(state.board, highlight.id), origin: "reader" });
    dispatch({ type: "add", nodes: [note], edges: [newEdge(highlight.id, note.id)] });   // one undo step
  };
...
      {notes.map((n) => <NoteEditor key={n.id} noteId={n.id} origin={n.data.origin} />)}
...
        <button className="action" onClick={addNote}>Add note</button>
```

In `PaperScreen.tsx`:

```tsx
export const CONNECT_FAILED_MESSAGE = "Could not mark that heading. Nothing was connected.";

  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  useEffect(() => {
    if (!connectingFrom) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setConnectingFrom(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [connectingFrom]);

  /** Connecting to a heading makes a highlight of it and connects to that (addendum 4.0); a mark already on the heading is reused. */
  const connectToHeading = async (from: string, section: Section) => {
    const existing = state.board.highlights.find((h) => linesInside(h, [section.heading_rect]).length > 0);
    if (existing) return dispatch({ type: "add", edges: [newEdge(from, existing.id)] });
    try {
      const selection = await api.postText(paperId, [section.heading_rect], false, "text");
      const highlight = { id: newId("h"), tags: [], anchor: selection.highlight };
      dispatch({ type: "add", highlights: [highlight], edges: [newEdge(from, highlight.id)] });   // one undo step
    } catch (failure) {
      console.error(CONNECT_FAILED_MESSAGE, failure);
      setError(CONNECT_FAILED_MESSAGE);
    }
  };
  const connectTo = (from: string, hit: PaperHit) => {
    setConnectingFrom(null);
    if (hit.mark) dispatch({ type: "add", edges: [newEdge(from, hit.mark.id)] });   // the reducer drops a line to itself
    else if (hit.heading) void connectToHeading(from, hit.heading);
  };
```

`onClickPaper` starts with `if (connectingFrom) return connectTo(connectingFrom, hit);`. The mark popover's `onConnect` becomes `() => { setConnectingFrom(openMark!.id); setOpenMark(null); }`. A jump:

```tsx
  const [jump, setJump] = useState<PageRect | null>(null);
  const onJump = (target: JumpTarget) => ("paper" in target ? setJump({ ...target.paper }) : onOpenOnBoard(target.board));
```

`PaperView` receives `focus={jump ?? focus}` and `onFocusHandled={() => { setJump(null); onFocusHandled(); }}`, `connecting={connectingFrom !== null}`, `onJump`, `onOpenNote={onOpenOnBoard}`. While connecting, render:

```tsx
      {connectingFrom && (
        <p className="connect-hint" role="status">Click another mark or a section heading to connect. <button className="quiet" onClick={() => setConnectingFrom(null)}>Cancel</button></p>
      )}
```

Add to `paper.css`:

```css
/* margin: notes and jump chips beside a mark's first line */
.overlay .margin { position: absolute; top: 0; left: 100%; width: 220px; margin-left: 14px; }
.margin-note, .margin-chip { position: absolute; left: 0; max-width: 220px; pointer-events: auto; text-align: left; font: inherit; font-size: var(--text-ui-small); border-radius: var(--radius-small); padding: 3px 8px; cursor: pointer; }
.margin-note { width: 220px; color: var(--ink-muted); background: var(--surface); border: 1px solid var(--border); border-left: 3px solid var(--hl-solid); box-shadow: var(--shadow-card); display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.margin-note.ai { border-left-color: var(--ai); background: var(--ai-tint); }
.margin-chip { border: 1px solid var(--border-strong); background: var(--surface); color: var(--cut); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.margin-chip:hover, .margin-note:hover { border-color: var(--cut-edge); }
.ai-label { display: inline-block; margin-right: 6px; padding: 0 5px; border-radius: var(--radius-pill); background: var(--ai); color: var(--surface); font-size: 10px; font-weight: 600; letter-spacing: 0.04em; }

/* a note edited in the mark popover */
.note-editor { display: flex; flex-direction: column; gap: 4px; }
.note-editor textarea { min-height: 64px; resize: vertical; padding: 6px 8px; border: 1px solid var(--border); border-left: 3px solid var(--hl-solid); border-radius: var(--radius-small); font-family: var(--font-read); font-size: 13px; line-height: 1.45; }
.note-editor.ai textarea { border-left-color: var(--ai); background: var(--ai-tint); }
.note-error { margin: 0; color: var(--lost); font-size: var(--text-ui-small); }

/* choosing the other end of a connection */
.paper.connecting { cursor: crosshair; }
.connect-hint { position: fixed; top: calc(var(--topbar-height) + 12px); left: 50%; transform: translateX(-50%); margin: 0; padding: 6px 12px; z-index: 10; background: var(--surface); border: 1px solid var(--cut-edge); border-radius: var(--radius-pill); box-shadow: var(--shadow-raised); }
```

- [ ] **Step 6: Run the tests, then check by hand**

Run: `cd web && npm test && npm run build`
Expected: all pass.

By hand, on a board with no chunk over pages 3 and 4: mark a phrase on each page. Click the first, Connect, click the second: each mark has one chip in its margin; clicking the chip beside the first scrolls to the second. On the board there is no line yet. Click the first mark, Add note, write two lines, click away: the margin shows the note's first line; reload: still there, and `notes/<id>.md` holds it. Click a mark, Connect, click the heading "3.1 Encoder and Decoder Stacks": the heading is highlighted and a chip names it.

- [ ] **Step 7: Commit**

```bash
git add web/src/paper web/src/PaperScreen.tsx web/src/styles/paper.css
git commit -m "feat(web): notes on a mark, margin notes and jump chips, connecting marks and headings from the paper"
```

---

### Task 3A.4: Ask elsewhere (D14)

Ask elsewhere, in the mark popover, copies a prompt built from `ASK_PROMPT` with four slots (the marked words, their sentence from `page_text`, the `text` of the section holding the mark's first line, and the goal) and makes an empty note with `origin: "ai"` connected to the mark, shown in the popover for the answer. If the clipboard refuses, the prompt is shown to copy by hand.

**Files:**
- Create: `web/src/paper/ask.ts`, `web/src/paper/AskElsewhere.tsx`
- Modify: `web/src/paper/MarkPopover.tsx`, `web/src/styles/paper.css`
- Test: `web/src/paper/ask.test.ts`

**Interfaces:**
- Produces: `ASK_PROMPT`, `buildAskPrompt({ marked, sentence, section, goal }): string`, `sentenceAround(pageText, quote): string`, `<AskElsewhere highlight />`, `COPY_FAILED_MESSAGE`.

- [ ] **Step 1: Write the failing test**

`web/src/paper/ask.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ASK_PROMPT, buildAskPrompt, sentenceAround } from "./ask";

describe("Ask elsewhere (D14)", () => {
  it("finds the sentence around the marked words, ignoring line breaks", () => {
    const page = "We stack layers. The residual\nfunction is learned instead. Then we test.";
    expect(sentenceAround(page, "residual function")).toBe("The residual function is learned instead.");
  });
  it("falls back to the words themselves when they are not in the page text", () => {
    expect(sentenceAround("Nothing here.", "missing words")).toBe("missing words");
  });
  it("fills the four slots, and leaves the goal line out when there is no goal", () => {
    const prompt = buildAskPrompt({ marked: "scaled dot-product", sentence: "We call it scaled dot-product attention.", section: "3.2.1 ...", goal: "" });
    expect(prompt).toContain('"scaled dot-product"');
    expect(prompt).toContain("We call it scaled dot-product attention.");
    expect(prompt).toContain("3.2.1 ...");
    expect(prompt).not.toContain("{goal}");
    expect(buildAskPrompt({ marked: "m", sentence: "s", section: "t", goal: "learn attention" })).toContain("learn attention");
  });
  it("inserts text literally, even text that looks like a replacement pattern", () => {
    expect(buildAskPrompt({ marked: "cost $1 and $&", sentence: "s", section: "t", goal: "" })).toContain('"cost $1 and $&"');
  });
  it("is one named constant with the four slots", () => {
    for (const slot of ["{marked}", "{sentence}", "{section}", "{goal}"]) expect(ASK_PROMPT).toContain(slot);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd web && npm test -- ask`
Expected: FAIL, `./ask` does not resolve.

- [ ] **Step 3: Write `ask.ts` and `AskElsewhere.tsx`**

`web/src/paper/ask.ts`:

```ts
/** The one prompt Ask elsewhere copies (addendum 6.2). Fixed text with four slots; the tool sends it nowhere. */
export const ASK_PROMPT = [
  "I am reading a research paper.{goal}",
  "",
  "I do not understand this part:",
  "\"{marked}\"",
  "",
  "It is in this sentence:",
  "\"{sentence}\"",
  "",
  "The section it is in:",
  "{section}",
  "",
  "Explain what the marked part means here, and what I would need to know to understand it.",
].join("\n");
export const GOAL_LINE = " I am reading it to: {goal}";

const SENTENCE_END = /[.!?](?=\s|$)/;

/** The sentence holding `quote` in the page text, matched with whitespace flattened (addendum 5.2's spirit). */
export function sentenceAround(pageText: string, quote: string): string {
  const flat = pageText.replace(/\s+/g, " ");
  const needle = quote.replace(/\s+/g, " ").trim();
  const at = needle ? flat.indexOf(needle) : -1;
  if (at === -1) return needle;
  const before = flat.slice(0, at);
  const start = Math.max(before.lastIndexOf(". "), before.lastIndexOf("? "), before.lastIndexOf("! "));
  const tail = flat.slice(at + needle.length).search(SENTENCE_END);
  const end = tail === -1 ? flat.length : at + needle.length + tail + 1;
  return flat.slice(start === -1 ? 0 : start + 2, end).trim();
}

/** Function replacers, so a `$` in the paper's text is inserted as itself. */
export function buildAskPrompt({ marked, sentence, section, goal }: { marked: string; sentence: string; section: string; goal: string }): string {
  const goalText = goal.trim() ? GOAL_LINE.replace("{goal}", () => goal.trim()) : "";
  return ASK_PROMPT
    .replace("{goal}", () => goalText)
    .replace("{marked}", () => marked.replace(/\s+/g, " ").trim())
    .replace("{sentence}", () => sentence)
    .replace("{section}", () => section);
}
```

`web/src/paper/AskElsewhere.tsx`:

```tsx
import { useState } from "react";
import { newEdge } from "../model/links";
import { newNote } from "../model/notes";
import { spotForNoteOn } from "../model/placement";
import { sectionAt } from "../model/sections";
import type { Highlight } from "../model/types";
import { useBoard } from "../state/BoardProvider";
import { buildAskPrompt, sentenceAround } from "./ask";

export const COPIED_MESSAGE = "Prompt copied. Paste it into the AI you use, then paste its answer into the AI note.";
export const COPY_FAILED_MESSAGE = "Could not copy the prompt. Copy it from here:";

/** Copies a prompt and makes an empty AI note connected to the mark (D14). The tool itself calls nothing. */
export function AskElsewhere({ highlight }: { highlight: Highlight }) {
  const { state, dispatch, source } = useBoard();
  const [asked, setAsked] = useState<{ copied: boolean; prompt: string } | null>(null);
  const ask = async () => {
    const at = highlight.anchor.rects[0];
    const pageText = source.page_text.find((p) => p.page === at.page)?.text ?? "";
    const prompt = buildAskPrompt({
      marked: highlight.anchor.quote.exact, sentence: sentenceAround(pageText, highlight.anchor.quote.exact),
      section: sectionAt(source, at)?.text ?? "", goal: state.board.goal,
    });
    const note = newNote({ ...spotForNoteOn(state.board, highlight.id), origin: "ai" });
    dispatch({ type: "add", nodes: [note], edges: [newEdge(highlight.id, note.id)] });
    try {
      await navigator.clipboard.writeText(prompt);
      setAsked({ copied: true, prompt });
    } catch (failure) {
      console.error(COPY_FAILED_MESSAGE, failure);
      setAsked({ copied: false, prompt });
    }
  };
  return (
    <>
      <button className="action" onClick={() => void ask()} title="Copy a prompt for an AI, and make a note marked AI for its answer">Ask elsewhere</button>
      {asked && (
        <div className="ask-result" role="status">
          {asked.copied ? COPIED_MESSAGE : COPY_FAILED_MESSAGE}
          {!asked.copied && <textarea readOnly value={asked.prompt} aria-label="Prompt" />}
        </div>
      )}
    </>
  );
}
```

In `MarkPopover.tsx`, put `<AskElsewhere highlight={highlight} />` in the actions row after Add note. The new AI note appears in the popover's note list through `notesConnectedTo`, with the AI placeholder.

Add to `paper.css`:

```css
.ask-result { font-size: var(--text-ui-small); color: var(--ink-muted); display: flex; flex-direction: column; gap: 4px; }
.ask-result textarea { min-height: 80px; font-family: var(--font-mono); font-size: 11px; }
```

- [ ] **Step 4: Run the tests, then check by hand**

Run: `cd web && npm test && npm run build`
Expected: all pass.

By hand: set the goal to "understand attention" in the board's JSON or, after 3C, in the goal box. Click a mark, Ask elsewhere: paste into a text editor; the prompt holds the marked words, their sentence, the section, and the goal. An empty note marked AI is in the popover and on the board. Tag the mark `question`: it stays on the question list (after 3C) until a note of your own is connected.

- [ ] **Step 5: Commit**

```bash
git add web/src/paper web/src/styles/paper.css
git commit -m "feat(web): Ask elsewhere copies a prompt and makes an AI note for the answer"
```

---

### Task 3A.5: The paper's own links (D10) and find in paper (D13)

The annotation layer is on. An internal link scrolls the paper to its destination's page and height; an external link opens in a new tab. Find, in the selection popover, lists every place the selected words appear, with page, section and a few words either side; clicking one scrolls there and marks the words in that page's text layer.

**Files:**
- Create: `web/src/paper/links.ts`, `web/src/paper/find.ts`, `web/src/paper/FindPanel.tsx`
- Modify: `web/src/paper/PaperView.tsx`, `web/src/paper/SelectionPopover.tsx`, `web/src/PaperScreen.tsx`, `web/src/styles/paper.css`
- Test: `web/src/paper/links.test.ts`, `web/src/paper/find.test.ts`

**Interfaces:**
- Produces: `destinationTop(dest: unknown, pageHeight: number): number | null`; `FindHit`, `findInPaper(query, source): FindHit[]`, `FIND_CONTEXT_WORDS = 4`, `FIND_MAX_HITS = 200`, `markMatches(text, query): string`; `<FindPanel query onPick onClose />`; `PaperView` prop `findMark: { page: number; query: string } | null`; `SelectionPopover` prop `onFind?`.

- [ ] **Step 1: Write the failing tests**

`web/src/paper/links.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { destinationTop } from "./links";

const ref = { num: 12, gen: 0 };

describe("destinationTop (D10)", () => {
  it("turns an XYZ destination's top, in PDF user space, into a y from the page's top", () => {
    // Attention p.2 "section 3.2" links to subsection.3.2: XYZ top 117.119 on a 792 pt page.
    expect(destinationTop([ref, { name: "XYZ" }, 108, 117.119, 0], 792)).toBeCloseTo(674.881, 3);
  });
  it("reads FitH, FitBH and FitR tops too, and clamps to the page", () => {
    expect(destinationTop([ref, { name: "FitH" }, 700], 792)).toBeCloseTo(92, 3);
    expect(destinationTop([ref, { name: "FitR" }, 0, 100, 500, 900], 792)).toBe(0);
  });
  it("is null for a whole-page destination or a missing top", () => {
    expect(destinationTop([ref, { name: "Fit" }], 792)).toBeNull();
    expect(destinationTop([ref, { name: "XYZ" }, null, null, null], 792)).toBeNull();
    expect(destinationTop("named-dest", 792)).toBeNull();
  });
});
```

`web/src/paper/find.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Source } from "../model/types";
import { findInPaper, markMatches } from "./find";

const source = {
  page_text: [
    { page: 0, text: "Deep residual\nlearning eases training. Residual learning works." },
    { page: 1, text: "Nothing to see." },
  ],
  sections: [
    { id: "sec-1", number: "1", depth: 1, title: "Intro", heading_rect: { page: 0, rect: [0, 0, 1, 1] }, extent: [], text: "Deep residual learning eases training." },
    { id: "sec-2", number: "2", depth: 1, title: "More", heading_rect: { page: 0, rect: [0, 0, 1, 1] }, extent: [], text: "Residual learning works." },
  ],
} as unknown as Source;

describe("find in paper (D13)", () => {
  it("finds every place, ignoring case and line breaks, with a few words either side and its section", () => {
    const hits = findInPaper("residual learning", source);
    expect(hits.map((h) => [h.page, h.match, h.section?.id])).toEqual([[0, "residual learning", "sec-1"], [0, "Residual learning", "sec-2"]]);
    expect(hits[0].before).toBe("Deep");
    expect(hits[0].after).toBe("eases training. Residual learning");
  });
  it("finds nothing for an empty query", () => {
    expect(findInPaper("   ", source)).toEqual([]);
  });
  it("marks matches in a text-layer string, escaping the paper's own text", () => {
    expect(markMatches("a <b> Residual x", "residual")).toBe('a &lt;b&gt; <mark class="find-hit">Residual</mark> x');
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd web && npm test -- links find`
Expected: FAIL, two unresolved modules.

- [ ] **Step 3: Write `links.ts`, `find.ts` and `FindPanel.tsx`**

`web/src/paper/links.ts`:

```ts
/** A PDF destination is [page ref, {name}, ...args] in PDF user space, origin bottom-left. The top of the view it asks
 *  for, as a y from the page's top edge in page space (addendum 2), or null for "the page itself" (D10). */
export function destinationTop(dest: unknown, pageHeight: number): number | null {
  if (!Array.isArray(dest) || dest.length < 2) return null;
  const kind = (dest[1] as { name?: string } | null)?.name;
  const top = kind === "XYZ" ? dest[3] : kind === "FitH" || kind === "FitBH" ? dest[2] : kind === "FitR" ? dest[5] : null;
  if (typeof top !== "number") return null;
  return Math.min(Math.max(pageHeight - top, 0), pageHeight);
}
```

`web/src/paper/find.ts`:

```ts
import type { Section, Source } from "../model/types";

export const FIND_CONTEXT_WORDS = 4;
export const FIND_MAX_HITS = 200;

export type FindHit = { page: number; start: number; end: number; before: string; match: string; after: string; section: Section | null };

/** Lower case with every whitespace removed, and where each kept character was: addendum 5.2's trick, so a phrase
 *  broken across lines still matches. */
function squeeze(text: string): { flat: string; offsets: number[] } {
  const chars: string[] = [];
  const offsets: number[] = [];
  for (let i = 0; i < text.length; i++) if (!/\s/.test(text[i])) { chars.push(text[i].toLowerCase()); offsets.push(i); }
  return { flat: chars.join(""), offsets };
}

const words = (text: string) => text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);

type Squeezed = { section: Section; flat: string };

/** The section whose text holds the hit with its words either side (addendum 6.2). Context can run past a section's
 *  end, so the hit with only the words before it, then with only the words after it, are tried next. */
function sectionOf(sections: Squeezed[], before: string, match: string, after: string): Section | null {
  for (const text of [`${before} ${match} ${after}`, `${before} ${match}`, `${match} ${after}`]) {
    const needle = squeeze(text).flat;
    const found = sections.find((s) => s.flat.includes(needle));
    if (found) return found.section;
  }
  return null;
}

/** Every place the query appears, with its page, its section and a few words either side (addendum 6.2). Suggests nothing. */
export function findInPaper(query: string, source: Source): FindHit[] {
  const needle = squeeze(query).flat;
  if (!needle) return [];
  const sections: Squeezed[] = source.sections.map((s) => ({ section: s, flat: squeeze(s.text).flat }));
  const hits: FindHit[] = [];
  for (const { page, text } of source.page_text) {
    const { flat, offsets } = squeeze(text);
    for (let at = flat.indexOf(needle); at !== -1 && hits.length < FIND_MAX_HITS; at = flat.indexOf(needle, at + needle.length)) {
      const start = offsets[at];
      const end = offsets[at + needle.length - 1] + 1;
      const before = words(text.slice(0, start)).slice(-FIND_CONTEXT_WORDS).join(" ");
      const after = words(text.slice(end)).slice(0, FIND_CONTEXT_WORDS).join(" ");
      const match = text.slice(start, end).replace(/\s+/g, " ");
      hits.push({ page, start, end, before, match, after, section: sectionOf(sections, before, match, after) });
    }
  }
  return hits;
}

const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A text-layer string with the query wrapped in <mark>. react-pdf inserts it as HTML, so the paper's text is escaped. */
export function markMatches(text: string, query: string): string {
  const q = query.trim();
  if (!q) return escapeHtml(text);
  const pattern = new RegExp(escapeRegExp(q).replace(/\s+/g, "\\s+"), "gi");
  let out = "";
  let last = 0;
  for (const m of text.matchAll(pattern)) {
    out += `${escapeHtml(text.slice(last, m.index))}<mark class="find-hit">${escapeHtml(m[0])}</mark>`;
    last = m.index! + m[0].length;
  }
  return out + escapeHtml(text.slice(last));
}
```

`web/src/paper/FindPanel.tsx`:

```tsx
import { useMemo } from "react";
import { sectionRef } from "../model/sections";
import { useBoard } from "../state/BoardProvider";
import { FIND_MAX_HITS, findInPaper, type FindHit } from "./find";

export function FindPanel({ query, onPick, onClose }: { query: string; onPick: (hit: FindHit) => void; onClose: () => void }) {
  const { source } = useBoard();
  const hits = useMemo(() => findInPaper(query, source), [query, source]);
  const count = hits.length === FIND_MAX_HITS ? `${FIND_MAX_HITS}+` : String(hits.length);
  return (
    <aside className="find-panel" aria-label="Find in paper">
      <header><b>“{query}”</b> <span>{count} place{hits.length === 1 ? "" : "s"}</span>
        <button className="quiet close" aria-label="Close" onClick={onClose}>×</button></header>
      <ul>
        {hits.map((hit) => (
          <li key={`${hit.page}-${hit.start}`}>
            <button type="button" onClick={() => onPick(hit)}>
              <span className="where">p{hit.page + 1}{hit.section ? ` · ${sectionRef(hit.section)}` : ""}</span>
              …{hit.before} <mark>{hit.match}</mark> {hit.after}…
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
```

- [ ] **Step 4: Wire links and find**

In `PaperView.tsx`: import `"react-pdf/dist/Page/AnnotationLayer.css"`; factor the scroll in the focus effect into `scrollToPoint(page, y)` and use it from both; turn the annotation layer on; add the `findMark` prop.

```tsx
export const FOCUS_OFFSET_PX = 80;

  const scrollToPoint = useCallback((page: number, y: number) => {
    const el = container.current?.querySelector<HTMLElement>(`.react-pdf__Page[data-page-number="${page + 1}"]`);
    if (!el || !container.current) return;
    const canvas = el.querySelector<HTMLElement>(".react-pdf__Page__canvas") ?? el;
    el.scrollIntoView({ block: "start" });
    container.current.scrollBy({ top: y * (canvas.clientWidth / source.pages[page].width) - FOCUS_OFFSET_PX });
  }, [source]);

  useEffect(() => {
    if (!focus || !ready) return;
    scrollToPoint(focus.page, focus.rect[1]);
    onFocusHandled();   // a jump is an event: consumed, so it never re-applies
  }, [focus, ready, scrollToPoint, onFocusHandled]);

  const revealFindHit = (page: number) => {
    container.current?.querySelector<HTMLElement>(`.react-pdf__Page[data-page-number="${page + 1}"] .find-hit`)?.scrollIntoView({ block: "center" });
  };
...
      <Document file={api.pdfUrl(paperId)} onLoadSuccess={() => setReady(true)} loading={<div className="loading">Loading the paper</div>}
                onItemClick={({ dest, pageIndex }) => scrollToPoint(pageIndex, destinationTop(dest, source.pages[pageIndex].height) ?? 0)}
                externalLinkTarget="_blank" externalLinkRel="noopener noreferrer">
        {source.pages.map((p) => (
          <div key={p.index} className="page-wrap">
            <Page pageIndex={p.index} width={PAGE_WIDTH_PX} renderAnnotationLayer renderTextLayer
                  customTextRenderer={findMark?.page === p.index ? ({ str }) => markMatches(str, findMark.query) : undefined}
                  onRenderTextLayerSuccess={() => { if (findMark?.page === p.index) revealFindHit(p.index); }} />
            ...overlay as before
```

`SelectionPopover` gains an optional `onFind` drawn as a quiet button "Find" before the close button. In `PaperScreen.tsx`, `Pending` gains `text: string` (the selection's full text, `window.getSelection()?.toString() ?? ""`, captured in `onSelect`), and:

```tsx
export const FIND_QUERY_MAX = 80;

  const [find, setFind] = useState<string | null>(null);
  const [findMark, setFindMark] = useState<{ page: number; query: string } | null>(null);
  const onPickHit = (hit: FindHit) => { setFindMark({ page: hit.page, query: hit.match }); setJump({ page: hit.page, rect: [0, 0, 0, 0] }); };
...
      onFind={pending.text.trim() ? () => { setFind(pending.text.replace(/\s+/g, " ").trim().slice(0, FIND_QUERY_MAX)); setPending(null); } : undefined}
...
      {find && <FindPanel query={find} onPick={onPickHit} onClose={() => { setFind(null); setFindMark(null); }} />}
```

and passes `findMark` to `PaperView`.

Add to `paper.css`:

```css
/* the paper's own links sit over the text; our overlay stays under them */
.page-wrap .annotationLayer .linkAnnotation > a:hover { background: var(--cut-tint); }

/* find in paper */
.find-panel { position: fixed; top: calc(var(--topbar-height) + 56px); right: 16px; z-index: 8; width: 300px; max-height: 60vh; overflow: auto; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow-raised); }
.find-panel header { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-bottom: 1px solid var(--border); }
.find-panel header .close { margin-left: auto; }
.find-panel ul { list-style: none; margin: 0; padding: 0; }
.find-panel li button { width: 100%; padding: 6px 10px; border: 0; border-bottom: 1px solid var(--border); background: none; text-align: left; font-family: var(--font-read); font-size: 12.5px; }
.find-panel li button:hover { background: var(--surface-muted); }
.find-panel .where { display: block; font-family: var(--font-ui); font-size: var(--text-ui-small); color: var(--ink-muted); }
.find-panel mark, .react-pdf__Page__textContent mark.find-hit { background: var(--hl); color: inherit; }
```

- [ ] **Step 5: Run the tests, then check by hand**

Run: `cd web && npm test && npm run build`
Expected: all pass.

By hand on Attention: on page 2, click "3.2" in "as described in section 3.2": the paper scrolls to page 3 with the heading "3.2 Attention" near the top. Click a reference number "[13]": the paper scrolls to the reference list. Select "attention", Find: a list with page and section; click a hit on page 5: the paper scrolls there and the word is marked. A text drag that starts on a link still selects text.

- [ ] **Step 6: Commit**

```bash
git add web/src/paper web/src/PaperScreen.tsx web/src/styles/paper.css
git commit -m "feat(web): follow the paper's own links, and find a word everywhere in the paper"
```

---

### Task 3A.6: The paper opens where you left it (D5)

The paper saves `paper_scroll = {page, y}` 300 ms after scrolling stops (and so on the board's save debounce), and restores it once when the paper loads. Page wraps are sized from `source.pages` before their canvases render, so the offsets are right on the first frame.

**Files:**
- Create: `web/src/paper/scroll.ts`
- Modify: `web/src/paper/PaperView.tsx`, `web/src/PaperScreen.tsx`, `web/src/styles/paper.css`, `web/e2e/step3.spec.ts` (only if a selector there broke)
- Test: `web/src/paper/scroll.test.ts`

**Interfaces:**
- Produces: `PageBox = { page: number; top: number; scale: number }`; `toPaperScroll(scrollTop, pages): PaperScroll | null`; `fromPaperScroll(scroll, pages): number | null`; `samePaperScroll(a, b): boolean`; `SCROLL_SAVE_DELAY_MS = 300`; `PaperView` props `paperScroll: PaperScroll | null | undefined`, `onScrollSettled(scroll: PaperScroll | null)`.

- [ ] **Step 1: Write the failing test**

`web/src/paper/scroll.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { fromPaperScroll, samePaperScroll, toPaperScroll } from "./scroll";

const pages = [{ page: 0, top: 24, scale: 1.25 }, { page: 1, top: 1034, scale: 1.25 }, { page: 2, top: 2044, scale: 1.25 }];

describe("paper_scroll (addendum 4)", () => {
  it("is the page at the top of the view and how far down it the view starts, in points", () => {
    expect(toPaperScroll(1034 + 250, pages)).toEqual({ page: 1, y: 200 });
    expect(toPaperScroll(0, pages)).toEqual({ page: 0, y: 0 });
  });
  it("round-trips through a scrollTop", () => {
    expect(fromPaperScroll({ page: 2, y: 100 }, pages)).toBe(2044 + 125);
    expect(fromPaperScroll(toPaperScroll(1500, pages)!, pages)).toBeCloseTo(1500, 6);
    expect(fromPaperScroll({ page: 9, y: 0 }, pages)).toBeNull();
    expect(toPaperScroll(10, [])).toBeNull();
  });
  it("treats positions within half a point as the same, so a restore does not save again", () => {
    expect(samePaperScroll({ page: 1, y: 200.2 }, { page: 1, y: 200 })).toBe(true);
    expect(samePaperScroll({ page: 1, y: 200 }, null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd web && npm test -- scroll`
Expected: FAIL, `./scroll` does not resolve.

- [ ] **Step 3: Write `scroll.ts` and wire it**

`web/src/paper/scroll.ts`:

```ts
import type { PaperScroll } from "../model/types";

export const SCROLL_SAVE_DELAY_MS = 300;
export const SAME_SCROLL_PT = 0.5;

/** A page in the scrolling paper: its top in px from the container's content top, and px per point. */
export type PageBox = { page: number; top: number; scale: number };

/** The page at the top of the view and how far down it the view starts, in points, so it survives a zoom (addendum 4). */
export function toPaperScroll(scrollTop: number, pages: PageBox[]): PaperScroll | null {
  if (!pages.length) return null;
  let current = pages[0];
  for (const p of pages) if (p.top <= scrollTop) current = p;
  return { page: current.page, y: Math.max(0, (scrollTop - current.top) / current.scale) };
}

export function fromPaperScroll(scroll: PaperScroll, pages: PageBox[]): number | null {
  const box = pages.find((p) => p.page === scroll.page);
  return box ? box.top + scroll.y * box.scale : null;
}

export function samePaperScroll(a: PaperScroll | null | undefined, b: PaperScroll | null | undefined): boolean {
  if (!a || !b) return a === b;
  return a.page === b.page && Math.abs(a.y - b.y) < SAME_SCROLL_PT;
}

export function pageBoxes(container: HTMLElement, widths: number[], pageWidthPx: number): PageBox[] {
  return Array.from(container.querySelectorAll<HTMLElement>(".page-wrap")).map((el, i) => ({ page: i, top: el.offsetTop, scale: pageWidthPx / widths[i] }));
}
```

In `PaperView.tsx`, size each wrap before it renders and restore once, then report:

```tsx
          <div key={p.index} className="page-wrap" style={{ height: p.height * (PAGE_WIDTH_PX / p.width) }}>

  const restored = useRef(false);
  const widths = useMemo(() => source.pages.map((p) => p.width), [source]);
  useLayoutEffect(() => {
    if (!ready || restored.current || !container.current) return;
    restored.current = true;
    const top = paperScroll ? fromPaperScroll(paperScroll, pageBoxes(container.current, widths, PAGE_WIDTH_PX)) : null;
    if (top !== null) container.current.scrollTop = top;
  }, [ready, paperScroll, widths]);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (settle.current) clearTimeout(settle.current); }, []);
  const onScroll = () => {
    if (!restored.current) return;
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      const el = container.current;
      if (el) onScrollSettled(toPaperScroll(el.scrollTop, pageBoxes(el, widths, PAGE_WIDTH_PX)));
    }, SCROLL_SAVE_DELAY_MS);
  };
...
    <div ref={container} className={...} onMouseDown={onMouseDown} onMouseUp={onMouseUp} onScroll={onScroll}>
```

In `PaperScreen.tsx`:

```tsx
                 paperScroll={state.board.paper_scroll}
                 onScrollSettled={(scroll) => { if (!samePaperScroll(scroll, state.board.paper_scroll)) dispatch({ type: "setPaperScroll", scroll }); }}
```

In `paper.css`, make `.paper` the offset parent of its pages: add `position: relative;` to the `.paper` rule.

- [ ] **Step 4: Run everything**

Run: `cd web && npm test && npm run build && npm run e2e`
Expected: all pass; Playwright 12 passed. If `step3.spec.ts` broke on a changed selector, fix the spec's selector, never the behaviour it checks.

By hand: scroll to the middle of page 6, wait a second, reload, pick the paper: it opens at the same line. Switch to the board and back: the paper has not moved.

- [ ] **Step 5: Commit**

```bash
git add web/src/paper web/src/PaperScreen.tsx web/src/styles/paper.css web/e2e/step3.spec.ts
git commit -m "feat(web): the paper reopens at the page and line where you left it"
```

---

## Task 3B: The board (parallel)

**Owns:** `web/src/board/**`, `web/src/styles/board.css`, `web/e2e/board.spec.ts`, `web/e2e/restyle.spec.ts`.
**Must not touch:** `web/src/model/**`, `web/src/state/**`, `web/src/api/**`, `web/src/paper/**`, `web/src/PaperScreen.tsx`, `web/src/App.tsx`, `web/src/tags/**`, `web/src/panels/**`, `paper.css`, `shell.css`, `tokens.css`, `tags.css`, `step3.spec.ts`. Keep the exports `MARGIN`, `GAP`, `CHUNK_WIDTH`, `DEFAULT_CHUNK_HEIGHT`, `nextChunkPosition` (`layout.ts`) and `paperWords`, `reflow` (`marks.ts`): other tasks import them.
**Consumes (from 3.0):** `useBoard()` with `split`, `flush`; `useNote`; the actions `add`, `remove`, `replaceNode`, `upsertNodes` (with `merge`), `setTags`, `nodes`, `viewport`; `resolveEdges`, `ResolvedEdge`; `highlightsIn`, `linesInside`; `notesConnectedTo`, `newEdge`; `hiddenNodeIds`, `markDimmed`; `trayOrder`; `trayRow`, `TRAY_PAD`, `TRAY_PIECE_WIDTH`; `sectionLabel`; `newNote`, `firstLine`; `TagPicker`, `TagChips`, `useTags`; `api.renderUrl`, `CLIP_DPI`; `d3-force`; tokens `--ai`, `--ai-tint`, `--dim`, `--ghost`.
**Produces:** the board half of the Shared DOM contract. `BoardView`'s props stay `{ onOpenInPaper, active, focusNode, onFocusHandled }`.

Five sub-tasks, each ending with `npm test && npm run build` green and a commit; `npm run e2e` at the end of 3B.1, 3B.3 and 3B.5.

### Task 3B.1: A chunk shows its blocks, and its marks by line (D1, D2)

A chunk's body is its `blocks` in order: text blocks reflowed with the marks painted; clip blocks as images from `GET /render` at 216 dpi, sized before they load. A mark is painted only in the blocks that hold one of its lines, and where only part of its quote is in a block (it runs across two chunks, or across a displayed equation), that part is painted. The head counts the marks painted and the notes connected to the chunk or its marks. Each mark's handle sits at its first painted line; a collapsed chunk puts them on its top edge.

**Files:**
- Create: `web/src/board/nodes/ChunkBody.tsx`, `web/src/board/nodes/Counts.tsx`, `web/src/board/markOffsets.ts`, `web/src/board/handles.ts`
- Modify: `web/src/board/marks.ts`, `web/src/board/nodes/ChunkNode.tsx`, `web/src/board/nodes/FigureNode.tsx`, `web/src/styles/board.css`, `web/e2e/board.spec.ts`
- Test: `web/src/board/marks.test.ts` (append), `web/src/board/markOffsets.test.ts`

**Interfaces:**
- Produces: `PaintedBlock = { block: Block; runs: Run[] }`, `paintBlocks(blocks, marks, words): PaintedBlock[]`, `paintedIds(painted): Set<string>`, `MIN_PARTIAL_CHARS = 12`; `markOffsets(body: HTMLElement): Map<string, number>`, `useMarkOffsets(bodyRef, nodeId, collapsed, contentKey)`, `HEAD_MIDDLE_PX = 15`; `inHandle(id) = "<id>-in"`, `outHandle(id) = "<id>-out"`; `clipPx(pt)`, `CLIP_PAD_PT = 4`.

- [ ] **Step 1: Write the failing tests**

Append to `web/src/board/marks.test.ts` (add `paintBlocks, paintedIds` to its import; `Block`, `Highlight`, `Rect` types):

```ts
describe("paintBlocks (D1, D2)", () => {
  const quote = (exact: string) => ({ exact, prefix: "", suffix: "" });
  const line = (rect: Rect) => ({ page: 0, rect });
  const mark = (id: string, exact: string, lines: Rect[]): Highlight => ({ id, tags: [], anchor: { rects: lines.map(line), quote: quote(exact), position: 0, state: "anchored" } });
  const text = (rect: Rect, t: string): Block => ({ kind: "text", page: 0, rect, text: t });
  const none = new Set<string>();

  it("paints a mark in the block that holds its line, and leaves a clip unpainted", () => {
    const blocks: Block[] = [text([0, 0, 300, 100], "The residual function is learned."), { kind: "clip", page: 0, rect: [0, 110, 300, 150], label: "formula" }];
    const painted = paintBlocks(blocks, [mark("h-1", "residual function", [[30, 10, 150, 20]])], none);
    expect(painted[0].runs).toEqual([
      { text: "The ", highlightId: null }, { text: "residual function", highlightId: "h-1" }, { text: " is learned.", highlightId: null },
    ]);
    expect(painted[1].runs).toEqual([]);
    expect(paintedIds(painted)).toEqual(new Set(["h-1"]));
  });

  it("a mark split across two blocks paints its part in each", () => {
    const first = text([0, 0, 300, 100], "Attention maps a query and a set of key-value pairs");
    const second = text([0, 150, 300, 250], "to an output, where the query, keys and values are vectors.");
    const across = mark("h-1", "a set of key-value pairs to an output, where", [[100, 80, 290, 95], [0, 150, 200, 165]]);
    const [a, b] = paintBlocks([first, second], [across], none);
    expect(a.runs.find((r) => r.highlightId)?.text).toBe("a set of key-value pairs");
    expect(b.runs.find((r) => r.highlightId)?.text).toBe("to an output, where");
  });

  it("paints a whole block that lies inside a longer mark", () => {
    const block = text([0, 100, 300, 120], "keys and values");
    const long = mark("h-1", "the queries, keys and values are all vectors", [[0, 80, 300, 95], [0, 102, 300, 118], [0, 125, 300, 140]]);
    expect(paintBlocks([block], [long], none)[0].runs).toEqual([{ text: "keys and values", highlightId: "h-1" }]);
  });

  it("does not paint a mark whose lines are all outside the block, even where its words are", () => {
    const block = text([0, 0, 300, 100], "the same words appear here");
    const elsewhere = mark("h-1", "the same words", [[0, 500, 100, 510]]);
    expect(paintBlocks([block], [elsewhere], none)[0].runs.every((r) => r.highlightId === null)).toBe(true);
  });

  it("does not guess from a fragment shorter than MIN_PARTIAL_CHARS", () => {
    const block = text([0, 0, 300, 100], "ends with a key");
    const across = mark("h-1", "a key thing that continues on", [[200, 10, 290, 20]]);
    expect(paintBlocks([block], [across], none)[0].runs.every((r) => r.highlightId === null)).toBe(true);
  });
});
```

`web/src/board/markOffsets.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { markOffsets } from "./markOffsets";

function element(tag: string, layout: Record<string, number>, highlightId?: string): HTMLElement {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(layout)) Object.defineProperty(el, key, { value, configurable: true });
  if (highlightId) el.dataset.highlightId = highlightId;
  return el;
}

describe("markOffsets (addendum 4.0: a handle at the mark's first line)", () => {
  it("is the middle of each mark's first painted line, from the card's top, clamped into the visible body", () => {
    const body = element("div", { offsetTop: 30, clientHeight: 200, scrollTop: 0 });
    body.append(
      element("mark", { offsetTop: 40, offsetHeight: 18 }, "h-1"),
      element("mark", { offsetTop: 90, offsetHeight: 18 }, "h-1"),
      element("mark", { offsetTop: 500, offsetHeight: 18 }, "h-2"),
    );
    expect(markOffsets(body)).toEqual(new Map([["h-1", 30 + 40 + 9], ["h-2", 30 + 200]]));
  });
  it("follows the body's scroll", () => {
    const body = element("div", { offsetTop: 30, clientHeight: 200, scrollTop: 100 });
    body.append(element("mark", { offsetTop: 150, offsetHeight: 18 }, "h-1"));
    expect(markOffsets(body).get("h-1")).toBe(30 + 150 - 100 + 9);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd web && npm test -- marks markOffsets`
Expected: FAIL, `paintBlocks` is not exported and `./markOffsets` does not resolve.

- [ ] **Step 3: Paint by block, with partial marks**

In `web/src/board/marks.ts`, add `import { linesInside } from "../model/geometry";` and `Block` to the type import, then:

```ts
/** Below this many characters a quote's end matching a block's end is a coincidence, not the mark. */
export const MIN_PARTIAL_CHARS = 12;

/** The part of a mark in this text when the whole quote is not: it starts here and runs on past the end, it started
 *  before and ends here, or the whole text lies inside it (D1: a card paints only its own lines). */
function partialSpan(s: string, needle: string): { at: number; length: number } | null {
  for (let k = Math.min(needle.length - 1, s.length); k >= MIN_PARTIAL_CHARS; k--) {
    if (s.endsWith(needle.slice(0, k))) return { at: s.length - k, length: k };
    if (s.startsWith(needle.slice(needle.length - k))) return { at: 0, length: k };
  }
  if (s.length >= MIN_PARTIAL_CHARS && needle.includes(s)) return { at: 0, length: s.length };
  return null;
}
```

In `paintMarks`, replace the line `if (!candidates.length || (candidates.length > 1 && candidates[0].score === candidates[1].score)) continue;` with:

```ts
    if (!candidates.length) {
      const part = partialSpan(s, needle);
      if (part) spans.push({ start: offsets[part.at], end: offsets[part.at + part.length - 1] + 1, id: mark.id });
      continue;
    }
    if (candidates.length > 1 && candidates[0].score === candidates[1].score) continue;
```

and append:

```ts
export type PaintedBlock = { block: Block; runs: Run[] };

/** A chunk's blocks in reading order (addendum 4.0). A text block paints the marks with a line inside it; a clip block
 *  is an image and paints nothing. */
export function paintBlocks(blocks: Block[], marks: Highlight[], words: ReadonlySet<string>): PaintedBlock[] {
  return blocks.map((block) => {
    if (block.kind === "clip") return { block, runs: [] };
    const here = marks.filter((m) => linesInside(m, [{ page: block.page, rect: block.rect }]).length > 0);
    return { block, runs: paintMarks(reflow(block.text, words), here, words) };
  });
}

export function paintedIds(painted: PaintedBlock[]): Set<string> {
  return new Set(painted.flatMap(({ runs }) => runs.flatMap((run) => (run.highlightId ? [run.highlightId] : []))));
}
```

`web/src/board/markOffsets.ts`:

```ts
import { useEffect, useLayoutEffect, useState, type RefObject } from "react";
import { useUpdateNodeInternals } from "@xyflow/react";

/** Where a handle sits when its mark is not painted in the body: level with the card's title. */
export const HEAD_MIDDLE_PX = 15;

/** The middle of each mark's first painted line, in px from the card's top, clamped into the visible body. Layout px
 *  (offsetTop), which React Flow's zoom does not scale; the body is position: relative, the card's wrapper absolute. */
export function markOffsets(body: HTMLElement): Map<string, number> {
  const out = new Map<string, number>();
  const top = body.offsetTop;
  const bottom = top + body.clientHeight;
  for (const el of Array.from(body.querySelectorAll<HTMLElement>("mark[data-highlight-id]"))) {
    const id = el.dataset.highlightId!;
    if (out.has(id)) continue;
    const y = top + el.offsetTop - body.scrollTop + el.offsetHeight / 2;
    out.set(id, Math.min(Math.max(y, top), bottom));
  }
  return out;
}

function sameOffsets(a: ReadonlyMap<string, number>, b: ReadonlyMap<string, number>): boolean {
  if (a.size !== b.size) return false;
  for (const [key, value] of a) if (b.get(key) !== value) return false;
  return true;
}

/** Keeps the offsets current as the body resizes or scrolls, and tells React Flow the handles moved. */
export function useMarkOffsets(bodyRef: RefObject<HTMLElement | null>, nodeId: string, collapsed: boolean, contentKey: unknown): ReadonlyMap<string, number> {
  const updateNodeInternals = useUpdateNodeInternals();
  const [offsets, setOffsets] = useState<ReadonlyMap<string, number>>(() => new Map());
  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (collapsed || !body) { setOffsets((prev) => (prev.size ? new Map() : prev)); return; }
    const measure = () => { const next = markOffsets(body); setOffsets((prev) => (sameOffsets(prev, next) ? prev : next)); };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(body);
    body.addEventListener("scroll", measure);
    return () => { observer.disconnect(); body.removeEventListener("scroll", measure); };
  }, [bodyRef, collapsed, contentKey]);
  useEffect(() => { updateNodeInternals(nodeId); }, [offsets, nodeId, updateNodeInternals]);
  return offsets;
}
```

`web/src/board/handles.ts` (3B.2 adds to it):

```ts
/** A card's own handles. An edge end with no handle is the card itself (addendum 4.0); React Flow still needs a handle
 *  id on both ends, and in Loose mode a target may be any handle. */
export const inHandle = (nodeId: string) => `${nodeId}-in`;
export const outHandle = (nodeId: string) => `${nodeId}-out`;
```

- [ ] **Step 4: Draw the blocks, the counts and the handles**

`web/src/board/nodes/ChunkBody.tsx`:

```tsx
import { api, CLIP_DPI } from "../../api/client";
import { useBoard } from "../../state/BoardProvider";
import type { PaintedBlock } from "../marks";

/** GET /render pads every clip by this much (addendum 6); the image is that much bigger than the region. */
export const CLIP_PAD_PT = 4;
export const clipPx = (pt: number) => Math.round(((pt + 2 * CLIP_PAD_PT) * CLIP_DPI) / 72);

/** A chunk as the page has it (D2): text as text with the marks painted, formulas, figures and tables as images of the
 *  paper as printed. Width and height are given so a loading image reserves its space and the card does not jump. */
export function ChunkBody({ painted, dimmed }: { painted: PaintedBlock[]; dimmed: (highlightId: string) => boolean }) {
  const { paperId } = useBoard();
  return (
    <>
      {painted.map(({ block, runs }, i) => (block.kind === "clip"
        ? <img key={i} className="block-clip" src={api.renderUrl(paperId, { page: block.page, rect: block.rect })}
               width={clipPx(block.rect[2] - block.rect[0])} height={clipPx(block.rect[3] - block.rect[1])}
               alt={block.label ?? "part of the paper"} loading="lazy" draggable={false} />
        : <p key={i} className="block-text">
            {runs.map((run, j) => (run.highlightId
              ? <mark key={j} data-highlight-id={run.highlightId} className={dimmed(run.highlightId) ? "dim" : undefined}>{run.text}</mark>
              : <span key={j}>{run.text}</span>))}
          </p>))}
    </>
  );
}
```

`web/src/board/nodes/Counts.tsx`:

```tsx
/** A collapsed piece shows how many marks and notes it holds (SPEC 5.1). */
export function Counts({ marks, unplaced = 0, notes }: { marks: number; unplaced?: number; notes: number }) {
  return (
    <>
      {marks > 0 && <span className="count" title={`${marks} highlight${marks === 1 ? "" : "s"} inside${unplaced ? `; ${unplaced} more not found in this text` : ""}`}>{marks}</span>}
      {notes > 0 && <span className="note-count" title={`${notes} note${notes === 1 ? "" : "s"}`}>✎ {notes}</span>}
    </>
  );
}
```

`web/src/board/nodes/ChunkNode.tsx`, whole file:

```tsx
import { useMemo } from "react";
import { Handle, NodeResizer, Position, type NodeProps } from "@xyflow/react";
import { markDimmed } from "../../model/filter";
import { highlightsIn } from "../../model/geometry";
import { notesConnectedTo } from "../../model/links";
import type { ChunkNode as ChunkNodeType } from "../../model/types";
import { useBoard } from "../../state/BoardProvider";
import { inHandle, outHandle } from "../handles";
import { HEAD_MIDDLE_PX, useMarkOffsets } from "../markOffsets";
import { paintBlocks, paintedIds, reflow } from "../marks";
import { useOverflow } from "../overflow";
import { ChunkBody } from "./ChunkBody";
import { CollapseToggle } from "./CollapseToggle";
import { Counts } from "./Counts";

export function ChunkNode({ id, data, selected }: NodeProps<ChunkNodeType>) {
  const { state, words } = useBoard();
  const { highlights, active_tags: active } = state.board;
  // NodeProps.height also includes automatic measurements; only a stored height fixes the box size.
  const height = state.board.nodes.find((node) => node.id === id)?.height;
  const marks = useMemo(() => highlightsIn(highlights, data.region), [highlights, data.region]);
  const painted = useMemo(() => paintBlocks(data.blocks, marks, words), [data.blocks, marks, words]);
  const shown = paintedIds(painted).size;
  const notes = notesConnectedTo(state.board, [id, ...marks.map((m) => m.id)]).length;
  const [bodyRef, overflowing] = useOverflow<HTMLDivElement>();
  const offsets = useMarkOffsets(bodyRef, id, data.collapsed, painted);
  const dimmed = (highlightId: string) => { const h = marks.find((m) => m.id === highlightId); return h ? markDimmed(active, h) : false; };
  const title = reflow(data.region.start.exact, words).slice(0, 80);
  const page = data.region.rects[0].page + 1;
  const classes = ["node", "chunk", data.region.state, height !== undefined && !data.collapsed ? "sized" : "", overflowing ? "overflowing" : ""].filter(Boolean).join(" ");
  return (
    <div className={classes}>
      <NodeResizer isVisible={selected && !data.collapsed} minWidth={200} minHeight={60} />
      <div className="node-head">
        <CollapseToggle id={id} collapsed={data.collapsed} />
        <span className="badge" title={`Page ${page}`}>p{page}</span>
        <span className="title">{title}</span>
        <Counts marks={shown} unplaced={marks.length - shown} notes={notes} />
        <button className="quiet open-source" data-testid="open-source" title="Open in paper" aria-label="Open in paper">↗</button>
      </div>
      {!data.collapsed && <div className="node-body" ref={bodyRef}><ChunkBody painted={painted} dimmed={dimmed} /></div>}
      {/* Every mark inside keeps a handle, painted or not, since an edge may end on it. */}
      {marks.map((h) => (data.collapsed
        ? <Handle key={h.id} id={h.id} type="source" position={Position.Top} title={h.anchor.quote.exact.slice(0, 60)} />
        : <Handle key={h.id} id={h.id} type="source" position={Position.Right} style={{ top: offsets.get(h.id) ?? HEAD_MIDDLE_PX }} title={h.anchor.quote.exact.slice(0, 60)} />))}
      <Handle id={inHandle(id)} type="target" position={Position.Left} />
      <Handle id={outHandle(id)} type="source" position={Position.Right} />
    </div>
  );
}
```

In `FigureNode.tsx`, count what it holds the same way and use the shared handle ids: compute `const marks = highlightsIn(state.board.highlights, data.region)` and `const notes = notesConnectedTo(state.board, [id, ...marks.map((m) => m.id)]).length`, render `<Counts marks={marks.length} notes={notes} />` after the title, and replace the handle ids with `inHandle(id)` and `outHandle(id)`. Drop the "Until the next plan writes clips" comment: a figure with no clip yet is one whose clip is still being stored on first open.

Add to `web/src/styles/board.css`:

```css
/* a chunk's blocks: text as text, formulas, figures and tables as images of the page (D2) */
.node-body .block-text { margin: 0 0 8px; }
.node-body .block-text:last-child { margin-bottom: 0; }
.node-body .block-clip { display: block; max-width: 100%; height: auto; margin: 6px auto 10px; }
.node-body mark.dim { background: var(--hl); opacity: var(--dim); }
.node-head .note-count { flex: none; padding: 1px 6px; border-radius: var(--radius-pill); background: var(--surface-muted); color: var(--ink-muted); font-size: 10.5px; font-weight: 600; }
.node .react-flow__handle-top { top: -5px; }
```

- [ ] **Step 5: Update the handle count in `board.spec.ts`**

The chunk now has its own out-handle as well as one per mark. In "a chunk counts only the marks it paints, and keeps a handle for every mark inside it", count the marks' handles only:

```ts
  await expect(card.locator('.react-flow__handle[data-handleid^="h-"]')).toHaveCount(2);
```

If that spec seeds its chunk with a text block whose `rect` does not hold the marks' lines, give the block the region's rect (`[50, 130, 280, 300]`): a mark paints only in a block that holds one of its lines.

- [ ] **Step 6: Run everything, then check by hand**

Run: `cd web && npm test && npm run build && npm run e2e`
Expected: all pass; Playwright 12 passed.

By hand on Attention after first open: expand the tray's "3.2.1 Scaled Dot-Product Attention": equation (1) is an image between two paragraphs, sharp at 200% zoom. Highlight on the paper a span that runs from the end of 3.2.1's text into 3.2.2, cut both sections: each card paints its own part, and each card's handle for that mark sits at its line.

- [ ] **Step 7: Commit**

```bash
git add web/src/board web/src/styles/board.css web/e2e/board.spec.ts
git commit -m "feat(web): chunks show text and images in reading order, and paint each mark only on its own lines"
```

---

### Task 3B.2: Connections between the things themselves (D12), and delete as one step (D4)

The board draws `resolveEdges`: a line to a mark ends at the mark's handle in the first chunk that holds it; a card end uses the card's own handle; a line with an unresolved end is not drawn. Dragging from any handle to any other adds an edge between the things those handles stand for. A click on a line opens a popover with its tags and Remove connection; a tag colours the line. Delete removes the selected pieces and lines as one undo step, dissolving groups in place. A drop that re-parents joins the drag's undo step. The filter hides nodes and lines.

**Files:**
- Create: `web/src/board/EdgePopover.tsx`
- Modify: `web/src/board/handles.ts`, `web/src/board/BoardView.tsx`, `web/src/styles/board.css`
- Test: `web/src/board/handles.test.ts`

**Interfaces:**
- Produces: `endOf(nodeId: string, handleId: string | null | undefined): string`; `FlowEdge`; `flowEdges(board, hidden, selected, colourOf): FlowEdge[]`; `applySelection(current, changes): ReadonlySet<string>`; `<EdgePopover edgeId at onClose />`.

- [ ] **Step 1: Write the failing test**

`web/src/board/handles.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { emptyBoard, type BoardNode, type Rect } from "../model/types";
import { applySelection, endOf, flowEdges, inHandle, outHandle } from "./handles";

const q = { exact: "x", prefix: "", suffix: "" };
const chunk: BoardNode = { id: "n-c", type: "chunk", position: { x: 0, y: 0 }, data: { tags: [], collapsed: false, region: { rects: [{ page: 0, rect: [0, 0, 100, 100] as Rect }], start: q, end: q, position: 0, state: "anchored" }, blocks: [], user_sized: false } };
const note: BoardNode = { id: "n-n", type: "note", position: { x: 400, y: 0 }, data: { tags: [], collapsed: false, note: "notes/n-n.md", origin: "reader" } };
const board = {
  ...emptyBoard("p"), nodes: [chunk, note],
  highlights: [{ id: "h-1", tags: [], anchor: { rects: [{ page: 0, rect: [10, 10, 50, 20] as Rect }], quote: q, position: 0, state: "anchored" as const } }],
  edges: [
    { id: "e-1", from: "h-1", to: "n-n", data: { tags: ["t-gone", "t-sup"] } },
    { id: "e-2", from: "n-n", to: "n-c", data: { tags: [] } },
  ],
};
const colours = (id: string) => (id === "t-sup" ? "#15803D" : undefined);

describe("handles and edges (D12)", () => {
  it("a highlight's handle stands for the highlight; a card's own handles stand for the card", () => {
    expect(endOf("n-c", "h-1")).toBe("h-1");
    expect(endOf("n-c", outHandle("n-c"))).toBe("n-c");
    expect(endOf("n-c", null)).toBe("n-c");
  });
  it("gives every end a handle and colours a line by its first tag that still exists", () => {
    const [e1, e2] = flowEdges(board, new Set(), new Set(["e-2"]), colours);
    expect(e1).toMatchObject({ id: "e-1", source: "n-c", sourceHandle: "h-1", target: "n-n", targetHandle: inHandle("n-n"), hidden: false, selected: false, style: { stroke: "#15803D" } });
    expect(e2).toMatchObject({ source: "n-n", sourceHandle: outHandle("n-n"), target: "n-c", targetHandle: inHandle("n-c"), selected: true });
    expect(e2.style).toBeUndefined();
  });
  it("hides a line while either end is hidden", () => {
    expect(flowEdges(board, new Set(["n-n"]), new Set(), colours).map((e) => e.hidden)).toEqual([true, true]);
  });
  it("tracks which lines are selected from React Flow's select changes", () => {
    const next = applySelection(new Set(["e-1"]), [{ type: "select", id: "e-1", selected: false }, { type: "select", id: "e-2", selected: true }]);
    expect([...next]).toEqual(["e-2"]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd web && npm test -- handles`
Expected: FAIL, `endOf`, `flowEdges`, `applySelection` are not exported.

- [ ] **Step 3: Add to `handles.ts`**

```ts
import type { Edge, EdgeChange } from "@xyflow/react";
import { resolveEdges } from "../model/edges";
import type { Board } from "../model/types";

export type FlowEdge = Edge<{ tags: string[] }>;

/** What a handle stands for when a line is drawn from it: a mark's handle is the highlight, a card's own is the card. */
export function endOf(nodeId: string, handleId: string | null | undefined): string {
  return handleId && handleId.startsWith("h-") ? handleId : nodeId;
}

/** The board's edges as React Flow draws them (addendum 4.0): resolved to cards, a handle on every end, hidden while
 *  either end is hidden (D8), coloured by the first of their tags that still exists (SPEC 5.2). */
export function flowEdges(board: Board, hidden: ReadonlySet<string>, selected: ReadonlySet<string>, colourOf: (tagId: string) => string | undefined): FlowEdge[] {
  return resolveEdges(board).map((e) => {
    const colour = e.data.tags.map(colourOf).find(Boolean);
    return {
      id: e.id, source: e.source, target: e.target,
      sourceHandle: e.sourceHandle ?? outHandle(e.source), targetHandle: e.targetHandle ?? inHandle(e.target),
      data: e.data, selected: selected.has(e.id), hidden: hidden.has(e.source) || hidden.has(e.target),
      ...(colour ? { style: { stroke: colour } } : {}),
    };
  });
}

/** Edge selection is the board's own state: schema 2 edges are not React Flow's, so it is not in the file. */
export function applySelection(current: ReadonlySet<string>, changes: EdgeChange<FlowEdge>[]): ReadonlySet<string> {
  const next = new Set(current);
  for (const c of changes) if (c.type === "select") { if (c.selected) next.add(c.id); else next.delete(c.id); }
  return next;
}
```

- [ ] **Step 4: The edge popover**

`web/src/board/EdgePopover.tsx`:

```tsx
import { useEffect } from "react";
import { useBoard } from "../state/BoardProvider";
import { TagPicker } from "../tags/TagPicker";

export const EDGE_POPOVER_WIDTH = 300;
export const EDGE_POPOVER_HEIGHT = 320;
const MARGIN = 8;

/** Tags on a connection, and removing it (SPEC 5.3). A sentence about a connection is a note, not a label. */
export function EdgePopover({ edgeId, at, onClose }: { edgeId: string; at: DOMRect; onClose: () => void }) {
  const { state, dispatch } = useBoard();
  const edge = state.board.edges.find((e) => e.id === edgeId);
  useEffect(() => { if (!edge) onClose(); }, [edge, onClose]);   // undone or deleted meanwhile
  if (!edge) return null;
  const left = Math.max(MARGIN, Math.min(at.left + MARGIN, window.innerWidth - EDGE_POPOVER_WIDTH - MARGIN));
  const top = Math.max(MARGIN, Math.min(at.top + MARGIN, window.innerHeight - EDGE_POPOVER_HEIGHT - MARGIN));
  return (
    <div className="popover edge-popover" role="dialog" aria-label="Connection" style={{ left, top }}>
      <TagPicker value={edge.data.tags} onChange={(tags) => dispatch({ type: "setTags", target: "edge", id: edge.id, tags })} />
      <div className="popover-actions">
        <button className="action" onClick={() => { dispatch({ type: "remove", edgeIds: [edge.id] }); onClose(); }}>Remove connection</button>
        <button className="quiet close" aria-label="Dismiss" onClick={onClose}>×</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Wire BoardView**

In `web/src/board/BoardView.tsx` (imports: `ConnectionMode`, `type EdgeChange`, `type OnBeforeDelete`, `type OnConnect` from `@xyflow/react`; `useState`; `hiddenNodeIds`; `newEdge`; `useTags`; `applySelection`, `endOf`, `flowEdges`, `type FlowEdge`; `EdgePopover`; drop `planDelete`):

```tsx
  const { byId } = useTags();
  const [selectedEdges, setSelectedEdges] = useState<ReadonlySet<string>>(() => new Set());
  const [edgeMenu, setEdgeMenu] = useState<{ id: string; at: DOMRect } | null>(null);
  const hidden = useMemo(() => hiddenNodeIds(state.board), [state.board]);

  // Every path into <ReactFlow> goes through parentsFirst (findings, section 3). Collapse only the rendered height;
  // `hidden` is set on this copy only, never on the stored nodes (addendum 4.2).
  const nodes = useMemo(() => parentsFirst(state.board.nodes).map((node) => {
    const drawn = node.type !== "group" && node.data.collapsed ? { ...node, height: undefined, initialHeight: undefined } : node;
    return hidden.has(node.id) ? { ...drawn, hidden: true } : drawn;
  }), [state.board.nodes, hidden]);
  const edges = useMemo(() => flowEdges(state.board, hidden, selectedEdges, (tagId) => byId.get(tagId)?.colour), [state.board, hidden, selectedEdges, byId]);

  const onConnect: OnConnect = useCallback(({ source, sourceHandle, target, targetHandle }) => {
    dispatch({ type: "add", edges: [newEdge(endOf(source, sourceHandle), endOf(target, targetHandle))] });
  }, [dispatch]);
  const onEdgesChange = useCallback((changes: EdgeChange<FlowEdge>[]) => setSelectedEdges((current) => applySelection(current, changes)), []);

  // React Flow offers the selection plus every descendant and every touching edge. The reader chose only the selected
  // ones: the reducer removes those as one undo step and dissolves groups in place (addendum 4.2, 4.7).
  const onBeforeDelete: OnBeforeDelete<BoardNode, FlowEdge> = useCallback(async ({ nodes: offered, edges: offeredEdges }) => {
    const nodeIds = offered.filter((n) => n.selected).map((n) => n.id);
    const edgeIds = offeredEdges.filter((e) => e.selected).map((e) => e.id);
    if (nodeIds.length || edgeIds.length) dispatch({ type: "remove", nodeIds, edgeIds });
    setSelectedEdges(new Set());
    return false;
  }, [dispatch]);
```

In `onNodeDragStop`, collect the re-parented nodes and dispatch them once, joined to the drag's undo step:

```tsx
    const moved: BoardNode[] = [];
    for (const dragged of draggedNodes) {
      ...as before, but instead of dispatching:
      moved.push(reparent(stored, target?.id ?? null, { x: me.x, y: me.y }, target ? { x: target.box.x, y: target.box.y } : null));
    }
    if (moved.length) dispatch({ type: "upsertNodes", nodes: moved, merge: true });
```

The `<ReactFlow>` element:

```tsx
      <ReactFlow<BoardNode, FlowEdge>
        nodes={nodes} edges={edges} nodeTypes={nodeTypes} connectionMode={ConnectionMode.Loose}
        onNodesChange={(changes) => dispatch({ type: "nodes", changes })}
        onEdgesChange={onEdgesChange} onConnect={onConnect}
        onEdgeClick={(event, edge) => setEdgeMenu({ id: edge.id, at: new DOMRect(event.clientX, event.clientY, 0, 0) })}
        onPaneClick={() => setEdgeMenu(null)}
        onNodeDragStop={onNodeDragStop} onNodeClick={onNodeClick} onBeforeDelete={onBeforeDelete}
        defaultViewport={state.board.viewport}
        onMoveEnd={(_, viewport) => dispatch({ type: "viewport", viewport })}
        minZoom={0.2} fitView={false} deleteKeyCode={active ? DELETE_KEYS : null}
      >
        <Background />
        <Controls />
      </ReactFlow>
      {edgeMenu && <EdgePopover edgeId={edgeMenu.id} at={edgeMenu.at} onClose={() => setEdgeMenu(null)} />}
```

Add to `board.css`:

```css
/* connections */
.board .react-flow__edge-path { stroke: var(--border-strong); stroke-width: 1.5; }
.board .react-flow__edge.selected .react-flow__edge-path { stroke-width: 2.5; }
.edge-popover { width: 300px; display: flex; flex-direction: column; gap: 6px; }
```

A line's colour comes from the `style` `flowEdges` sets, which wins over this rule.

- [ ] **Step 6: Run the tests, then check by hand**

Run: `cd web && npm test && npm run build`
Expected: all pass.

By hand: drag from a chunk's right handle to a note's left handle: a line. Click it, tick `supports`: the line turns green. Mark a phrase inside a chunk, drag from its handle (at its line) to another chunk: the line leaves from the words. Cut the chunk again elsewhere and delete the first: the line now leaves from the new chunk. Select a group and press Delete: its pieces stay where they were; after 3C, Cmd-Z brings the group back with them inside.

- [ ] **Step 7: Commit**

```bash
git add web/src/board web/src/styles/board.css
git commit -m "feat(web): connections between the things themselves, tagged lines, delete as one undo step"
```

---

### Task 3B.3: Notes, groups, slots and tags on every card (D14, D17)

Every card gets its tag chips and a Tags button that opens the picker. A note is edited in place (double-click, or straight away when just made) and saved on blur; an AI note is marked AI. A group's name is edited by double-click. A slot shows its question faintly until it holds a note; clicking the question makes an empty reader note inside it, open for typing, with the question as the placeholder (never written into the note). New note makes a reader note in the middle of the view. The empty-board hint goes: a new board is never empty (D15).

**Files:**
- Create: `web/src/board/BoardActions.tsx`, `web/src/board/nodes/NodeTags.tsx`, `web/src/board/slots.ts`
- Modify: `web/src/board/nodes/NoteNode.tsx`, `web/src/board/nodes/GroupNode.tsx`, `web/src/board/nodes/ChunkNode.tsx`, `web/src/board/nodes/FigureNode.tsx`, `web/src/board/BoardView.tsx`, `web/src/styles/board.css`, `web/e2e/restyle.spec.ts`
- Test: `web/src/board/slots.test.ts`

**Interfaces:**
- Produces: `BoardActions = { focusNode(id): void; openInPaper(rect): void; editing: string | null; setEditing(id | null): void }`, `BoardActionsProvider`, `useBoardActions()`; `slotPrompt(nodes, parentId): string | null`; `SLOT_NOTE_AT = { x: 16, y: 48 }`; `<NodeTags id tags />`; `NOTE_PLACEHOLDER`.

- [ ] **Step 1: Write the failing test**

`web/src/board/slots.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { BoardNode } from "../model/types";
import { hasNote, slotPrompt } from "./slots";

const slot: BoardNode = { id: "n-s", type: "group", position: { x: 0, y: 0 }, data: { tags: [], name: "Main point", prompt: "What is the one thing?" } };
const pile: BoardNode = { id: "n-p", type: "group", position: { x: 0, y: 0 }, data: { tags: [] } };
const note = (parentId: string): BoardNode => ({ id: "n-1", type: "note", position: { x: 0, y: 0 }, parentId, data: { tags: [], collapsed: false, note: "notes/n-1.md", origin: "reader" } });

describe("slots (D17)", () => {
  it("a note's placeholder is its slot's question, and nothing elsewhere", () => {
    expect(slotPrompt([slot, pile], "n-s")).toBe("What is the one thing?");
    expect(slotPrompt([slot, pile], "n-p")).toBeNull();
    expect(slotPrompt([slot, pile], undefined)).toBeNull();
  });
  it("a slot shows its question until it holds a note", () => {
    expect(hasNote([slot], "n-s")).toBe(false);
    expect(hasNote([slot, note("n-s")], "n-s")).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd web && npm test -- slots`
Expected: FAIL, `./slots` does not resolve.

- [ ] **Step 3: Write `slots.ts`, `BoardActions.tsx`, `NodeTags.tsx`**

`web/src/board/slots.ts`:

```ts
import type { BoardNode } from "../model/types";

/** Where a note made by clicking a slot's question lands, inside the slot, below its name. */
export const SLOT_NOTE_AT = { x: 16, y: 48 };

/** The question of the slot a node sits in: a note's placeholder there, never its text (addendum 4.9). */
export function slotPrompt(nodes: BoardNode[], parentId: string | undefined): string | null {
  const parent = parentId ? nodes.find((n) => n.id === parentId) : undefined;
  return parent?.type === "group" && parent.data.prompt ? parent.data.prompt : null;
}

export function hasNote(nodes: BoardNode[], groupId: string): boolean {
  return nodes.some((n) => n.parentId === groupId && n.type === "note");
}
```

`web/src/board/BoardActions.tsx`:

```tsx
import { createContext, useContext } from "react";
import type { PageRect } from "../model/types";

/** What a card needs from the board around it: nodes are rendered by React Flow, out of reach of BoardView's props. */
export type BoardActions = {
  focusNode: (id: string) => void;
  openInPaper: (rect: PageRect) => void;
  editing: string | null;
  setEditing: (id: string | null) => void;
};

const BoardActionsContext = createContext<BoardActions | null>(null);
export const BoardActionsProvider = BoardActionsContext.Provider;

export function useBoardActions(): BoardActions {
  const ctx = useContext(BoardActionsContext);
  if (!ctx) throw new Error("useBoardActions outside BoardView");
  return ctx;
}
```

`web/src/board/nodes/NodeTags.tsx`:

```tsx
import { useState } from "react";
import { useBoard } from "../../state/BoardProvider";
import { TagChips } from "../../tags/TagChips";
import { TagPicker } from "../../tags/TagPicker";

/** Tag, the same on every piece and group (SPEC 5.1): chips, and a button that opens the global picker. */
export function NodeTags({ id, tags }: { id: string; tags: string[] }) {
  const { dispatch } = useBoard();
  const [open, setOpen] = useState(false);
  return (
    <>
      <TagChips ids={tags} />
      <button className="quiet tags-toggle nodrag" title="Tags" aria-label="Tags" aria-expanded={open} onClick={() => setOpen((o) => !o)}>⋯</button>
      {open && (
        <div className="node-tags-picker nodrag nowheel">
          <TagPicker value={tags} onChange={(next) => dispatch({ type: "setTags", target: "node", id, tags: next })} />
        </div>
      )}
    </>
  );
}
```

Put `<NodeTags id={id} tags={data.tags} />` in the head of `ChunkNode` and `FigureNode`, before the open-source button.

- [ ] **Step 4: Notes and groups**

`web/src/board/nodes/NoteNode.tsx`, whole file:

```tsx
import { useState } from "react";
import { Handle, NodeResizer, Position, type NodeProps } from "@xyflow/react";
import { firstLine } from "../../model/notes";
import type { NoteNode as NoteNodeType } from "../../model/types";
import { useBoard, useNote } from "../../state/BoardProvider";
import { useBoardActions } from "../BoardActions";
import { inHandle, outHandle } from "../handles";
import { slotPrompt } from "../slots";
import { CollapseToggle } from "./CollapseToggle";
import { NodeTags } from "./NodeTags";

export const NOTE_PLACEHOLDER = "Write in your own words";

/** A note in the reader's own words, or an AI's answer marked as such (D14). The text lives in notes/<id>.md;
 *  the text area keeps its own undo (addendum 4.7). */
export function NoteNode({ id, data, selected }: NodeProps<NoteNodeType>) {
  const { state } = useBoard();
  const { editing, setEditing } = useBoardActions();
  const { text, error, save } = useNote(id);
  const [draft, setDraft] = useState<string | null>(null);
  const prompt = slotPrompt(state.board.nodes, state.board.nodes.find((n) => n.id === id)?.parentId);
  const finish = () => {
    if (draft !== null && draft !== text) void save(draft);
    setDraft(null);
    setEditing(null);
  };
  const ai = data.origin === "ai";
  return (
    <div className={`node note ${data.origin}`}>
      <NodeResizer isVisible={selected && !data.collapsed} minWidth={160} minHeight={60} />
      <div className="node-head">
        <CollapseToggle id={id} collapsed={data.collapsed} />
        <span className={`badge note-badge ${data.origin}`}>{ai ? "AI" : "note"}</span>
        <span className="title">{firstLine(text ?? "") || (ai ? "AI answer" : "Note")}</span>
        <NodeTags id={id} tags={data.tags} />
      </div>
      {!data.collapsed && (editing === id
        ? <textarea className="note-text nodrag nowheel" autoFocus value={draft ?? text ?? ""} aria-label="Note"
                    placeholder={prompt ?? NOTE_PLACEHOLDER} onChange={(e) => setDraft(e.target.value)} onBlur={finish} />
        : <div className="node-body note-body" onDoubleClick={() => setEditing(id)} title="Double-click to write">
            {text || <span className="hint">{prompt ?? NOTE_PLACEHOLDER}</span>}
          </div>)}
      {error && <p className="note-error" role="alert">{error}</p>}
      <Handle id={inHandle(id)} type="target" position={Position.Left} />
      <Handle id={outHandle(id)} type="source" position={Position.Right} />
    </div>
  );
}
```

`web/src/board/nodes/GroupNode.tsx`, whole file (3B.4 adds the tray rows):

```tsx
import { useState } from "react";
import { Handle, NodeResizer, Position, type NodeProps } from "@xyflow/react";
import { newNote } from "../../model/notes";
import type { GroupNode as GroupNodeType } from "../../model/types";
import { useBoard } from "../../state/BoardProvider";
import { useBoardActions } from "../BoardActions";
import { inHandle, outHandle } from "../handles";
import { hasNote, SLOT_NOTE_AT } from "../slots";
import { NodeTags } from "./NodeTags";

function GroupName({ id, name }: { id: string; name: string | null | undefined }) {
  const { state, dispatch } = useBoard();
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    const node = state.board.nodes.find((n) => n.id === id);
    const next = draft?.trim() || null;
    if (draft !== null && node?.type === "group" && next !== (node.data.name ?? null)) {
      dispatch({ type: "replaceNode", node: { ...node, data: { ...node.data, name: next } } });
    }
    setDraft(null);
  };
  if (draft !== null) {
    return <input className="group-name nodrag" autoFocus value={draft} aria-label="Group name" onChange={(e) => setDraft(e.target.value)}
                  onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setDraft(null); }} />;
  }
  return <div className={`group-name ${name ? "" : "unnamed"}`} onDoubleClick={() => setDraft(name ?? "")} title="Double-click to name">{name ?? "Group"}</div>;
}

/** A group, a slot when it carries a question (D17), the tray when it is the Paper group (D15). */
export function GroupNode({ id, data, selected }: NodeProps<GroupNodeType>) {
  const { state, dispatch } = useBoard();
  const { setEditing } = useBoardActions();
  const answer = () => {
    const note = newNote({ position: SLOT_NOTE_AT, parentId: id, origin: "reader" });
    dispatch({ type: "add", nodes: [note] });
    setEditing(note.id);
  };
  const classes = ["node", "group", data.tray ? "tray" : "", data.prompt ? "slot" : "", selected ? "selected" : ""].filter(Boolean).join(" ");
  return (
    <div className={classes}>
      <NodeResizer isVisible={selected} minWidth={160} minHeight={120} />
      <div className="group-head"><GroupName id={id} name={data.name} /><NodeTags id={id} tags={data.tags} /></div>
      {data.prompt && !hasNote(state.board.nodes, id) && (
        <button type="button" className="slot-prompt nodrag" onClick={answer} title="Answer it in a note of your own">{data.prompt}</button>
      )}
      <Handle id={inHandle(id)} type="target" position={Position.Left} />
      <Handle id={outHandle(id)} type="source" position={Position.Right} />
    </div>
  );
}
```

- [ ] **Step 5: BoardView provides the actions, adds New note, drops the hint**

In `BoardView.tsx`'s `Inner`:

```tsx
  const { getInternalNode, fitView, getZoom, screenToFlowPosition } = useReactFlow<BoardNode>();
  const boardRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const focusOn = useCallback((id: string) => {
    void fitView({ nodes: [{ id }], minZoom: 0.2, maxZoom: getZoom(), duration: 300 });
    dispatch({ type: "nodes", changes: [{ type: "select", id, selected: true }] });
  }, [fitView, getZoom, dispatch]);
  const actions = useMemo(() => ({ focusNode: focusOn, openInPaper: onOpenInPaper, editing, setEditing }), [focusOn, onOpenInPaper, editing]);

  const addNote = () => {
    const box = boardRef.current!.getBoundingClientRect();
    const note = newNote({ position: screenToFlowPosition({ x: box.left + box.width / 2, y: box.top + box.height / 2 }), origin: "reader" });
    dispatch({ type: "add", nodes: [note] });
    setEditing(note.id);
  };
```

Wrap the returned tree in `<BoardActionsProvider value={actions}>`, put `ref={boardRef}` on `.board`, add `<button onClick={addNote} title="A note in your own words"><span aria-hidden="true">✎</span> New note</button>` after New group in `.board-tools`, and delete the `.empty-hint` block (and its two rules in `board.css`).

In `web/e2e/restyle.spec.ts`, the test "an empty board shows one hint, and a long chunk fades" loses its hint assertions (both `.empty-hint` lines); rename it "a long chunk fades".

Add to `board.css`:

```css
/* tags on a card */
.node-head { position: relative; }
.node-head .tags-toggle { color: var(--ink-faint); }
.node-tags-picker { position: absolute; top: 100%; right: 0; z-index: 5; width: 220px; border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow-raised); background: var(--surface); }

/* notes: the reader's, and an AI's answer, marked (D14) */
.node.note.ai { border-left-color: var(--ai); background: var(--ai-tint); }
.node-head .note-badge.ai { background: var(--ai); color: var(--surface); }
.node.note .note-text { display: block; width: 100%; min-height: 110px; padding: 8px 10px; border: 0; resize: vertical; background: transparent; font-family: var(--font-read); font-size: var(--text-read); line-height: var(--leading-read); }
.node.note .note-body { user-select: text; cursor: text; }
.node .hint { color: var(--ink-faint); font-style: italic; }
.node .note-error { margin: 0; padding: 4px 10px; color: var(--lost); font-size: var(--text-ui-small); }

/* groups, slots */
.group-head { display: flex; align-items: center; gap: 6px; padding-right: 8px; }
input.group-name { font: inherit; font-weight: 600; font-size: 12px; outline: none; }
.slot-prompt { position: absolute; top: 48px; left: 16px; right: 16px; padding: 0; border: 0; background: none; text-align: left; font-family: var(--font-read); font-size: 14px; line-height: 1.4; color: var(--ink-faint); font-style: italic; cursor: text; }
.slot-prompt:hover { color: var(--ink-muted); }
```

- [ ] **Step 6: Run everything, then check by hand**

Run: `cd web && npm test && npm run build && npm run e2e`
Expected: all pass; Playwright 12 passed.

By hand on a board from first open: click "In your own words: what is the one thing this paper shows?" in Main point: an empty note inside the slot, open for typing, the question as its placeholder; type, click away: the question is gone from the slot and the note keeps its text after a reload, with no question in `notes/<id>.md`. Double-click the slot's name, rename it: saved. Tag a chunk `claim` from its ⋯ button: the chip shows. New note in the tool bar: a note in the middle of the view, open for typing.

- [ ] **Step 7: Commit**

```bash
git add web/src/board web/src/styles/board.css web/e2e/restyle.spec.ts
git commit -m "feat(web): notes edited in place, AI notes marked, slots that start a note, tags and names on every card"
```

---

### Task 3B.4: The tray's ghost rows (D18) and the Split button (D16)

For each section whose chunk is not among the tray's children, the tray draws a faint row in that section's place: "§3 Model Architecture → in Method · 4 marks · 2 notes", "→ on the board" when the chunk is at the top level, "not on the board" when no chunk has that section. Clicking it centres the chunk, or scrolls the paper to the section when there is none. Split adds what the board is missing to the tray, as one undo step, and says what it did.

**Files:**
- Create: `web/src/board/ghostRows.ts`, `web/src/board/nodes/TrayRows.tsx`, `web/src/board/BoardTools.tsx`
- Modify: `web/src/board/nodes/GroupNode.tsx`, `web/src/board/BoardView.tsx`, `web/src/styles/board.css`
- Test: `web/src/board/ghostRows.test.ts`

**Interfaces:**
- Produces: `GhostRow = { sectionId; y; text; nodeId: string | null; headingRect: PageRect }`, `ghostRows(board, source, trayId): GhostRow[]`; `<TrayRows trayId />`; `<BoardTools onAddGroup onAddNote onTidy? />` with Split inside; `SPLIT_FAILED_MESSAGE`.

- [ ] **Step 1: Write the failing test**

`web/src/board/ghostRows.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { trayRow } from "../model/tray";
import { emptyBoard, type BoardNode, type Highlight, type Rect, type Source } from "../model/types";
import { ghostRows } from "./ghostRows";

const q = { exact: "x", prefix: "", suffix: "" };
const pr = (page: number, rect: Rect) => ({ page, rect });
const section = (n: string, y: number) => ({ id: `sec-${n}`, number: n, depth: 1, title: `Title ${n}`, heading_rect: pr(0, [60, y, 200, y + 10]), extent: [pr(0, [50, y, 300, y + 90])], text: "" });
const source = { regions: [{ page: 0, rect: [40, 40, 320, 700], label: "text" }], sections: [section("1", 50), section("2", 150), section("3", 250)], figures: [] } as unknown as Source;
const chunk = (id: string, sourceId: string, parentId?: string): BoardNode => ({ id, type: "chunk", position: { x: 0, y: 0 }, ...(parentId ? { parentId } : {}),
  data: { tags: [], collapsed: true, region: { rects: [pr(0, [50, 0, 300, 10])], start: q, end: q, position: 0, state: "anchored" }, blocks: [], user_sized: false, source_id: sourceId } });
const group = (id: string, name?: string, tray?: boolean): BoardNode => ({ id, type: "group", position: { x: 0, y: 0 }, data: { tags: [], ...(name ? { name } : {}), ...(tray ? { tray } : {}) } });
const note = (id: string): BoardNode => ({ id, type: "note", position: { x: 0, y: 0 }, data: { tags: [], collapsed: false, note: `notes/${id}.md`, origin: "reader" } });
const mark = (id: string, y: number): Highlight => ({ id, tags: [], anchor: { rects: [pr(0, [60, y, 200, y + 8])], quote: q, position: 0, state: "anchored" } });
const edge = (id: string, from: string, to: string) => ({ id, from, to, data: { tags: [] } });

describe("ghost rows (D18)", () => {
  const board = {
    ...emptyBoard("p"),
    nodes: [group("n-t", "Paper", true), chunk("n-1", "sec-1", "n-t"), group("n-m", "Method"), chunk("n-2", "sec-2", "n-m"), note("n-a"), note("n-b"), note("n-c")],
    highlights: [mark("h-1", 160), mark("h-2", 200), mark("h-3", 60)],
    edges: [edge("e-1", "h-1", "n-a"), edge("e-2", "n-b", "n-2")],
  };
  it("draws a row in each missing section's place, naming where its piece went and counting its marks and notes", () => {
    expect(ghostRows(board, source, "n-t")).toEqual([
      { sectionId: "sec-2", y: trayRow(1).y, text: "§2 Title 2 → in Method · 2 marks · 2 notes", nodeId: "n-2", headingRect: source.sections[1].heading_rect },
      { sectionId: "sec-3", y: trayRow(2).y, text: "§3 Title 3 not on the board · 0 marks · 0 notes", nodeId: null, headingRect: source.sections[2].heading_rect },
    ]);
  });
  it("says a top-level piece is on the board, and names an unnamed group as a group", () => {
    const top = { ...board, nodes: board.nodes.map((n) => (n.id === "n-2" ? { ...n, parentId: undefined } : n)) as BoardNode[] };
    expect(ghostRows(top, source, "n-t")[0].text).toBe("§2 Title 2 → on the board · 2 marks · 2 notes");
    const unnamed = { ...board, nodes: board.nodes.map((n) => (n.id === "n-m" ? group("n-m") : n)) };
    expect(ghostRows(unnamed, source, "n-t")[0].text).toContain("→ in a group");
  });
  it("counts one mark and one note in the singular", () => {
    const one = { ...board, highlights: [mark("h-1", 160)], edges: [edge("e-1", "h-1", "n-a")] };
    expect(ghostRows(one, source, "n-t")[0].text).toBe("§2 Title 2 → in Method · 1 mark · 1 note");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd web && npm test -- ghostRows`
Expected: FAIL, `./ghostRows` does not resolve.

- [ ] **Step 3: Write `ghostRows.ts`, `TrayRows.tsx`, `BoardTools.tsx`**

`web/src/board/ghostRows.ts`:

```ts
import { linesInside } from "../model/geometry";
import { notesConnectedTo } from "../model/links";
import { trayOrder } from "../model/paperOrder";
import { sectionLabel } from "../model/sections";
import { trayRow } from "../model/tray";
import type { Board, BoardNode, ChunkNode, PageRect, Section, Source } from "../model/types";

export type GhostRow = { sectionId: string; y: number; text: string; nodeId: string | null; headingRect: PageRect };

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

function where(nodes: BoardNode[], chunk: ChunkNode | undefined): string {
  if (!chunk) return "not on the board";
  const parent = chunk.parentId ? nodes.find((n) => n.id === chunk.parentId) : undefined;
  if (parent?.type === "group") return `→ in ${parent.data.name || "a group"}`;
  return "→ on the board";
}

function row(board: Board, section: Section, y: number): GhostRow {
  const chunk = board.nodes.find((n): n is ChunkNode => n.type === "chunk" && n.data.source_id === section.id);
  const marks = board.highlights.filter((h) => linesInside(h, section.extent).length > 0);
  const notes = notesConnectedTo(board, [...marks.map((m) => m.id), ...(chunk ? [chunk.id] : [])]).length;
  const text = `${sectionLabel(section)} ${where(board.nodes, chunk)} · ${plural(marks.length, "mark")} · ${plural(notes, "note")}`;
  return { sectionId: section.id, y, text, nodeId: chunk?.id ?? null, headingRect: section.heading_rect };
}

/** A faint row in the tray for each section whose chunk is not among its children (addendum 4.9). Derived at render,
 *  never stored; figures have none. Marks are counted by the section's extent, as a chunk finds its marks. */
export function ghostRows(board: Board, source: Source, trayId: string): GhostRow[] {
  const order = trayOrder(source);
  const inTray = new Set(board.nodes.flatMap((n) => (n.parentId === trayId && n.type === "chunk" && n.data.source_id ? [n.data.source_id] : [])));
  return source.sections.filter((s) => !inTray.has(s.id)).map((s) => row(board, s, trayRow(order.indexOf(s.id)).y));
}
```

`web/src/board/nodes/TrayRows.tsx`:

```tsx
import { useMemo } from "react";
import { TRAY_PAD, TRAY_PIECE_WIDTH } from "../../model/tray";
import { useBoard } from "../../state/BoardProvider";
import { useBoardActions } from "../BoardActions";
import { ghostRows } from "../ghostRows";

/** Where the tray's missing sections went, each in its own place (D18). */
export function TrayRows({ trayId }: { trayId: string }) {
  const { state, source } = useBoard();
  const { focusNode, openInPaper } = useBoardActions();
  const rows = useMemo(() => ghostRows(state.board, source, trayId), [state.board, source, trayId]);
  return (
    <>
      {rows.map((row) => (
        <button key={row.sectionId} type="button" className="ghost-row nodrag" style={{ top: row.y, left: TRAY_PAD, width: TRAY_PIECE_WIDTH }}
                onClick={() => (row.nodeId ? focusNode(row.nodeId) : openInPaper(row.headingRect))}
                title={row.nodeId ? "Show this section's piece" : "Show this section in the paper"}>
          {row.text}
        </button>
      ))}
    </>
  );
}
```

`web/src/board/BoardTools.tsx`:

```tsx
import { useState } from "react";
import { useBoard } from "../state/BoardProvider";

export const SPLIT_FAILED_MESSAGE = "Could not split the paper. Nothing was added.";
const splitDone = (added: number) => (added ? `Added ${added} piece${added === 1 ? "" : "s"} to the tray` : "Every section and figure is already on the board");

type Props = { onAddGroup: () => void; onAddNote: () => void; onTidy?: () => void };

export function BoardTools({ onAddGroup, onAddNote, onTidy }: Props) {
  const { split } = useBoard();
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const runSplit = async () => {
    setBusy(true);
    try {
      setSaid(splitDone(await split()));
    } catch (failure) {
      console.error(SPLIT_FAILED_MESSAGE, failure);
      setSaid(SPLIT_FAILED_MESSAGE);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="board-tools">
      <button onClick={onAddGroup} title="A rectangle to pile pieces in. Drag pieces wholly inside it."><span aria-hidden="true">▢</span> New group</button>
      <button onClick={onAddNote} title="A note in your own words"><span aria-hidden="true">✎</span> New note</button>
      <button onClick={() => void runSplit()} disabled={busy} title="Add every section and figure the board does not have yet, into the tray">
        <span aria-hidden="true">✂</span> Split
      </button>
      {onTidy && <button onClick={onTidy} title="Lay out the connected pieces. Unconnected and grouped pieces stay put. One undo puts it back.">Tidy</button>}
      {said && <span className="tool-note" role="status">{said}</span>}
    </div>
  );
}
```

In `GroupNode.tsx`, render `{data.tray && <TrayRows trayId={id} />}` after the slot prompt. In `BoardView.tsx`, replace the `.board-tools` div with `<BoardTools onAddGroup={addGroup} onAddNote={addNote} />`.

Add to `board.css`:

```css
/* the tray: the group named Paper, and the rows of sections that moved out of it (D18) */
.node.group.tray { background: var(--bg-paper); }
.ghost-row { position: absolute; height: 32px; padding: 0 10px; border: 1px dashed var(--border-strong); border-radius: var(--radius); background: transparent; opacity: var(--ghost); text-align: left; font-size: var(--text-ui-small); color: var(--ink-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer; }
.ghost-row:hover { opacity: 1; border-color: var(--cut-edge); }
.board-tools .tool-note { align-self: center; padding: 0 8px; font-size: var(--text-ui-small); color: var(--ink-muted); }
```

- [ ] **Step 4: Run the tests, then check by hand**

Run: `cd web && npm test && npm run build`
Expected: all pass.

By hand on a board from first open: drag "§3 Model Architecture" out of the tray into the Method slot: a faint row stays in its place reading "§3 Model Architecture → in How it works · 0 marks · 0 notes"; mark a phrase in section 3 on the paper and add a note to it: the row counts them. Click the row: the board centres the piece. Delete a section's piece: the row reads "not on the board"; click it: the paper scrolls to the section. Split: "Added 1 piece to the tray", back in its own row. Split again: "Every section and figure is already on the board".

- [ ] **Step 5: Commit**

```bash
git add web/src/board web/src/styles/board.css
git commit -m "feat(web): the tray keeps a ghost row for every section that moved out, and Split refills it"
```

---

### Task 3B.5: Tidy (D11)

Tidy lays out the top-level nodes that have a connection to another top-level node (an end inside a group counts as the group's; an end on a highlight counts as the top-level ancestor of the chunk holding it). Only those move. Every other top-level node is fixed and still collides, and nothing inside a group moves. `d3-force` from the current positions, a fixed number of ticks, a seeded random source: the same board tidies the same way twice. One `upsertNodes`: one undo step.

**Files:**
- Create: `web/src/board/tidy.ts`
- Modify: `web/src/board/BoardView.tsx`
- Test: `web/src/board/tidy.test.ts`

**Interfaces:**
- Produces: `TIDY_TICKS = 300`, `TIDY_LINK_DISTANCE = 480`, `TIDY_COLLIDE_PAD = 24`, `TIDY_SEED = 1`; `topLevelOf(nodes, id): string`; `tidyLinks(board): Array<[string, string]>`; `tidyPositions(board, sizeOf: (id) => { width; height }): Map<string, XY>`.

- [ ] **Step 1: Write the failing test**

`web/src/board/tidy.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { emptyBoard, type Board, type BoardNode, type Rect } from "../model/types";
import { tidyLinks, tidyPositions } from "./tidy";

const q = { exact: "x", prefix: "", suffix: "" };
const chunk = (id: string, x: number, y: number, parentId?: string): BoardNode => ({ id, type: "chunk", position: { x, y }, ...(parentId ? { parentId } : {}),
  data: { tags: [], collapsed: false, region: { rects: [{ page: 0, rect: [0, 0, 100, 100] as Rect }], start: q, end: q, position: 0, state: "anchored" }, blocks: [], user_sized: false } });
const group = (id: string, x: number, y: number): BoardNode => ({ id, type: "group", position: { x, y }, width: 400, height: 300, data: { tags: [] } });
const edge = (id: string, from: string, to: string) => ({ id, from, to, data: { tags: [] } });
const size = (id: string) => (id.startsWith("n-g") ? { width: 400, height: 300 } : { width: 320, height: 100 });
const centre = (p: { x: number; y: number }) => ({ x: p.x + 160, y: p.y + 50 });
const apart = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(centre(a).x - centre(b).x, centre(a).y - centre(b).y);
const make = (nodes: BoardNode[], edges: ReturnType<typeof edge>[], highlights: Board["highlights"] = []): Board => ({ ...emptyBoard("p"), nodes, edges, highlights });

describe("Tidy (D11, addendum 4.7)", () => {
  const board = make([chunk("n-a", 0, 0), chunk("n-b", 2000, 1500), chunk("n-c", 0, 700), group("n-g", 900, 100), chunk("n-d", 20, 48, "n-g")], [edge("e-1", "n-a", "n-b")]);

  it("moves only the connected top-level pieces, and brings them closer", () => {
    const moved = tidyPositions(board, size);
    expect([...moved.keys()].sort()).toEqual(["n-a", "n-b"]);
    expect(apart(moved.get("n-a")!, moved.get("n-b")!)).toBeLessThan(apart({ x: 0, y: 0 }, { x: 2000, y: 1500 }));
  });
  it("an end inside a group counts as the group's, and a mark's end as its chunk's", () => {
    expect(tidyLinks(make(board.nodes, [edge("e-2", "n-d", "n-c")]))).toEqual([["n-g", "n-c"]]);
    const mark = { id: "h-1", tags: [], anchor: { rects: [{ page: 0, rect: [10, 10, 50, 20] as Rect }], quote: q, position: 0, state: "anchored" as const } };
    expect(tidyLinks(make([chunk("n-a", 0, 0), chunk("n-c", 0, 700)], [edge("e-3", "h-1", "n-c")], [mark]))).toEqual([["n-a", "n-c"]]);
  });
  it("does nothing when no two top-level things are connected", () => {
    expect(tidyPositions(make(board.nodes, [edge("e-4", "n-d", "n-g")]), size).size).toBe(0);
  });
  it("tidies the same board the same way twice", () => {
    expect(tidyPositions(board, size)).toEqual(tidyPositions(board, size));
  });
  it("keeps tidied pieces off a fixed piece between them", () => {
    const between = make([chunk("n-a", 0, 0), chunk("n-b", 1200, 0), chunk("n-c", 600, 0)], [edge("e-1", "n-a", "n-b")]);
    const moved = tidyPositions(between, size);
    const radius = Math.hypot(320, 100) / 2;
    for (const id of ["n-a", "n-b"]) expect(apart(moved.get(id)!, { x: 600, y: 0 })).toBeGreaterThan(radius);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd web && npm test -- tidy`
Expected: FAIL, `./tidy` does not resolve.

- [ ] **Step 3: Write `tidy.ts`**

```ts
import { forceCollide, forceLink, forceSimulation, type SimulationLinkDatum, type SimulationNodeDatum } from "d3-force";
import { resolveEdges } from "../model/edges";
import type { XY } from "../model/reparent";
import type { Board, BoardNode } from "../model/types";

export const TIDY_TICKS = 300;
export const TIDY_LINK_DISTANCE = 480;
export const TIDY_COLLIDE_PAD = 24;
export const TIDY_SEED = 1;

export type Size = { width: number; height: number };
type Body = SimulationNodeDatum & { id: string; w: number; h: number; r: number };

/** d3-force jiggles coincident nodes with its random source; a seeded one keeps Tidy deterministic (addendum 4.7). */
function seeded(seed: number): () => number {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
}

export function topLevelOf(nodes: BoardNode[], id: string): string {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  let node = byId.get(id);
  while (node?.parentId && byId.has(node.parentId)) node = byId.get(node.parentId);
  return node?.id ?? id;
}

/** Connections between distinct top-level nodes: an end inside a group is the group's, a mark's end its chunk's. */
export function tidyLinks(board: Board): Array<[string, string]> {
  const seen = new Set<string>();
  const links: Array<[string, string]> = [];
  for (const e of resolveEdges(board)) {
    const a = topLevelOf(board.nodes, e.source);
    const b = topLevelOf(board.nodes, e.target);
    const key = [a, b].sort().join("|");
    if (a === b || seen.has(key)) continue;
    seen.add(key);
    links.push([a, b]);
  }
  return links;
}

/** New positions for the connected top-level nodes only. Everything else is fixed (fx, fy) but still collides. */
export function tidyPositions(board: Board, sizeOf: (id: string) => Size): Map<string, XY> {
  const links = tidyLinks(board);
  const moving = new Set(links.flat());
  if (!moving.size) return new Map();
  const bodies: Body[] = board.nodes.filter((n) => !n.parentId).map((n) => {
    const { width: w, height: h } = sizeOf(n.id);
    const x = n.position.x + w / 2;
    const y = n.position.y + h / 2;
    return { id: n.id, w, h, r: Math.hypot(w, h) / 2 + TIDY_COLLIDE_PAD, x, y, ...(moving.has(n.id) ? {} : { fx: x, fy: y }) };
  });
  const simulation = forceSimulation<Body>(bodies).stop().randomSource(seeded(TIDY_SEED))
    .force("link", forceLink<Body, SimulationLinkDatum<Body>>(links.map(([source, target]) => ({ source, target }))).id((b) => b.id).distance(TIDY_LINK_DISTANCE))
    .force("collide", forceCollide<Body>((b) => b.r));
  simulation.tick(TIDY_TICKS);
  return new Map(bodies.filter((b) => moving.has(b.id)).map((b) => [b.id, { x: Math.round(b.x! - b.w / 2), y: Math.round(b.y! - b.h / 2) }]));
}
```

- [ ] **Step 4: The Tidy button**

In `BoardView.tsx`:

```tsx
  const tidy = () => {
    const sizeOf = (id: string) => {
      const measured = getInternalNode(id)?.measured;
      const stored = state.board.nodes.find((n) => n.id === id);
      return { width: measured?.width ?? stored?.width ?? 0, height: measured?.height ?? stored?.height ?? 0 };
    };
    const moved = tidyPositions(state.board, sizeOf);
    if (!moved.size) return;
    dispatch({ type: "upsertNodes", nodes: state.board.nodes.filter((n) => moved.has(n.id)).map((n) => ({ ...n, position: moved.get(n.id)! })) });
  };
```

and pass `onTidy={tidy}` to `BoardTools`.

- [ ] **Step 5: Run everything, then check by hand**

Run: `cd web && npm test && npm run build && npm run e2e`
Expected: all pass; Playwright 12 passed.

By hand: connect two chunks far apart and leave a third unconnected between them; put a piece in a slot. Tidy: the two connected chunks move near each other, the third and the slot's piece do not move. Tidy again: nothing moves further than a few pixels. After 3C, one Cmd-Z puts both back.

- [ ] **Step 6: Commit**

```bash
git add web/src/board
git commit -m "feat(web): Tidy lays out connected pieces on request, as one undo step"
```

---

## Task 3C: The shell and its panels (parallel)

**Owns:** `web/src/App.tsx`, `web/src/tags/**` except `TagPicker.tsx` and `TagChips.tsx`, `web/src/panels/**`, `web/src/styles/shell.css`.
**Must not touch:** `web/src/model/**`, `web/src/state/**`, `web/src/api/**`, `web/src/paper/**`, `web/src/PaperScreen.tsx`, `web/src/board/**`, `web/src/tags/TagPicker.tsx`, `web/src/tags/TagChips.tsx`, `paper.css`, `board.css`, `tokens.css`, `tags.css`, every e2e spec.
**Consumes (from 3.0):** `useBoard()` with `state`, `dispatch`, `paperId`, `flush`, `notice`; `useTags()`; the actions `setView`, `setGoal`, `setActiveTags`, `undo`, `redo`; `isTextField`; `api.getQuestions`, `api.postExport`, `api.getTemplate`, `api.putTemplate`; `Question`, `ExportOrder`, `ExportResult`, `Slot`, `TemplateFile`. `PaperScreen` and `BoardView` with their frozen props.
**Produces:** the shell half of the Shared DOM contract.

Five sub-tasks, each ending with `npm test && npm run build` green and a commit; `npm run e2e` at the end of 3C.1 and 3C.5.

### Task 3C.1: The shell reads the view from the board (D5), undo keys (D4), the goal

The shell moves inside the provider so the view, the goal and the side panel come from the board. The view toggle writes `setView`, so a reload opens the view you left. Cmd-Z and Shift-Cmd-Z (Ctrl on other systems) undo and redo anywhere except in a text field. The goal is one line under the top bar.

**Files:**
- Create: `web/src/panels/undoKeys.ts`
- Modify: `web/src/App.tsx`, `web/src/styles/shell.css`
- Test: `web/src/panels/undoKeys.test.ts`

**Interfaces:**
- Produces: `undoKeyAction(event: KeyLike): "undo" | "redo" | null`, `useUndoKeys(dispatch)`; `Shell`; `Panel` type and the side panel frame; input "Reading goal".

- [ ] **Step 1: Write the failing test**

`web/src/panels/undoKeys.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { undoKeyAction, type KeyLike } from "./undoKeys";

const key = (over: Partial<KeyLike> = {}): KeyLike => ({ key: "z", metaKey: true, ctrlKey: false, shiftKey: false, altKey: false, target: document.body, ...over });

describe("undo keys (addendum 4.7)", () => {
  it("Cmd-Z undoes and Shift-Cmd-Z redoes, and Ctrl does the same", () => {
    expect(undoKeyAction(key())).toBe("undo");
    expect(undoKeyAction(key({ key: "Z", shiftKey: true }))).toBe("redo");
    expect(undoKeyAction(key({ metaKey: false, ctrlKey: true }))).toBe("undo");
  });
  it("ignores keys typed into a text field", () => {
    expect(undoKeyAction(key({ target: document.createElement("textarea") }))).toBeNull();
    expect(undoKeyAction(key({ target: document.createElement("input") }))).toBeNull();
  });
  it("ignores other keys, a bare Z, and Alt", () => {
    expect(undoKeyAction(key({ key: "y" }))).toBeNull();
    expect(undoKeyAction(key({ metaKey: false }))).toBeNull();
    expect(undoKeyAction(key({ altKey: true }))).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd web && npm test -- undoKeys`
Expected: FAIL, `./undoKeys` does not resolve.

- [ ] **Step 3: Write `undoKeys.ts`**

```ts
import { useEffect, type Dispatch } from "react";
import type { BoardAction } from "../model/boardReducer";
import { isTextField } from "../state/keys";

export type KeyLike = Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey" | "target">;

/** Cmd-Z undoes, Shift-Cmd-Z redoes, Ctrl on other systems. Keys typed into a text field are the field's own:
 *  a note's text is not in an undo step (addendum 4.7). */
export function undoKeyAction(event: KeyLike): "undo" | "redo" | null {
  if (isTextField(event.target)) return null;
  if (!(event.metaKey || event.ctrlKey) || event.altKey || event.key.toLowerCase() !== "z") return null;
  return event.shiftKey ? "redo" : "undo";
}

/** One listener for the whole app: every board and highlight action, in either view, undoes the same way. */
export function useUndoKeys(dispatch: Dispatch<BoardAction>): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const action = undoKeyAction(event);
      if (!action) return;
      event.preventDefault();
      dispatch({ type: action });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dispatch]);
}
```

- [ ] **Step 4: Rewrite `App.tsx` around a Shell inside the provider**

`web/src/App.tsx`, whole file (the panels arrive in 3C.2 to 3C.5; each adds its button and its case):

```tsx
import { useEffect, useState } from "react";
import { api } from "./api/client";
import { BoardView } from "./board/BoardView";
import type { PageRect, PaperSummary, View } from "./model/types";
import { useUndoKeys } from "./panels/undoKeys";
import { PaperScreen } from "./PaperScreen";
import { BoardProvider, useBoard } from "./state/BoardProvider";
import "./styles.css";

export type Panel = "questions" | "export" | "tags" | "template";

function Notice() {
  const { notice, state } = useBoard();
  const tone = notice ? "warn" : state.dirty ? "unsaved" : "";
  return <span className={`notice ${tone}`}>{notice ?? (state.dirty ? "Unsaved" : `Saved v${state.board.version}`)}</span>;
}

function PaperPicker({ papers, value, onChange }: { papers: PaperSummary[]; value: string; onChange: (id: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Paper">
      {value === "" && <option value="">Choose a paper</option>}
      {papers.map((p) => <option key={p.paper_id} value={p.paper_id}>{p.title}</option>)}
    </select>
  );
}

function PanelButton({ panel, open, label, onToggle }: { panel: Panel; open: Panel | null; label: string; onToggle: (p: Panel) => void }) {
  return <button type="button" className="panel-button" aria-pressed={open === panel} onClick={() => onToggle(panel)}>{label}</button>;
}

/** The side panel's contents. 3C.2 to 3C.5 each add one case; until then a panel shows nothing. */
function SidePanel({ panel }: { panel: Panel }) {
  switch (panel) {
    default: return null;
  }
}

type ShellProps = { papers: PaperSummary[]; paperId: string; onChoose: (id: string) => void };

/** Everything that depends on the open board. The view is the board's (D5): the one you left is the one that opens. */
function Shell({ papers, paperId, onChoose }: ShellProps) {
  const { state, dispatch } = useBoard();
  const view = state.board.view;
  const [focusNode, setFocusNode] = useState<string | null>(null);
  const [focusRect, setFocusRect] = useState<PageRect | null>(null);
  const [panel, setPanel] = useState<Panel | null>(null);
  useUndoKeys(dispatch);
  const show = (next: View) => dispatch({ type: "setView", view: next });
  const openOnBoard = (id: string) => { setFocusNode(id); show("board"); };
  // A fresh object every time, so the paper scrolls again even for the same rect.
  const openInPaper = (rect: PageRect) => { setFocusRect({ ...rect }); show("paper"); };
  const toggle = (p: Panel) => setPanel((current) => (current === p ? null : p));
  return (
    <>
      <div className="topbar">
        <span className="wordmark">Paper Board</span>
        <div className="paper-title"><PaperPicker papers={papers} value={paperId} onChange={onChoose} /></div>
        <div className="segmented" role="group" aria-label="View">
          <button aria-pressed={view === "paper"} onClick={() => show("paper")}>Paper</button>
          <button aria-pressed={view === "board"} onClick={() => show("board")}>Board</button>
        </div>
        <div className="panel-buttons">{/* 3C.2 to 3C.5 add a PanelButton each, calling toggle */}</div>
        <Notice />
      </div>
      <div className="subbar">
        <input className="goal" aria-label="Reading goal" placeholder="Why am I reading this?" value={state.board.goal}
               onChange={(e) => dispatch({ type: "setGoal", goal: e.target.value })} />
      </div>
      <div className="workspace">
        {/* Both views stay mounted and the inactive one is only hidden: switching never moves anything (SPEC 4). */}
        <div className="views">
          <div className={`view ${view === "paper" ? "" : "inactive"}`}>
            <PaperScreen focus={focusRect} onFocusHandled={() => setFocusRect(null)} onOpenOnBoard={openOnBoard} />
          </div>
          <div className={`view ${view === "board" ? "" : "inactive"}`}>
            <BoardView active={view === "board"} focusNode={focusNode} onFocusHandled={() => setFocusNode(null)} onOpenInPaper={openInPaper} />
          </div>
        </div>
        {panel && <aside className="panel"><SidePanel panel={panel} /></aside>}
      </div>
    </>
  );
}

export default function App() {
  const [papers, setPapers] = useState<PaperSummary[]>([]);
  const [paperId, setPaperId] = useState<string | null>(null);
  useEffect(() => { api.listPapers().then(setPapers, (error: unknown) => console.error("Could not list the papers", error)); }, []);
  const choose = (id: string) => setPaperId(id || null);

  if (!paperId) {
    return (
      <div className="app">
        <div className="topbar"><span className="wordmark">Paper Board</span></div>
        <div className="start">
          <h1>Choose a paper</h1>
          <p>Read it, mark it, cut it into pieces, and lay the pieces out.</p>
          <PaperPicker papers={papers} value="" onChange={choose} />
          <p className="how">Add a paper with <code>paperboard extract paper.pdf --out ~/paperboard-data/papers</code></p>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <BoardProvider key={paperId} paperId={paperId}>
        <Shell papers={papers} paperId={paperId} onChoose={choose} />
      </BoardProvider>
    </div>
  );
}
```

`toggle` and `PanelButton` are unused until 3C.2; the tsconfig does not flag unused locals. The start screen has no subbar, so its `.start` spans rows 2 and 3.

In `web/src/styles/shell.css`, the app becomes three rows and the views share one cell beside an optional panel. Replace the `.app`, `.view` and `.view.inactive` rules with:

```css
.app { display: grid; grid-template-rows: var(--topbar-height) auto 1fr; height: 100%; }
.app > .start { grid-row: 2 / 4; }
.subbar { display: flex; align-items: center; gap: 16px; padding: 4px 16px; background: var(--surface); border-bottom: 1px solid var(--border); min-height: 36px; }
.goal { flex: 1; min-width: 160px; border: 0; border-bottom: 1px dashed var(--border-strong); background: none; padding: 2px 4px; color: var(--ink); font-family: var(--font-read); font-size: var(--text-read); }
.goal::placeholder { color: var(--ink-faint); font-style: italic; }
.workspace { display: grid; grid-template-columns: 1fr auto; min-height: 0; }
/* the two views share one cell and both stay laid out; visibility, not display, so the paper keeps
   its scroll offset and React Flow keeps its size while hidden */
.views { display: grid; min-height: 0; min-width: 0; }
.view { grid-row: 1; grid-column: 1; min-height: 0; }
.view.inactive { visibility: hidden; }
.panel { width: 320px; overflow: auto; padding: 12px 14px; border-left: 1px solid var(--border); background: var(--surface); }
.panel h3 { margin: 0 0 8px; font-size: var(--text-ui); font-weight: 600; }
.panel .hint { margin: 0 0 8px; color: var(--ink-faint); font-size: var(--text-ui-small); }
.panel-error { margin: 6px 0; color: var(--lost); font-size: var(--text-ui-small); }
.panel-buttons { display: inline-flex; gap: 4px; }
.panel-button { padding: 4px 10px; border: 1px solid var(--border); border-radius: var(--radius-pill); background: var(--surface); color: var(--ink-muted); font-weight: 500; }
.panel-button[aria-pressed="true"] { background: var(--surface-muted); color: var(--ink); border-color: var(--border-strong); }
```

- [ ] **Step 5: Run everything**

Run: `cd web && npm test && npm run build && npm run e2e`
Expected: all pass; Playwright 12 passed (the view buttons keep their names and `aria-pressed`).

By hand: switch to the board, wait for "Saved", reload and pick the paper: it opens on the board. Add a group, press Cmd-Z: it goes; Shift-Cmd-Z: it is back. Type in the goal and press Cmd-Z inside it: the text undoes, the board does not. Reload: the goal is kept.

- [ ] **Step 6: Commit**

```bash
git add web/src/App.tsx web/src/panels web/src/styles/shell.css
git commit -m "feat(web): the view and the goal come from the board, and Cmd-Z undoes anywhere but a text field"
```

---

### Task 3C.2: The filter bar and the tag manager (D8)

**Files:**
- Create: `web/src/tags/FilterBar.tsx`, `web/src/tags/TagManager.tsx`
- Modify: `web/src/App.tsx`, `web/src/styles/shell.css`
- Test: `web/src/tags/TagManager.test.tsx`

**Interfaces:**
- Produces: `<FilterBar />` in the subbar (`.filter-bar button.chip`, `aria-pressed`, a "clear" button); `<TagManager />` in the Tags panel (rename, recolour, delete; deleting drops the tag from the filter).

- [ ] **Step 1: Write the failing test**

`web/src/tags/TagManager.test.tsx`:

```tsx
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const dispatch = vi.fn();
const remove = vi.fn(async () => undefined);
const update = vi.fn(async () => undefined);
const tag = { id: "t-a", name: "claim", colour: "#b91c1c" };
vi.mock("../state/BoardProvider", () => ({ useBoard: () => ({ state: { board: { active_tags: ["t-a", "t-b"] } }, dispatch }) }));
vi.mock("../state/TagsProvider", () => ({ useTags: () => ({ tags: [tag], byId: new Map([[tag.id, tag]]), error: null, update, remove, add: vi.fn() }) }));
import { TagManager } from "./TagManager";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("the tag manager", () => {
  it("deleting a tag drops it from the filter, so the board never filters by a tag nobody can see", async () => {
    render(<TagManager />);
    fireEvent.click(screen.getByRole("button", { name: "Delete claim" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "setActiveTags", tags: ["t-b"] });
    await vi.waitFor(() => expect(remove).toHaveBeenCalledWith("t-a"));
  });
  it("renames on blur, and keeps the old name when the new one is empty", () => {
    render(<TagManager />);
    const name = screen.getByLabelText("Name of claim");
    fireEvent.change(name, { target: { value: "thesis" } });
    fireEvent.blur(name);
    expect(update).toHaveBeenCalledWith({ ...tag, name: "thesis" });
    fireEvent.change(name, { target: { value: "  " } });
    fireEvent.blur(name);
    expect(update).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd web && npm test -- TagManager`
Expected: FAIL, `./TagManager` does not resolve.

- [ ] **Step 3: Write the filter bar and the manager**

`web/src/tags/FilterBar.tsx`:

```tsx
import { useBoard } from "../state/BoardProvider";
import { useTags } from "../state/TagsProvider";

/** The tag filter (D8): the board shows what carries any active tag. It is view state, saved but never undone. */
export function FilterBar() {
  const { state, dispatch } = useBoard();
  const { tags } = useTags();
  const active = state.board.active_tags;
  const set = (next: string[]) => dispatch({ type: "setActiveTags", tags: next });
  const toggle = (id: string) => set(active.includes(id) ? active.filter((t) => t !== id) : [...active, id]);
  return (
    <div className="filter-bar" role="group" aria-label="Filter by tag">
      {tags.map((t) => (
        <button key={t.id} type="button" className={`chip ${active.includes(t.id) ? "on" : ""}`} aria-pressed={active.includes(t.id)}
                style={{ borderColor: t.colour, color: t.colour }} onClick={() => toggle(t.id)}>{t.name}</button>
      ))}
      {active.length > 0 && <button type="button" className="quiet clear" onClick={() => set([])}>clear</button>}
    </div>
  );
}
```

`web/src/tags/TagManager.tsx`:

```tsx
import { useEffect, useState } from "react";
import type { Tag } from "../model/types";
import { useBoard } from "../state/BoardProvider";
import { useTags } from "../state/TagsProvider";

function TagRow({ tag, onChange, onDelete }: { tag: Tag; onChange: (tag: Tag) => void; onDelete: () => void }) {
  const [name, setName] = useState(tag.name);
  useEffect(() => setName(tag.name), [tag.name]);
  const commit = () => {
    const next = name.trim();
    if (next && next !== tag.name) onChange({ ...tag, name: next });
    else setName(tag.name);
  };
  return (
    <li>
      <input type="color" value={tag.colour.toLowerCase()} aria-label={`Colour of ${tag.name}`} onChange={(e) => onChange({ ...tag, colour: e.target.value })} />
      <input type="text" value={name} aria-label={`Name of ${tag.name}`} onChange={(e) => setName(e.target.value)} onBlur={commit}
             onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
      <button type="button" className="quiet" aria-label={`Delete ${tag.name}`} onClick={onDelete}>×</button>
    </li>
  );
}

/** Rename, recolour, delete (SPEC 5.2). Tags are global; a deleted tag's id is ignored wherever it remains (addendum 4.3).
 *  No confirmation: re-adding a tag is one click in any picker. */
export function TagManager() {
  const { tags, update, remove, error } = useTags();
  const { state, dispatch } = useBoard();
  const drop = (id: string) => {
    const active = state.board.active_tags;
    if (active.includes(id)) dispatch({ type: "setActiveTags", tags: active.filter((t) => t !== id) });
    void remove(id);
  };
  return (
    <section className="tag-manager" aria-label="Tags">
      <h3>Tags</h3>
      <p className="hint">Shared by every paper. Renaming a tag renames it everywhere.</p>
      <ul>{tags.map((t) => <TagRow key={t.id} tag={t} onChange={(next) => void update(next)} onDelete={() => drop(t.id)} />)}</ul>
      {error && <p className="panel-error" role="alert">{error}</p>}
    </section>
  );
}
```

In `App.tsx`: put `<FilterBar />` after the goal in `.subbar`; replace the placeholder `.panel-buttons` div with

```tsx
        <div className="panel-buttons">
          <PanelButton panel="tags" open={panel} label="Tags" onToggle={toggle} />
        </div>
```

and add `case "tags": return <TagManager />;` to `SidePanel`'s switch.

Add to `shell.css`:

```css
.filter-bar { display: inline-flex; flex-wrap: wrap; gap: 4px; align-items: center; }
.filter-bar .chip { cursor: pointer; opacity: 0.55; }
.filter-bar .chip.on { opacity: 1; font-weight: 600; }
.filter-bar .clear { color: var(--ink-muted); font-size: var(--text-ui-small); }
.tag-manager ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.tag-manager li { display: flex; align-items: center; gap: 6px; }
.tag-manager input[type="text"] { flex: 1; min-width: 0; padding: 3px 6px; border: 1px solid var(--border); border-radius: var(--radius-small); }
.tag-manager input[type="color"] { width: 26px; height: 22px; padding: 0; border: 0; background: none; }
```

- [ ] **Step 4: Run the tests, then check by hand**

Run: `cd web && npm test && npm run build`
Expected: all pass.

By hand: tag one chunk `claim`; click `claim` in the filter bar: only that chunk (and any group holding it) shows; marks in other chunks dim; the paper is not filtered. Reload: the filter is still on. Open Tags, rename `pass 1` to `first look`: every chip updates, no board changed. Delete the active `claim`: the filter clears.

- [ ] **Step 5: Commit**

```bash
git add web/src/tags/FilterBar.tsx web/src/tags/TagManager.tsx web/src/tags/TagManager.test.tsx web/src/App.tsx web/src/styles/shell.css
git commit -m "feat(web): the tag filter bar, and renaming, recolouring and deleting global tags"
```

---

### Task 3C.3: The question list (D14)

The list is the server's (`GET /questions`): every highlight or piece tagged `question` with no reader note connected. The client shows it and refetches whenever a save lands (the board's `version` changes), so connecting a note of your own clears an entry after the save, and an AI note never does. Clicking an entry opens it: a highlight in the paper, anything else on the board.

**Files:**
- Create: `web/src/panels/QuestionList.tsx`
- Modify: `web/src/App.tsx`, `web/src/styles/shell.css`
- Test: `web/src/panels/QuestionList.test.tsx`

**Interfaces:**
- Produces: `<QuestionList onPick(question) />` (`.question-list li button`), `QUESTIONS_FAILED_MESSAGE`, `QUESTION_CHARS = 90`.

- [ ] **Step 1: Write the failing test**

`web/src/panels/QuestionList.test.tsx`:

```tsx
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const board = { version: 3 };
vi.mock("../state/BoardProvider", () => ({ useBoard: () => ({ paperId: "p", state: { board } }) }));
vi.mock("../api/client", () => ({ api: { getQuestions: vi.fn() } }));
import { api } from "../api/client";
import { QUESTIONS_FAILED_MESSAGE, QuestionList } from "./QuestionList";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("the question list", () => {
  it("shows the server's list and opens what is clicked", async () => {
    vi.mocked(api.getQuestions).mockResolvedValue([{ id: "h-1", kind: "highlight", text: "the residual function" }]);
    const onPick = vi.fn();
    render(<QuestionList onPick={onPick} />);
    fireEvent.click(await screen.findByRole("button", { name: /the residual function/ }));
    expect(onPick).toHaveBeenCalledWith({ id: "h-1", kind: "highlight", text: "the residual function" });
  });
  it("fetches again when a save lands", async () => {
    vi.mocked(api.getQuestions).mockResolvedValue([]);
    const { rerender } = render(<QuestionList onPick={vi.fn()} />);
    await vi.waitFor(() => expect(api.getQuestions).toHaveBeenCalledTimes(1));
    board.version = 4;
    rerender(<QuestionList onPick={vi.fn()} />);
    await vi.waitFor(() => expect(api.getQuestions).toHaveBeenCalledTimes(2));
  });
  it("says so when the list cannot be loaded", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(api.getQuestions).mockRejectedValue(new Error("down"));
    render(<QuestionList onPick={vi.fn()} />);
    expect(await screen.findByText(QUESTIONS_FAILED_MESSAGE)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd web && npm test -- QuestionList`
Expected: FAIL, `./QuestionList` does not resolve.

- [ ] **Step 3: Write the list and wire it**

`web/src/panels/QuestionList.tsx`:

```tsx
import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { Question } from "../model/types";
import { useBoard } from "../state/BoardProvider";

export const QUESTIONS_FAILED_MESSAGE = "Could not load the question list.";
export const QUESTION_CHARS = 90;

/** What is not yet understood (SPEC 5.2): the server's list, never recomputed here. Only a note of the reader's own
 *  clears an entry (D14), so an AI answer leaves it on the list. */
export function QuestionList({ onPick }: { onPick: (question: Question) => void }) {
  const { paperId, state } = useBoard();
  const version = state.board.version;
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    api.getQuestions(paperId).then(
      (list) => { if (live) { setQuestions(list); setError(null); } },
      (failure: unknown) => { console.error(QUESTIONS_FAILED_MESSAGE, failure); if (live) setError(QUESTIONS_FAILED_MESSAGE); });
    return () => { live = false; };
  }, [paperId, version]);
  return (
    <section className="question-list" aria-label="Not yet understood">
      <h3>Not yet understood</h3>
      {error && <p className="panel-error" role="alert">{error}</p>}
      {questions?.length === 0 && <p className="hint">Nothing tagged <i>question</i> is waiting for a note of yours.</p>}
      <ul>
        {questions?.map((q) => (
          <li key={q.id}><button type="button" onClick={() => onPick(q)}><span className="kind">{q.kind}</span> {q.text.slice(0, QUESTION_CHARS)}</button></li>
        ))}
      </ul>
    </section>
  );
}
```

In `App.tsx`'s `Shell`:

```tsx
  const onQuestion = (q: Question) => {
    if (q.kind !== "highlight") return openOnBoard(q.id);
    const mark = state.board.highlights.find((h) => h.id === q.id);
    if (mark) openInPaper(mark.anchor.rects[0]);
  };
```

`SidePanel` takes `onQuestion` as a prop and gains `case "questions": return <QuestionList onPick={onQuestion} />;`; add `<PanelButton panel="questions" open={panel} label="Questions" onToggle={toggle} />` first in `.panel-buttons`.

Add to `shell.css`:

```css
.question-list ul { list-style: none; margin: 0; padding: 0; }
.question-list li { border-top: 1px solid var(--border); }
.question-list li button { width: 100%; padding: 6px 0; border: 0; background: none; text-align: left; font-family: var(--font-read); font-size: 13px; }
.question-list li button:hover { color: var(--cut); }
.question-list .kind { margin-right: 6px; font-family: var(--font-ui); font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--ink-muted); }
```

- [ ] **Step 4: Run the tests, then check by hand**

Run: `cd web && npm test && npm run build`
Expected: all pass.

By hand: tag a mark `question`; open Questions: it is listed. Ask elsewhere on it: after the save it is still listed. Add a note of your own to it: after the save it is gone. Click an entry: the paper scrolls to the mark.

- [ ] **Step 5: Commit**

```bash
git add web/src/panels web/src/App.tsx web/src/styles/shell.css
git commit -m "feat(web): the question list, refetched after every save"
```

---

### Task 3C.4: Export (D6, D19)

Export saves any pending change first (`flush`, which also waits for note writes), then asks the server to write `export.md` in the paper's order or the template's, filtered by the active tags. The dialog shows the path, and the Markdown with a copy button when the server returns it.

**Files:**
- Create: `web/src/panels/ExportDialog.tsx`
- Modify: `web/src/App.tsx`, `web/src/styles/shell.css`
- Test: `web/src/panels/ExportDialog.test.tsx`

**Interfaces:**
- Produces: `<ExportDialog />` (`.export-dialog`, select "Order", button "Write export", `code` path, `pre` Markdown), `EXPORT_FAILED_MESSAGE`.

- [ ] **Step 1: Write the failing test**

`web/src/panels/ExportDialog.test.tsx`:

```tsx
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const calls: string[] = [];
const flush = vi.fn(async () => { calls.push("flush"); });
vi.mock("../state/BoardProvider", () => ({ useBoard: () => ({ paperId: "p", flush, state: { board: { active_tags: ["t-pass1"] } } }) }));
vi.mock("../api/client", () => ({ api: { postExport: vi.fn(async () => { calls.push("export"); return { path: "/data/papers/p/export.md", markdown: "# Title" }; }) } }));
import { api } from "../api/client";
import { ExportDialog } from "./ExportDialog";

afterEach(() => { cleanup(); vi.clearAllMocks(); calls.length = 0; });

describe("export", () => {
  it("saves what is pending first, then writes in the chosen order with the active filter", async () => {
    render(<ExportDialog />);
    fireEvent.change(screen.getByLabelText("Order"), { target: { value: "template" } });
    fireEvent.click(screen.getByRole("button", { name: "Write export" }));
    expect(await screen.findByText("/data/papers/p/export.md")).toBeTruthy();
    expect(calls).toEqual(["flush", "export"]);
    expect(api.postExport).toHaveBeenCalledWith("p", ["t-pass1"], "template");
    expect(screen.getByText("# Title")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd web && npm test -- ExportDialog`
Expected: FAIL, `./ExportDialog` does not resolve.

- [ ] **Step 3: Write the dialog and wire it**

`web/src/panels/ExportDialog.tsx`:

```tsx
import { useState } from "react";
import { api } from "../api/client";
import type { ExportOrder, ExportResult } from "../model/types";
import { useBoard } from "../state/BoardProvider";

export const EXPORT_FAILED_MESSAGE = "Could not write the export. The board is unchanged.";
export const COPY_FAILED_MESSAGE = "Could not copy. Select the text below instead.";

/** The literature note (SPEC 6): in the paper's order or the template's (D19), filtered by the active tags. */
export function ExportDialog() {
  const { paperId, state, flush } = useBoard();
  const [order, setOrder] = useState<ExportOrder>("paper");
  const [result, setResult] = useState<ExportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = state.board.active_tags;
  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      await flush();   // export writes what is on screen, pending changes and note text included
      setResult(await api.postExport(paperId, active, order));
    } catch (failure) {
      console.error(EXPORT_FAILED_MESSAGE, failure);
      setError(EXPORT_FAILED_MESSAGE);
    } finally {
      setBusy(false);
    }
  };
  const copy = (markdown: string) => navigator.clipboard.writeText(markdown).catch((failure: unknown) => {
    console.error(COPY_FAILED_MESSAGE, failure);
    setError(COPY_FAILED_MESSAGE);
  });
  return (
    <section className="export-dialog" aria-label="Export">
      <h3>Export</h3>
      <label className="field">Order
        <select aria-label="Order" value={order} onChange={(e) => setOrder(e.target.value as ExportOrder)}>
          <option value="paper">The paper's order</option>
          <option value="template">The template's questions</option>
        </select>
      </label>
      <p className="hint">{active.length ? "Only what the tag filter shows." : "The whole board."}</p>
      <button type="button" onClick={() => void run()} disabled={busy}>Write export</button>
      {error && <p className="panel-error" role="alert">{error}</p>}
      {result && (
        <div className="export-result">
          <p>Written to <code>{result.path}</code></p>
          {result.markdown !== undefined && <><button type="button" onClick={() => void copy(result.markdown!)}>Copy Markdown</button><pre>{result.markdown}</pre></>}
        </div>
      )}
    </section>
  );
}
```

In `App.tsx`: `case "export": return <ExportDialog />;` and `<PanelButton panel="export" open={panel} label="Export" onToggle={toggle} />` after Questions.

Add to `shell.css`:

```css
.export-dialog { display: flex; flex-direction: column; gap: 8px; }
.export-dialog .field { display: flex; flex-direction: column; gap: 4px; font-size: var(--text-ui-small); color: var(--ink-muted); }
.export-dialog select, .export-dialog button { padding: 5px 10px; border: 1px solid var(--border-strong); border-radius: var(--radius-small); background: var(--surface); }
.export-result code { font-family: var(--font-mono); font-size: var(--text-ui-small); word-break: break-all; }
.export-result pre { max-height: 50vh; overflow: auto; white-space: pre-wrap; font-family: var(--font-read); font-size: 12.5px; line-height: var(--leading-read); background: var(--surface-muted); padding: 8px; border-radius: var(--radius-small); }
```

- [ ] **Step 4: Run the tests, then check by hand**

Run: `cd web && npm test && npm run build`
Expected: all pass.

By hand: write a note and, without clicking away, open Export and Write export: the file holds the note's text. Filter to `claim` and export: only claim-tagged things. Choose the template's questions: each slot is a heading with its question in italics, and "Not in a slot" holds the rest; an AI note starts with `**AI:**`.

- [ ] **Step 5: Commit**

```bash
git add web/src/panels web/src/App.tsx web/src/styles/shell.css
git commit -m "feat(web): export in the paper's order or the template's, saving pending changes first"
```

---

### Task 3C.5: The template editor (D17)

Cheap enough to include: one list of name and question pairs, with add, delete, move up and down, and save. Editing it changes future boards only, which the panel says.

**Files:**
- Create: `web/src/panels/template.ts`, `web/src/panels/TemplateEditor.tsx`
- Modify: `web/src/App.tsx`, `web/src/styles/shell.css`
- Test: `web/src/panels/template.test.ts`

**Interfaces:**
- Produces: `moveSlot(slots, index, delta): Slot[]`, `setSlot(slots, index, patch): Slot[]`, `withoutSlot(slots, index): Slot[]`, `BLANK_SLOT`, `cleanTemplate(slots): TemplateFile`; `<TemplateEditor />` (`.template-editor`).

- [ ] **Step 1: Write the failing test**

`web/src/panels/template.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { cleanTemplate, moveSlot, setSlot, withoutSlot } from "./template";

const slots = [{ name: "A", prompt: "a?" }, { name: "B", prompt: "b?" }, { name: "C", prompt: "c?" }];

describe("editing the template", () => {
  it("moves a slot up or down, and not past either end", () => {
    expect(moveSlot(slots, 1, -1).map((s) => s.name)).toEqual(["B", "A", "C"]);
    expect(moveSlot(slots, 2, 1)).toBe(slots);
  });
  it("edits and deletes one slot without touching the others", () => {
    expect(setSlot(slots, 0, { prompt: "new?" })[0]).toEqual({ name: "A", prompt: "new?" });
    expect(withoutSlot(slots, 1).map((s) => s.name)).toEqual(["A", "C"]);
  });
  it("saves trimmed slots and drops one with no name", () => {
    expect(cleanTemplate([{ name: "  Main point ", prompt: " What? " }, { name: " ", prompt: "lost?" }])).toEqual({ schema: 1, slots: [{ name: "Main point", prompt: "What?" }] });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd web && npm test -- template`
Expected: FAIL, `./template` does not resolve.

- [ ] **Step 3: Write the helpers and the editor, and wire them**

`web/src/panels/template.ts`:

```ts
import type { Slot, TemplateFile } from "../model/types";

export const BLANK_SLOT: Slot = { name: "New slot", prompt: "" };

export function moveSlot(slots: Slot[], index: number, delta: -1 | 1): Slot[] {
  const to = index + delta;
  if (to < 0 || to >= slots.length) return slots;
  const next = [...slots];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

export const setSlot = (slots: Slot[], index: number, patch: Partial<Slot>): Slot[] => slots.map((s, i) => (i === index ? { ...s, ...patch } : s));
export const withoutSlot = (slots: Slot[], index: number): Slot[] => slots.filter((_, i) => i !== index);

/** What is saved: trimmed, and a slot needs a name (a group's name is what the grid shows). */
export function cleanTemplate(slots: Slot[]): TemplateFile {
  return { schema: 1, slots: slots.map((s) => ({ name: s.name.trim(), prompt: s.prompt.trim() })).filter((s) => s.name) };
}
```

`web/src/panels/TemplateEditor.tsx`:

```tsx
import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { Slot } from "../model/types";
import { BLANK_SLOT, cleanTemplate, moveSlot, setSlot, withoutSlot } from "./template";

export const TEMPLATE_FAILED_MESSAGE = "Could not load or save the template.";
export const TEMPLATE_SAVED_MESSAGE = "Saved. Papers opened for the first time from now on start with these slots.";

/** The slots a new board starts with (D17), global like the tags. Questions about papers in general, written once. */
export function TemplateEditor() {
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const fail = (failure: unknown) => { console.error(TEMPLATE_FAILED_MESSAGE, failure); setStatus(TEMPLATE_FAILED_MESSAGE); };
  useEffect(() => { api.getTemplate().then((t) => setSlots(t.slots), fail); }, []);
  const save = async () => {
    if (!slots) return;
    try { setSlots((await api.putTemplate(cleanTemplate(slots))).slots); setStatus(TEMPLATE_SAVED_MESSAGE); } catch (failure) { fail(failure); }
  };
  if (!slots) return <section className="template-editor"><p className="hint">{status ?? "Loading the template"}</p></section>;
  return (
    <section className="template-editor" aria-label="Template">
      <h3>Template</h3>
      <p className="hint">The slots a new board starts with, three to a row. Boards you have already opened keep theirs.</p>
      <ol>
        {slots.map((slot, i) => (
          <li key={i}>
            <input aria-label={`Slot ${i + 1} name`} value={slot.name} onChange={(e) => setSlots(setSlot(slots, i, { name: e.target.value }))} />
            <textarea aria-label={`Slot ${i + 1} question`} value={slot.prompt} onChange={(e) => setSlots(setSlot(slots, i, { prompt: e.target.value }))} />
            <div className="row-tools">
              <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => setSlots(moveSlot(slots, i, -1))}>↑</button>
              <button type="button" aria-label="Move down" disabled={i === slots.length - 1} onClick={() => setSlots(moveSlot(slots, i, 1))}>↓</button>
              <button type="button" aria-label="Delete slot" onClick={() => setSlots(withoutSlot(slots, i))}>×</button>
            </div>
          </li>
        ))}
      </ol>
      <div className="row-tools">
        <button type="button" onClick={() => setSlots([...slots, BLANK_SLOT])}>Add slot</button>
        <button type="button" onClick={() => void save()}>Save template</button>
      </div>
      {status && <p className="hint" role="status">{status}</p>}
    </section>
  );
}
```

In `App.tsx`: `case "template": return <TemplateEditor />;` and `<PanelButton panel="template" open={panel} label="Template" onToggle={toggle} />` last in `.panel-buttons`. `SidePanel` now covers all four panels; delete its empty `default` case.

Add to `shell.css`:

```css
.template-editor ol { margin: 0 0 8px; padding-left: 18px; display: flex; flex-direction: column; gap: 10px; }
.template-editor li { display: flex; flex-direction: column; gap: 4px; }
.template-editor input, .template-editor textarea { padding: 4px 6px; border: 1px solid var(--border); border-radius: var(--radius-small); }
.template-editor textarea { min-height: 44px; resize: vertical; font-family: var(--font-read); }
.template-editor .row-tools { display: flex; gap: 4px; }
.template-editor .row-tools button { padding: 2px 8px; border: 1px solid var(--border); border-radius: var(--radius-small); background: var(--surface); }
```

- [ ] **Step 4: Run everything**

Run: `cd web && npm test && npm run build && npm run e2e`
Expected: all pass; Playwright 12 passed.

By hand: open Template, move "My take" above "Limits", save. Add a paper that has never been opened (a scratch data folder): its slots are in the new order. A board opened before keeps its own slots.

- [ ] **Step 5: Commit**

```bash
git add web/src/panels web/src/App.tsx web/src/styles/shell.css
git commit -m "feat(web): edit the template's slots for future boards"
```

---

## Task 3D: Acceptance, mechanised (serial)

**Owns:** `web/e2e/step5.spec.ts` (new).
**Must not touch:** everything else. A failure here that needs a code change goes back to the task that owns the file.
**Consumes:** the whole Shared DOM contract; the e2e server of `web/e2e/server.mjs` (ResNet extracted into a fresh store); `POST /api/papers` to add Attention; `tests/fixtures/papers/attention.pdf` (fetched by `scripts/fetch_fixtures.py`; `PAPERBOARD_ATTENTION` overrides the path in a worktree that lacks it).
**Produces:** the mechanical half of SPEC.md section 11 (items 4, 5 and 6; item 6 is also `step3.spec.ts`), and one test per behaviour of this plan most likely to regress.

Specs run in file order with one worker, and `step5` runs last, so the specs before it see only ResNet. Attention is uploaded once, before the first test here, and its first test is the first time any page opens it.

- [ ] **Step 1: Write the spec**

`web/e2e/step5.spec.ts`:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const ATTENTION_PDF = process.env.PAPERBOARD_ATTENTION ?? resolve(process.cwd(), "..", "tests", "fixtures", "papers", "attention.pdf");
const UPLOAD_TIMEOUT_MS = 240_000;
/** A whole-word highlight may start a little before the drag point, never at the line's own start. */
const WORD_SLACK_PX = 4;

let attention = "";
let resnet = "";

test.beforeAll(async ({ playwright }, info) => {
  info.setTimeout(UPLOAD_TIMEOUT_MS);
  const request = await playwright.request.newContext({ baseURL: info.project.use.baseURL });
  const before: { paper_id: string }[] = await (await request.get("/api/papers")).json();
  const upload = await request.post("/api/papers", {
    multipart: { file: { name: "attention.pdf", mimeType: "application/pdf", buffer: readFileSync(ATTENTION_PDF) } }, timeout: UPLOAD_TIMEOUT_MS,
  });
  expect(upload.ok()).toBeTruthy();
  attention = (await upload.json()).paper_id;
  resnet = before.map((p) => p.paper_id).find((id) => id !== attention)!;
  await request.dispose();
});

// ---- helpers ------------------------------------------------------------------------------------------------

type Json = Record<string, any>;
const boardOf = async (request: APIRequestContext, id: string): Promise<Json> => (await request.get(`/api/papers/${id}/board`)).json();
const sourceOf = async (request: APIRequestContext, id: string): Promise<Json> => (await request.get(`/api/papers/${id}/source`)).json();

async function open(page: Page, id: string) {
  await page.goto("/");
  await page.locator("select").first().selectOption(id);
  await expect(page.locator(".react-pdf__Page").first()).toBeVisible();
}

/** Saves a board holding exactly these things, in the paper view with no filter, then opens it. */
async function seed(page: Page, id: string, parts: { nodes?: Json[]; edges?: Json[]; highlights?: Json[] } = {}) {
  const current = await boardOf(page.request, id);
  const next = { ...current, nodes: parts.nodes ?? [], edges: parts.edges ?? [], highlights: parts.highlights ?? [], active_tags: [], view: "paper" };
  delete next.paper_scroll;
  const put = await page.request.put(`/api/papers/${id}/board`, { data: next, headers: { "If-Match": String(current.version) } });
  expect(put.ok()).toBeTruthy();
  await open(page, id);
}

const quote = (exact: string) => ({ exact, prefix: "", suffix: "" });
const AREA = [50, 130, 280, 300];
const chunk = (id: string, x: number, y: number, text: string, extra: Json = {}) => ({
  id, type: "chunk", position: { x, y }, width: 320, ...extra,
  data: { tags: [], collapsed: false, user_sized: false, region: { rects: [{ page: 0, rect: AREA }], start: quote(text), end: quote(text), position: 0, state: "anchored" },
    blocks: [{ kind: "text", page: 0, rect: AREA, text }] },
});
const group = (id: string, x: number, y: number, width: number, height: number, data: Json = {}) =>
  ({ id, type: "group", position: { x, y }, width, height, data: { tags: [], ...data } });

const showBoard = (page: Page) => page.getByRole("button", { name: "Board", exact: true }).click();
const node = (page: Page, id: string) => page.locator(`.react-flow__node[data-id="${id}"]`);

async function markIds(page: Page): Promise<string[]> {
  const ids = await page.locator(".overlay .mark").evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.highlightId ?? ""));
  return [...new Set(ids)].filter(Boolean);
}

/** A drag from one text span to another on a page; Alt keeps exactly what was selected (addendum 5.3). */
async function drag(page: Page, pageNo: number, from: number, to: number, exact = true) {
  const spans = page.locator(`.react-pdf__Page[data-page-number="${pageNo}"] .react-pdf__Page__textContent span`);
  await expect(spans.nth(to)).toBeVisible();
  await spans.nth(from).scrollIntoViewIfNeeded();
  const a = (await spans.nth(from).boundingBox())!;
  const b = (await spans.nth(to).boundingBox())!;
  if (exact) await page.keyboard.down("Alt");
  await page.mouse.move(a.x + 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width - 2, b.y + b.height / 2, { steps: 8 });
  await page.mouse.up();
  if (exact) await page.keyboard.up("Alt");
  await expect(page.getByRole("button", { name: "Highlight", exact: true })).toBeVisible();
}

async function highlight(page: Page, pageNo: number, from: number, to: number): Promise<string> {
  const before = await markIds(page);
  await drag(page, pageNo, from, to);
  await page.getByRole("button", { name: "Highlight", exact: true }).click();
  await expect.poll(async () => (await markIds(page)).length).toBe(before.length + 1);
  return (await markIds(page)).find((id) => !before.includes(id))!;
}

async function cut(page: Page, pageNo: number, from: number, to: number) {
  await drag(page, pageNo, from, to, false);
  await page.getByRole("button", { name: "Cut", exact: true }).click();
  await expect(page.getByRole("button", { name: "Cut", exact: true })).toBeHidden();
}

async function clickMark(page: Page, id: string) {
  const mark = page.locator(`.overlay .mark[data-highlight-id="${id}"]`).first();
  await mark.scrollIntoViewIfNeeded();
  const box = (await mark.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

// ---- Attention: first open, blocks, links -------------------------------------------------------------------

test("first open shows the tray and nine slots, and one Cmd-Z takes the whole layout back", async ({ page }) => {
  const source = await sourceOf(page.request, attention);
  await open(page, attention);
  await showBoard(page);
  const tray = page.locator(".node.group.tray");
  await expect(tray).toHaveCount(1);
  await expect(tray.locator(".group-name")).toHaveText("Paper");
  await expect(page.locator(".node.group.slot")).toHaveCount(9);
  await expect(page.locator(".slot-prompt")).toHaveCount(9);
  await expect(page.locator(".node.chunk")).toHaveCount(source.sections.length);
  await expect(page.locator(".node.figure")).toHaveCount(source.figures.length);
  await expect.poll(async () => (await boardOf(page.request, attention)).version).toBeGreaterThan(0);

  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator(".react-flow__node")).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(page.locator(".node.group.slot")).toHaveCount(9);
  await expect.poll(async () => (await boardOf(page.request, attention)).nodes.length).toBeGreaterThan(9);
});

test("a chunk over Attention's §3.2.1 shows equation (1) as an image of the page", async ({ page }) => {
  await open(page, attention);
  await showBoard(page);
  const card = page.locator(".react-flow__node", { has: page.locator(".node.chunk .title", { hasText: "Scaled Dot-Product Attention" }) }).first();
  await card.getByTitle("Expand", { exact: true }).click();
  const clip = card.locator(".node-body img.block-clip").first();
  await expect(clip).toBeVisible();
  expect(new URL((await clip.getAttribute("src"))!, "http://local").searchParams.get("page")).toBe("3");   // equation (1) is on page 4
  await expect.poll(() => clip.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
});

test("the paper's own link to section 3.2 scrolls the paper to §3.2", async ({ page }) => {
  // Attention p.2, "as described in section 3.2": the link covers [188.6, 476.5, 203.1, 485.3]; its destination,
  // the heading "3.2 Attention", is at y 681 on page 3. The paper has no link reading "Section 3".
  const source = await sourceOf(page.request, attention);
  await open(page, attention);
  const paper = page.locator(".paper");
  const two = page.locator('.react-pdf__Page[data-page-number="2"]');
  await expect(two.locator(".annotationLayer a").first()).toBeAttached();
  const scale = (await two.locator("canvas").boundingBox())!.width / source.pages[1].width;
  await two.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await paper.evaluate((el, dy) => el.scrollBy(0, dy), 481 * scale - 400);
  const box = (await two.locator("canvas").boundingBox())!;
  await page.mouse.click(box.x + 195 * scale, box.y + 481 * scale);
  const three = page.locator('.react-pdf__Page[data-page-number="3"] canvas');
  await expect.poll(async () => {
    const b = (await three.boundingBox())!;
    const view = (await paper.boundingBox())!;
    const heading = b.y + 681 * scale;
    return heading > view.y && heading < view.y + view.height;
  }).toBe(true);
});

// ---- ResNet: marks, connections, undo, the view ---------------------------------------------------------------

test("a highlight across two columns paints only the words selected, line by line", async ({ page }) => {
  await seed(page, resnet);
  const pageEl = page.locator('.react-pdf__Page[data-page-number="3"]');
  await pageEl.evaluate((el) => el.scrollIntoView({ block: "start" }));
  const canvas = (await pageEl.locator("canvas").boundingBox())!;
  const mid = canvas.x + canvas.width / 2;
  const boxes = await pageEl.locator(".react-pdf__Page__textContent span").evaluateAll((els) =>
    els.map((el) => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; }));
  const wide = (b: { left: number; right: number }) => b.right - b.left > 120;
  const at = (fraction: number) => canvas.y + canvas.height * fraction;
  const start = boxes.findIndex((b) => b.right < mid && b.top > at(0.55) && b.bottom < at(0.8) && wide(b));
  const end = boxes.findIndex((b, i) => i > start && b.left > mid && b.top > at(0.1) && b.bottom < at(0.35) && wide(b));
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  const a = boxes[start];
  const b = boxes[end];

  const before = await markIds(page);
  await page.keyboard.down("Alt");
  await page.mouse.move((a.left + a.right) / 2, (a.top + a.bottom) / 2);
  await page.mouse.down();
  await page.mouse.move((b.left + b.right) / 2, (b.top + b.bottom) / 2, { steps: 12 });
  await page.mouse.up();
  await page.keyboard.up("Alt");
  await page.getByRole("button", { name: "Highlight", exact: true }).click();
  await expect.poll(async () => (await markIds(page)).length).toBe(before.length + 1);
  const id = (await markIds(page)).find((m) => !before.includes(m))!;

  const lines = await page.locator(`.overlay .mark[data-highlight-id="${id}"]`).evaluateAll((els) =>
    els.map((el) => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top }; }));
  const left = lines.filter((l) => l.right < mid);
  const right = lines.filter((l) => l.left > mid);
  expect(left.length).toBeGreaterThan(0);
  expect(right.length).toBeGreaterThan(0);
  const first = left.reduce((x, y) => (y.top < x.top ? y : x));
  const last = right.reduce((x, y) => (y.top > x.top ? y : x));
  expect(first.left).toBeGreaterThan(a.left + WORD_SLACK_PX);    // the unselected start of the first line is not painted
  expect(last.right).toBeLessThan(b.right - WORD_SLACK_PX);      // nor the unselected end of the last
});

test("two marks in no chunk, connected, show jump chips both ways, and a line once a chunk holds each", async ({ page }) => {
  await seed(page, resnet);
  const one = await highlight(page, 3, 4, 6);
  const two = await highlight(page, 4, 138, 140);
  await clickMark(page, one);
  await page.locator(".mark-popover").getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.locator(".paper.connecting")).toBeVisible();
  await clickMark(page, two);
  await expect(page.locator(".margin-chip")).toHaveCount(2);
  await expect(page.locator(".react-flow__edge")).toHaveCount(0);   // neither end is in a chunk (D12)

  await cut(page, 3, 2, 8);
  await expect(page.locator(".react-flow__node")).toHaveCount(1);
  await expect(page.locator(".react-flow__edge")).toHaveCount(0);   // one end is still in no chunk: addendum 4.0 draws nothing
  await cut(page, 4, 136, 142);
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);   // both ends held: the line appears

  await page.locator(".page-wrap").nth(2).locator(".margin-chip").click();
  await expect(page.locator(`.overlay .mark[data-highlight-id="${two}"]`).first()).toBeInViewport();
});

test("a question with only an AI note stays on the list, and a note of your own clears it", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await seed(page, resnet);
  const id = await highlight(page, 3, 20, 22);
  await clickMark(page, id);
  const popover = page.locator(".mark-popover");
  await popover.getByLabel("question", { exact: true }).check();
  const questions = page.getByRole("button", { name: "Questions", exact: true });
  await questions.click();
  await expect(page.locator(".question-list li")).toHaveCount(1);

  await popover.getByRole("button", { name: "Ask elsewhere", exact: true }).click();
  await expect(page.locator(".node.note.ai")).toHaveCount(1);
  await expect.poll(async () => (await boardOf(page.request, resnet)).nodes.filter((n: Json) => n.type === "note").length).toBe(1);
  const marked = (await boardOf(page.request, resnet)).highlights.find((h: Json) => h.id === id).anchor.quote.exact.split(/\s+/)[0];
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(marked);
  await questions.click();
  await questions.click();   // reopened: a fresh fetch from the server
  await expect(page.locator(".question-list li")).toHaveCount(1);

  await popover.getByRole("button", { name: "Add note", exact: true }).click();
  const mine = popover.locator(".note-editor.reader textarea");
  await mine.fill("The block learns what to add to its input, not the whole mapping.");
  await mine.blur();
  await expect(page.locator(".question-list li")).toHaveCount(0);
});

test("Cmd-Z undoes a group dissolve in one step", async ({ page }) => {
  await seed(page, resnet, { nodes: [
    group("n-g", 450, 40, 700, 560, { name: "Pile" }),
    chunk("n-a", 24, 60, "First.", { parentId: "n-g" }),
    chunk("n-b", 24, 300, "Second.", { parentId: "n-g" }),
  ] });
  await showBoard(page);
  await node(page, "n-g").locator(".group-name").click();
  await page.keyboard.press("Delete");
  await expect(node(page, "n-g")).toHaveCount(0);
  await expect(node(page, "n-a")).toBeVisible();
  await expect.poll(async () => (await boardOf(page.request, resnet)).nodes.some((n: Json) => n.id === "n-g")).toBe(false);

  await page.keyboard.press("ControlOrMeta+z");
  await expect(node(page, "n-g")).toHaveCount(1);
  await expect.poll(async () => (await boardOf(page.request, resnet)).nodes.filter((n: Json) => n.parentId === "n-g").map((n: Json) => n.id).sort())
    .toEqual(["n-a", "n-b"]);
});

test("Tidy moves only connected pieces, and one Cmd-Z puts them back", async ({ page }) => {
  await seed(page, resnet, {
    nodes: [chunk("n-a", 40, 100, "Alpha."), chunk("n-b", 1600, 1200, "Beta."), chunk("n-c", 40, 700, "Gamma."),
      group("n-g", 900, 100, 400, 300), chunk("n-d", 20, 48, "Delta.", { parentId: "n-g" })],
    edges: [{ id: "e-ab", from: "n-a", to: "n-b", data: { tags: [] } }],
  });
  await showBoard(page);
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);
  const positions = async () => Object.fromEntries((await boardOf(page.request, resnet)).nodes.map((n: Json) => [n.id, n.position]));
  const before = await positions();
  await page.getByRole("button", { name: "Tidy", exact: true }).click();
  await expect.poll(async () => { const now = await positions(); return JSON.stringify([now["n-a"], now["n-b"]]) !== JSON.stringify([before["n-a"], before["n-b"]]); }).toBe(true);
  const after = await positions();
  for (const id of ["n-c", "n-g", "n-d"]) expect(after[id]).toEqual(before[id]);

  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(positions).toEqual(before);
});

test("a reload returns to the same view and the same place in the paper (SPEC 11.5)", async ({ page }) => {
  await seed(page, resnet);
  const paper = page.locator(".paper");
  await expect(page.locator('.react-pdf__Page[data-page-number="6"] canvas')).toBeAttached();
  await paper.evaluate((el) => el.scrollTo(0, 3000));
  await expect.poll(async () => (await boardOf(page.request, resnet)).paper_scroll?.page ?? -1).toBeGreaterThan(0);
  const top = await paper.evaluate((el) => el.scrollTop);
  await page.reload();
  await page.locator("select").first().selectOption(resnet);
  await expect.poll(async () => Math.abs((await paper.evaluate((el) => el.scrollTop)) - top)).toBeLessThan(3);

  await showBoard(page);
  await expect.poll(async () => (await boardOf(page.request, resnet)).view).toBe("board");
  await page.reload();
  await page.locator("select").first().selectOption(resnet);
  await expect(page.getByRole("button", { name: "Board", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".react-flow__pane")).toBeVisible();
});

test("filtering to a first-pass tag shows only its pieces, and export writes them in either order (SPEC 11.4)", async ({ page }) => {
  await seed(page, resnet, { nodes: [chunk("n-alpha", 40, 100, "Alpha claim text."), chunk("n-beta", 40, 500, "Beta other text.")] });
  await showBoard(page);
  const alpha = node(page, "n-alpha");
  await alpha.getByRole("button", { name: "Tags", exact: true }).click();
  await alpha.getByLabel("pass 1", { exact: true }).check();
  await page.locator(".filter-bar .chip", { hasText: "pass 1" }).click();
  await expect(node(page, "n-beta")).toHaveCount(0);
  await expect(alpha).toBeVisible();

  await page.getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.locator(".export-dialog");
  await dialog.getByRole("button", { name: "Write export", exact: true }).click();
  await expect(dialog.locator("code")).toBeVisible();
  const path = (await dialog.locator("code").textContent())!;
  const inPaperOrder = readFileSync(path, "utf-8");
  expect(inPaperOrder).toContain("Alpha claim");
  expect(inPaperOrder).not.toContain("Beta other");
  await dialog.getByLabel("Order").selectOption("template");
  await dialog.getByRole("button", { name: "Write export", exact: true }).click();
  await expect.poll(() => readFileSync(path, "utf-8")).toContain("## Not in a slot");
});
```

- [ ] **Step 2: Run it**

Run: `cd web && npx playwright test step5`
Expected: 10 passed. The first run takes longer: Attention is extracted on upload.

Span indices and fractions of the page are the fragile part, as in the core plan's spec; the trace viewer (`npx playwright show-trace`) names the step that drifted. Adjust a span index or a fraction, never an assertion about behaviour. A failure in an assertion about behaviour goes to the task that owns the behaviour.

- [ ] **Step 3: Run the whole suite**

Run: `cd web && npm test && npm run build && npm run e2e`
Expected: all vitest files pass; Playwright 22 passed (12 before this plan, 10 here).

- [ ] **Step 4: Commit**

```bash
git add web/e2e/step5.spec.ts
git commit -m "test(web): mechanise the acceptance checks for the features plan"
```

---

## Done when

- `cd web && npm test && npm run build && npm run e2e` all pass: every vitest file, 22 Playwright tests in 5 spec files.
- SPEC.md section 11, all six checks, done by a person on a paper they needed to read, with the answers written into the merge commit's message. Item 4, "filter to your first-pass tag; does it match what you knew after ten minutes", is a judgment and is recorded as one.
- The exported Markdown for that paper, in both orders, has been read once as a literature note, and reads as one.

## Deferred, with reasons

- **Markdown rendering in notes.** Notes are stored as Markdown and shown as wrapped text. Rendering wants a library and a decision about editing mode; neither is needed to test the reading loop.
- **Back and Forward, a section outline, citation peek, automatic term linking, calling an AI from the tool.** Not in v1 (SPEC.md section 9).
- **An upload and re-upload screen.** `POST /api/papers` replaces a paper and reports what changed (D9), but papers are still added with the CLI and nothing in the client shows the report. The anchors' `relocated` and `orphaned` states are flagged on every mark, outline and card, as before.
- **Reordering template slots by dragging.** Up and down buttons do the job for nine rows.
- **Collapse all, expand all.** Every piece collapses on its own; a board-wide switch is a convenience no acceptance check needs.
- **Marking find hits that cross text-layer items.** A hit split across two of pdf.js's text items is scrolled to but not marked.
- **Rotated pages.** Link destinations and rectangle drags assume `rotation` 0, like the rest of the client (addendum 2 puts rotation at the boundary; no fixture has it).
- **Moving a line's end to another thing.** Delete it and draw it again; React Flow's edge reconnect would need handle mapping both ways for one saved click.
- **Where a new cut lands.** Still under the lowest top-level node at the left (core plan). With the tray on the left, that is below the tray; placing cuts next to the slots is a layout choice to make after using it.
- **A handle at an unpainted mark's line.** A mark inside a chunk whose quote is not found in its text keeps its handle at the card's title.
- **Undo beyond the session and inside text.** The stack is empty after a reload, and typing in a note or the goal uses the field's own undo (addendum 4.7).
- **Concept notes, multi-paper, citation graphs.** Not in v1 (SPEC.md section 9).

## Choices this plan made where the spec left room

Each is a place the spec or the brief could be read more than one way; the plan picks one and says why. Red-pen them.

1. **The filter shows a chunk when a mark inside it carries an active tag** (3.0.2 `hiddenNodeIds`). Addendum 4.2 says a node shows by its own `data.tags`; addendum 6.1 exports a chunk "when it or a highlight inside it" carries a tag. The export rule is taken, so filtering to `pass 1` shows the chunks where you marked in pass 1. Prefer 4.2's literal rule if tags on marks should never reveal their chunks.
2. **The goal is not in an undo step** (3.0.3). Addendum 4.7 snapshots "the board without its view state"; the goal is not view state, but it is typed in a text field whose own undo runs, like a note's text.
3. **The client places the tray's rows itself**, at `trayRow(index in paper order)`, ignoring the drafts' `position` (3.0.4). This is what puts ghost rows exactly in their sections' places. The rule is the addendum's; only who applies it moves.
4. **Tray and slot sizes are the client's named constants**: tray 360 wide, rows 44 apart from 48 below the name; slots 400 by 300, 24 apart, 60 right of the tray (3.0.4). The addendum asks for named constants and gives none.
5. **Split with no tray makes one left of everything** (3.0.4). The addendum says "makes a new tray first" without saying where.
6. **Clicking a heading opens the selection popover with Cut** (and Open on board when the section already has a piece), rather than cutting on a bare click (3A.1). A stray click never makes a piece, and after first open every section already has one. The cut takes the section's id as `source_id`.
7. **Shift-drag draws a rectangle** (3A.2). The spec names the rectangle but no gesture; Alt already means "exact", and Shift is not claimed by a text drag.
8. **An area cut's caption and `source_id` come from the figure the snap took**, found by geometry (3A.2): `POST /text` returns no caption.
9. **Connecting to a heading reuses a mark already on the heading** instead of making a second one (3A.3).
10. **A card end uses the card's own handles `<id>-in` and `<id>-out`, in React Flow's Loose mode** (3B.1, 3B.2). The addendum says a node end has no handle; React Flow needs one on both ends, so the card's own stands for the card. A collapsed chunk puts its marks' handles on its top edge.
11. **No line to itself, and no second line between the same two things** (3.0.3 `add`).
12. **Delete lives where the selection lives** (3A.1, 3B.2): on the paper, Delete removes the mark whose popover is open; on the board, React Flow's selection. The brief put all keys in 3C; 3C owns only Cmd-Z and Shift-Cmd-Z.
13. **The brief's "a line once a chunk is cut around one" is tested as "around each"** (3D). Addendum 4.0: "the line appears the moment a chunk is cut around both ends". The test asserts no line after one cut and a line after both.
14. **The brief's "clicking Section 3" is the link "section 3.2" on page 2** (3D). Attention has no link reading "Section 3"; measured with PyMuPDF, this one goes to §3.2 on page 3 at y 681.
15. **Export shows the Markdown only when the server returns it** (3C.4). The addendum's route returns `{path}`; today's server also returns `markdown`. 3D reads the file at the path either way.
16. **The edge resolver is 2.0's** (consumed by 3.0.1). Brief 2C lists it in 3.0; brief 2.0 builds it. 3.0 checks it and does not rewrite it.
17. **`TagPicker`, `TagChips`, `isTextField` and section naming live in 3.0**, not in 3C and 3A, because 3A, 3B and 3C all use them and may not share a file.
18. **Tidy's numbers**: link distance 480, a collision circle of half the diagonal plus 24, 300 ticks, a seeded random source (3B.5). A mark's end counts as the top-level ancestor of the chunk that holds it.
19. **A note written on a mark lands beside the first chunk holding it, at the top level**, else under everything (3.0.2 `spotForNoteOn`).
20. **Find names a hit's section by its context, then by the words before, then after** (3A.5), because four words of context can run past a section's end.
21. **The paper reports its scroll 300 ms after scrolling stops** (3A.6), then the board's usual 500 ms save debounce applies.
22. **A ghost row names the section in full** ("§3 Model Architecture"); the addendum's example shortens it to "§3 Model".
23. **A first open that fails shows the board empty with a notice**; Split retries it (3.0.5).
24. **The existing specs reset their board before each test** (3.0.5), so they pass alone as well as in order now that a never-saved board is laid out on first open.
25. **3D uploads Attention itself** through `POST /api/papers`, since the e2e server extracts only ResNet and 3D owns only its spec file.
26. **No `TemplateProvider`.** The template is read once, at first open (3.0.4), and edited in one panel (3C.5); nothing else holds it, so a provider would share nothing.
27. **"Collapse everywhere" is read as every piece collapsing with its counts**: chunks, figures and notes each collapse (Wave 1C), and a collapsed chunk or figure shows its marks and notes (3B.1). A board-wide Collapse all is deferred.
