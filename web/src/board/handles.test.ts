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
