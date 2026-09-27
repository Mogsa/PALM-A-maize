import { describe, expect, it } from "vitest";
import { emptyBoard, type BoardNode, type ChunkNode, type PageRect, type Source } from "../model/types";
import { pageBrackets } from "./brackets";

const q = (exact: string) => ({ exact, prefix: "", suffix: "" });
const piece = (id: string, rects: PageRect[], extra: Partial<ChunkNode> = {}, source_id: string | null = null, text = "Deep residual learning makes it easy"): ChunkNode => ({
  id, type: "chunk", position: { x: 0, y: 0 }, ...extra,
  data: { tags: [], collapsed: false, user_sized: false, blocks: [], source_id,
    region: { rects, start: q(text), end: q("end"), position: 0, state: "anchored" } },
});
const tray: BoardNode = { id: "n-tray", type: "group", position: { x: 0, y: 0 }, data: { tags: [], name: "Paper", tray: true } };
const slot: BoardNode = { id: "n-slot", type: "group", position: { x: 0, y: 0 }, data: { tags: [], name: "Paper" } };
const section = { id: "s-3", number: "3.", depth: 1, title: "Method", heading_rect: { page: 0, rect: [0, 0, 1, 1] }, extent: [], text: "" };
const source = { sections: [section], figures: [], pages: [], regions: [], page_text: [] } as unknown as Source;
const board = (nodes: BoardNode[]) => ({ ...emptyBoard("p"), nodes });
const at = (page: number, y0: number, y1: number): PageRect => ({ page, rect: [50, y0, 300, y1] });

describe("the cut brackets in the paper's margin", () => {
  it("draws every piece: grey while still in the tray, coloured once out of it (a reader's cut included)", () => {
    const nodes = [tray, slot, piece("n-in", [at(0, 10, 20)], { parentId: "n-tray" }, "s-3"),
      piece("n-out", [at(0, 100, 120)], { parentId: "n-slot" }, "s-3"), piece("n-cut", [at(0, 200, 220)])];
    const brackets = pageBrackets(board(nodes), source, 0);
    expect(brackets.map((b) => [b.nodeId, b.tray])).toEqual([["n-in", true], ["n-out", false], ["n-cut", false]]);
  });
  it("spans exactly from the piece's first line to its last on the page", () => {
    const [b] = pageBrackets(board([piece("n-1", [at(0, 300, 312), at(0, 140, 152), at(0, 200, 212)])]), source, 0);
    expect([b.top, b.bottom]).toEqual([140, 312]);
  });
  it("continues across pages, named only where it starts", () => {
    const nodes = [piece("n-1", [at(0, 600, 700), at(1, 40, 90)], {}, "s-3")];
    const [first] = pageBrackets(board(nodes), source, 0);
    const [next] = pageBrackets(board(nodes), source, 1);
    expect(first).toMatchObject({ top: 600, bottom: 700, label: "§3", continues: true });
    expect(next).toMatchObject({ top: 40, bottom: 90, label: null, continues: false });
    expect(pageBrackets(board(nodes), source, 2)).toEqual([]);
  });
  it("names a reader's cut by its first words", () => {
    const [b] = pageBrackets(board([piece("n-1", [at(0, 10, 20)])]), source, 0);
    expect(b.label).toBe("Deep residual learning…");
  });
  it("sets overlapping pieces side by side, and lets a piece below reuse the first lane", () => {
    const nodes = [piece("n-a", [at(0, 100, 300)]), piece("n-b", [at(0, 200, 400)]), piece("n-c", [at(0, 250, 260)]), piece("n-d", [at(0, 500, 520)])];
    const lanes = Object.fromEntries(pageBrackets(board(nodes), source, 0).map((b) => [b.nodeId, b.lane]));
    expect(lanes).toEqual({ "n-a": 0, "n-b": 1, "n-c": 2, "n-d": 0 });
  });
});
