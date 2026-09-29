import { describe, expect, it } from "vitest";
import { boardReducer, initialBoardState, type BoardAction, type BoardState } from "./boardReducer";
import { emptyBoard, type BoardNode, type ChunkNode, type Rect } from "./types";

const q = { exact: "x", prefix: "", suffix: "" };
const chunk = (id: string, y: number, extra: Partial<ChunkNode> = {}): ChunkNode => ({
  id, type: "chunk", position: { x: 0, y }, width: 320, ...extra,
  data: { tags: [], collapsed: false, user_sized: false, blocks: [],
    region: { rects: [{ page: 0, rect: [50, y, 280, y + 100] as Rect }], start: q, end: q, position: 0, state: "anchored" } },
});
const note = (id: string): BoardNode => ({ id, type: "note", position: { x: 600, y: 0 }, data: { tags: [], collapsed: false, note: `notes/${id}.md`, origin: "reader" } });
const edge = (id: string, from: string, to: string) => ({ id, from, to, data: { tags: [] } });
const run = (s: BoardState, a: BoardAction) => boardReducer(s, a);
const loaded = (nodes: BoardNode[], edges = [] as ReturnType<typeof edge>[]) =>
  run(initialBoardState, { type: "load", board: { ...emptyBoard("p"), nodes, edges } });

describe("reshape: Split here, Cut out and Join (addendum 4.10)", () => {
  it("a split keeps the chunk's id and its connections, and puts the new pieces just after it, as one undo step", () => {
    const s0 = loaded([chunk("n-a", 0), note("n-n"), chunk("n-z", 500)], [edge("e-1", "n-a", "n-n")]);
    const keep = chunk("n-a", 0, { position: { x: 7, y: 0 } });
    const s1 = run(s0, { type: "reshape", keep, add: [chunk("n-b", 0), chunk("n-c", 0)] });
    expect(s1.board.nodes.map((n) => n.id)).toEqual(["n-a", "n-b", "n-c", "n-n", "n-z"]);
    expect(s1.board.nodes[0].position.x).toBe(7);
    expect(s1.board.edges).toEqual(s0.board.edges);
    expect(s1.history.past).toHaveLength(1);
    expect(run(s1, { type: "undo" }).board.nodes.map((n) => n.id)).toEqual(["n-a", "n-n", "n-z"]);
  });

  it("a join removes the others and moves their connections to the kept chunk", () => {
    const s0 = loaded([chunk("n-a", 0), chunk("n-b", 100), note("n-n"), note("n-m")],
      [edge("e-1", "n-n", "n-b"), edge("e-2", "h-1", "n-b")]);
    const s1 = run(s0, { type: "reshape", keep: chunk("n-a", 0), removeIds: ["n-b"] });
    expect(s1.board.nodes.map((n) => n.id)).toEqual(["n-a", "n-n", "n-m"]);
    expect(s1.board.edges).toEqual([edge("e-1", "n-n", "n-a"), edge("e-2", "h-1", "n-a")]);
  });

  it("a line between two joined chunks goes, and so does a second line to the same note", () => {
    const s0 = loaded([chunk("n-a", 0), chunk("n-b", 100), note("n-n")],
      [edge("e-1", "n-a", "n-b"), edge("e-2", "n-a", "n-n"), edge("e-3", "n-n", "n-b")]);
    const s1 = run(s0, { type: "reshape", keep: chunk("n-a", 0), removeIds: ["n-b"] });
    expect(s1.board.edges).toEqual([edge("e-2", "n-a", "n-n")]);
  });

  it("undo after a join brings back every piece and every line that pointed at them (Review Focus 5)", () => {
    const edges = [edge("e-1", "n-a", "n-b"), edge("e-3", "n-n", "n-b")];
    const s0 = loaded([chunk("n-a", 0), chunk("n-b", 100), note("n-n")], edges);
    const s2 = run(run(s0, { type: "reshape", keep: chunk("n-a", 0), removeIds: ["n-b"] }), { type: "undo" });
    expect(s2.board.nodes.map((n) => n.id)).toEqual(["n-a", "n-b", "n-n"]);
    expect(s2.board.edges).toEqual(edges);
  });

  it("does nothing, and records nothing, when the kept chunk is no longer on the board", () => {
    const s0 = loaded([chunk("n-a", 0)]);
    const s1 = run(s0, { type: "reshape", keep: chunk("n-gone", 0), add: [chunk("n-b", 0)] });
    expect(s1).toBe(s0);
  });
});
