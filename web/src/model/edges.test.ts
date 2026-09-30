import { describe, expect, it } from "vitest";
import { chunkHolder, resolveEdges } from "./edges";
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

  it("a highlight in chunks of the same size resolves to the first of them in nodes order", () => {
    const twins = [chunk("n-twin", LEFT), ...nodes];
    expect(ends(board(twins, highlights, [edge("e-1", "h-left", "n-note")]))[0]).toMatchObject({ source: "n-twin", sourceHandle: "h-left" });
  });

  it("a highlight is held by a chunk that contains any one of its lines", () => {
    const spanning = mark("h-span", NOWHERE, IN_LEFT);
    expect(ends(board(nodes, [spanning], [edge("e-1", "h-span", "n-note")]))[0]).toMatchObject({ source: "n-left", sourceHandle: "h-span" });
  });

  it("a figure never holds a highlight's handle: only chunks draw marks", () => {
    const onlyFigure = [figure("n-fig", RIGHT), note("n-note")];
    expect(resolveEdges(board(onlyFigure, highlights, [edge("e-1", "h-right", "n-note")]))).toEqual([]);
  });

  describe("which chunk draws a highlight's end (contract 3), trays on", () => {
    const tray: BoardNode = { id: "n-tray", type: "group", position: { x: 0, y: 0 }, data: { tags: [], name: "Paper", tray: true } };
    const pile: BoardNode = { id: "n-pile", type: "group", position: { x: 0, y: 0 }, parentId: "n-tray", data: { tags: [] } };
    const inside = (node: BoardNode, parentId: string): BoardNode => ({ ...node, parentId });
    const SMALL = at(2, [55, 190, 250, 220]);
    const WIDE = at(2, [40, 90, 300, 410]);
    it.each([
      ["a tray chunk and a reader's chunk both hold it: the reader's, though the tray's is smaller and first",
        [tray, inside(chunk("n-in-tray", SMALL), "n-tray"), chunk("n-reader", WIDE)], "n-reader"],
      ["two chunks outside the tray: the one with the smaller region",
        [chunk("n-wide", WIDE), chunk("n-small", SMALL)], "n-small"],
      ["a region's area is the sum of its rects",
        [chunk("n-two-rects", SMALL, at(2, [320, 50, 545, 500])), chunk("n-wide", WIDE)], "n-wide"],
      ["only the tray holds it: the tray's chunk",
        [tray, inside(chunk("n-in-tray", WIDE), "n-tray")], "n-in-tray"],
      ["only the tray holds it, at any depth: the smaller of the tray's chunks",
        [tray, pile, inside(chunk("n-in-tray", WIDE), "n-tray"), inside(chunk("n-in-pile", SMALL), "n-pile")], "n-in-pile"],
      ["a chunk in a group that is not the tray is outside the tray",
        [tray, inside(chunk("n-in-tray", SMALL), "n-tray"), { ...pile, parentId: undefined }, inside(chunk("n-in-pile", WIDE), "n-pile")], "n-in-pile"],
    ])("%s", (_, holders, expected) => {
      expect(chunkHolder(holders, true)(mark("h-left", IN_LEFT))?.id).toBe(expected);
    });
    it("with trays off the Paper group is an ordinary group: its smaller, first chunk draws the end", () => {
      const holders = [tray, inside(chunk("n-in-tray", SMALL), "n-tray"), chunk("n-reader", WIDE)];
      expect(chunkHolder(holders, false)(mark("h-left", IN_LEFT))?.id).toBe("n-in-tray");
      const b = board([...holders, note("n-note")], [mark("h-left", IN_LEFT)], [edge("e-1", "h-left", "n-note")]);
      expect(ends(b)[0]).toMatchObject({ source: "n-in-tray", sourceHandle: "h-left" });
    });
  });

  it("keeps the edge's data and runtime selection", () => {
    const [resolved] = resolveEdges(board(nodes, highlights, [edge("e-1", "n-note", "n-fig", { data: { tags: ["t-supports"] }, selected: true })]));
    expect(resolved.data).toEqual({ tags: ["t-supports"] });
    expect(resolved.selected).toBe(true);
  });
});
