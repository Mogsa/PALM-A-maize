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
