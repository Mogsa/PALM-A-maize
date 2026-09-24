import { describe, expect, it } from "vitest";
import { trayRow } from "../model/tray";
import { emptyBoard, type BoardNode, type Highlight, type Rect, type Source } from "../model/types";
import { ghostRows } from "./ghostRows";

const q = { exact: "x", prefix: "", suffix: "" };
const pr = (page: number, rect: Rect) => ({ page, rect });
const section = (n: string, y: number) => ({ id: `sec-${n}`, number: n, depth: 1, title: `Title ${n}`, heading_rect: pr(0, [60, y, 200, y + 10]), extent: [pr(0, [50, y, 300, y + 90])], text: "" });
const source = { regions: [{ page: 0, rect: [40, 40, 320, 700], label: "text" }], sections: [section("1", 50), section("2", 150), section("3", 250)], figures: [] } as unknown as Source;
const chunk = (id: string, sourceId: string, parentId?: string): BoardNode => ({ id, type: "chunk", position: { x: 0, y: 0 }, ...(parentId ? { parentId } : {}),
  data: { tags: [], collapsed: true, region: { rects: [pr(0, [50, 0, 300, 10])], start: q, end: q, position: 0, state: "anchored" }, blocks: [], user_sized: false, source_id: sourceId } });
const group = (id: string, name?: string, tray?: boolean): BoardNode => ({ id, type: "group", position: { x: 0, y: 0 }, data: { tags: [], ...(name ? { name } : {}), ...(tray ? { tray } : {}) } });
const note = (id: string): BoardNode => ({ id, type: "note", position: { x: 0, y: 0 }, data: { tags: [], collapsed: false, note: `notes/${id}.md`, origin: "reader" } });
const mark = (id: string, y: number): Highlight => ({ id, tags: [], anchor: { rects: [pr(0, [60, y, 200, y + 8])], quote: q, position: 0, state: "anchored" } });
const edge = (id: string, from: string, to: string) => ({ id, from, to, data: { tags: [] } });

describe("ghost rows (D18)", () => {
  const board = {
    ...emptyBoard("p"),
    nodes: [group("n-t", "Paper", true), chunk("n-1", "sec-1", "n-t"), group("n-m", "Method"), chunk("n-2", "sec-2", "n-m"), note("n-a"), note("n-b"), note("n-c")],
    highlights: [mark("h-1", 160), mark("h-2", 200), mark("h-3", 60)],
    edges: [edge("e-1", "h-1", "n-a"), edge("e-2", "n-b", "n-2")],
  };
  it("draws a row in each missing section's place, naming where its piece went and counting its marks and notes", () => {
    expect(ghostRows(board, source, "n-t")).toEqual([
      { sectionId: "sec-2", y: trayRow(1).y, text: "§2 Title 2 → in Method · 2 marks · 2 notes", nodeId: "n-2", headingRect: source.sections[1].heading_rect },
      { sectionId: "sec-3", y: trayRow(2).y, text: "§3 Title 3 not on the board · 0 marks · 0 notes", nodeId: null, headingRect: source.sections[2].heading_rect },
    ]);
  });
  it("says a top-level piece is on the board, and names an unnamed group as a group", () => {
    const top = { ...board, nodes: board.nodes.map((n) => (n.id === "n-2" ? { ...n, parentId: undefined } : n)) as BoardNode[] };
    expect(ghostRows(top, source, "n-t")[0].text).toBe("§2 Title 2 → on the board · 2 marks · 2 notes");
    const unnamed = { ...board, nodes: board.nodes.map((n) => (n.id === "n-m" ? group("n-m") : n)) };
    expect(ghostRows(unnamed, source, "n-t")[0].text).toContain("→ in a group");
  });
  it("counts one mark and one note in the singular", () => {
    const one = { ...board, highlights: [mark("h-1", 160)], edges: [edge("e-1", "h-1", "n-a")] };
    expect(ghostRows(one, source, "n-t")[0].text).toBe("§2 Title 2 → in Method · 1 mark · 1 note");
  });
});
