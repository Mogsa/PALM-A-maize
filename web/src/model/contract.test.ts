import { afterEach, describe, expect, it, vi } from "vitest";
import { api, CLIP_DPI } from "../api/client";
import type { BoardAction } from "./boardReducer";
import { resolveEdges, type ResolvedEdge } from "./edges";
import { highlightsIn } from "./geometry";
import { newId } from "./ids";
import { defaultPaperView } from "./paperView";
import {
  emptyBoard, type Block, type Board, type BoardEdge, type ChunkNode, type ExportResult, type GroupData,
  type Highlight, type NoteData, type PaperScroll, type Question, type Rect, type Selection, type SelectionMode, type Slot,
  type SplitDraft, type TagFile, type TemplateFile, type View,
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
const view: View = defaultPaperView.view;
const scroll: PaperScroll | null = defaultPaperView.paper_scroll;
const slot: GroupData = { tags: [], name: "Main point", prompt: "In your own words?", tray: false };
const origin: NoteData["origin"] = "reader";
const mode: SelectionMode = "area";
const templateSlot: Slot = { name: "Problem", prompt: "Why?" };
const shapes: [BoardEdge, Question, Selection["blocks"], SplitDraft["type"], TagFile["schema"], TemplateFile["slots"], ExportResult["path"], ResolvedEdge] | null = null;
const action: BoardAction = { type: "addHighlight", highlight: mark };
void [view, scroll, slot, origin, mode, templateSlot, shapes, action];

afterEach(() => vi.unstubAllGlobals());

describe("the schema 2 contract this plan builds on", () => {
  it("starts a board at schema 2, version 0, in the paper view", () => {
    const fresh = emptyBoard("p");
    expect(fresh).toMatchObject({ schema: 2, version: 0 });
    expect(defaultPaperView).toMatchObject({ view: "paper", paper_scroll: null });
  });
  it("mints tag ids", () => expect(newId("t")).toMatch(/^t-/));
  it("finds a highlight in a chunk by any one of its lines", () => {
    expect(highlightsIn([mark], chunk.data.region)).toEqual([mark]);
  });
  it("draws an edge from a highlight on the chunk that holds it, and a node end with no handle", () => {
    // 2.0 leaves a node end's handle undefined, which React Flow reads as "no handle", like null.
    expect(resolveEdges(board)).toEqual([{ id: "e-1", source: "n-c", sourceHandle: "h-1", target: "n-n", targetHandle: undefined, data: { tags: [] } }]);
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
    expect(await api.getNote("p", "n-x")).toEqual({ markdown: "", has_sketch: false });
  });
  it("sends the selection mode with the rects", async () => {
    const fetch = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    await api.postText("p", [line(0, [0, 0, 1, 1])], false, "area");
    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ rects: [line(0, [0, 0, 1, 1])], snap: false, mode: "area" });
  });
  it("names the question and export routes as the plan does", () => {
    expect(typeof api.getQuestions).toBe("function");
    expect(typeof api.postExport).toBe("function");
  });
});
