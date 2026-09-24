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
