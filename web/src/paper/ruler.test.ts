import { describe, expect, it } from "vitest";
import { emptyBoard, type BoardNode, type ChunkNode, type PageRect, type Source } from "../model/types";
import { pageRuler } from "./ruler";

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

describe("the cut ruler in the paper's margin", () => {
  it("draws every piece: faint while still in the tray, solid once out of it (a reader's cut included)", () => {
    const nodes = [tray, slot, piece("n-in", [at(0, 10, 20)], { parentId: "n-tray" }, "s-3"),
      piece("n-out", [at(0, 100, 120)], { parentId: "n-slot" }, "s-3"), piece("n-cut", [at(0, 200, 220)])];
    const { stretches } = pageRuler(board(nodes), source, 0, true);
    expect(stretches.map((s) => [s.nodeId, s.tray])).toEqual([["n-in", true], ["n-out", false], ["n-cut", false]]);
  });
  it("with trays off a piece in the Paper group is an ordinary placed piece, solid, in board order; by default it is faint and first", () => {
    const nodes = [tray, piece("n-placed", [at(0, 100, 300)]), piece("n-in", [at(0, 200, 400)], { parentId: "n-tray" })];
    expect(pageRuler(board(nodes), source, 0, false).stretches.map((s) => [s.nodeId, s.tray])).toEqual([["n-placed", false], ["n-in", false]]);
    expect(pageRuler(board(nodes), source, 0).stretches.map((s) => [s.nodeId, s.tray])).toEqual([["n-in", true], ["n-placed", false]]);
  });
  it("spans exactly from the piece's first line to its last on the page, with a tick at each end", () => {
    const ruler = pageRuler(board([piece("n-1", [at(0, 300, 312), at(0, 140, 152), at(0, 200, 212)])]), source, 0);
    expect([ruler.stretches[0].top, ruler.stretches[0].bottom]).toEqual([140, 312]);
    expect(ruler.ticks).toEqual([140, 312]);
  });
  it("continues across pages with no tick where the page breaks, and names the piece on every page", () => {
    const nodes = [piece("n-1", [at(0, 600, 700), at(1, 40, 90)], {}, "s-3")];
    const first = pageRuler(board(nodes), source, 0);
    const next = pageRuler(board(nodes), source, 1);
    expect(first.stretches[0]).toMatchObject({ top: 600, bottom: 700, name: "§3" });
    expect(first.ticks).toEqual([600]);
    expect(next.stretches[0]).toMatchObject({ top: 40, bottom: 90, name: "§3" });
    expect(next.ticks).toEqual([90]);
    expect(pageRuler(board(nodes), source, 2)).toEqual({ stretches: [], ticks: [] });
  });
  it("names a reader's cut by its first words", () => {
    const { stretches } = pageRuler(board([piece("n-1", [at(0, 10, 20)])]), source, 0);
    expect(stretches[0].name).toBe("Deep residual learning…");
  });
  it("draws tray pieces first so a placed piece over them wins, and ticks every boundary of both", () => {
    const nodes = [tray, piece("n-placed", [at(0, 100, 300)]), piece("n-tray", [at(0, 200, 400)], { parentId: "n-tray" }), piece("n-same", [at(0, 300, 350)])];
    const ruler = pageRuler(board(nodes), source, 0, true);
    expect(ruler.stretches.map((s) => s.nodeId)).toEqual(["n-tray", "n-placed", "n-same"]);
    expect(ruler.ticks).toEqual([100, 200, 300, 350, 400]);
  });
});
