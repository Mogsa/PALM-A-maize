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
