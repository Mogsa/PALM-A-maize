import { describe, expect, it } from "vitest";
import { resolveEdges } from "./edges";
import { emptyBoard, type Board, type BoardEdge, type BoardNode, type Highlight, type PageRect, type Rect } from "./types";

const q = { exact: "x", prefix: "", suffix: "" };
const chunk = (id: string, ...rects: PageRect[]): BoardNode => ({
  id, type: "chunk", position: { x: 0, y: 0 },
  data: { tags: [], collapsed: false, blocks: [], user_sized: false, region: { rects, start: q, end: q, position: 0, state: "anchored" } },
});
const figure = (id: string, rect: PageRect): BoardNode => ({
  id, type: "figure", position: { x: 0, y: 0 },
  data: { tags: [], collapsed: false, caption: "Figure 1", region: { rects: [rect], start: q, end: q, position: 0, state: "anchored" } },
});
const note = (id: string): BoardNode => ({ id, type: "note", position: { x: 0, y: 0 }, data: { tags: [], collapsed: false, note: `notes/${id}.md` } });
const at = (page: number, rect: Rect): PageRect => ({ page, rect });
const mark = (id: string, ...rects: PageRect[]): Highlight => ({ id, tags: [], anchor: { rects, quote: q, position: 0, state: "anchored" } });
const edge = (id: string, from: string, to: string, extra: Partial<BoardEdge> = {}): BoardEdge => ({ id, from, to, data: { tags: [] }, ...extra });

const LEFT = at(2, [50, 100, 286, 400]);
const RIGHT = at(2, [309, 100, 545, 400]);
const IN_LEFT = at(2, [60, 200, 200, 212]);
const IN_RIGHT = at(2, [320, 200, 500, 212]);
const NOWHERE = at(7, [60, 200, 200, 212]);

const board = (nodes: BoardNode[], highlights: Highlight[], edges: BoardEdge[]): Board => ({ ...emptyBoard("p"), nodes, highlights, edges });
const ends = (b: Board) => resolveEdges(b).map(({ id, source, sourceHandle, target, targetHandle }) => ({ id, source, sourceHandle, target, targetHandle }));

describe("resolveEdges", () => {
  const nodes = [chunk("n-left", LEFT), chunk("n-right", RIGHT), note("n-note"), figure("n-fig", RIGHT)];
  const highlights = [mark("h-left", IN_LEFT), mark("h-right", IN_RIGHT), mark("h-loose", NOWHERE)];

  it.each([
    ["node to node: each end is the node itself, with no handle",
      edge("e-1", "n-note", "n-fig"), { source: "n-note", sourceHandle: undefined, target: "n-fig", targetHandle: undefined }],
    ["highlight to note: the highlight resolves to its chunk, with the highlight as the handle",
      edge("e-1", "h-left", "n-note"), { source: "n-left", sourceHandle: "h-left", target: "n-note", targetHandle: undefined }],
    ["note to highlight: the highlight end becomes the source, since only a source handle can hold it",
      edge("e-1", "n-note", "h-right"), { source: "n-right", sourceHandle: "h-right", target: "n-note", targetHandle: undefined }],
    ["highlight to highlight: each resolves to its own chunk",
      edge("e-1", "h-left", "h-right"), { source: "n-left", sourceHandle: "h-left", target: "n-right", targetHandle: "h-right" }],
  ])("%s", (_, e, expected) => {
    expect(ends(board(nodes, highlights, [e]))).toEqual([{ id: "e-1", ...expected }]);
  });

  it("an end on a highlight no chunk holds, or on anything missing, draws nothing", () => {
    const edges = [edge("e-loose", "h-loose", "n-note"), edge("e-gone", "n-note", "n-deleted"), edge("e-gone-mark", "h-deleted", "n-note")];
    expect(resolveEdges(board(nodes, highlights, edges))).toEqual([]);
  });

  it("a highlight in overlapping chunks resolves to the first of them in nodes order", () => {
    const overlapping = [chunk("n-wide", at(2, [40, 90, 300, 410])), ...nodes];
    expect(ends(board(overlapping, highlights, [edge("e-1", "h-left", "n-note")]))[0]).toMatchObject({ source: "n-wide", sourceHandle: "h-left" });
  });

  it("a highlight is held by a chunk that contains any one of its lines", () => {
    const spanning = mark("h-span", NOWHERE, IN_LEFT);
    expect(ends(board(nodes, [spanning], [edge("e-1", "h-span", "n-note")]))[0]).toMatchObject({ source: "n-left", sourceHandle: "h-span" });
  });

  it("a figure never holds a highlight's handle: only chunks draw marks", () => {
    const onlyFigure = [figure("n-fig", RIGHT), note("n-note")];
    expect(resolveEdges(board(onlyFigure, highlights, [edge("e-1", "h-right", "n-note")]))).toEqual([]);
  });

  it("keeps the edge's data and runtime selection", () => {
    const [resolved] = resolveEdges(board(nodes, highlights, [edge("e-1", "n-note", "n-fig", { data: { tags: ["t-supports"] }, selected: true })]));
    expect(resolved.data).toEqual({ tags: ["t-supports"] });
    expect(resolved.selected).toBe(true);
  });
});
