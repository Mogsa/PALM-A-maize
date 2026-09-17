import { describe, expect, it } from "vitest";
import { applyNodeChanges } from "@xyflow/react";
import { toBoardJson } from "./serialize";
import { emptyBoard, type BoardNode } from "./types";

const q = { exact: "x", prefix: "", suffix: "" };
const region = { rects: [{ page: 0, rect: [0, 0, 1, 1] as [number, number, number, number] }], start: q, end: q, position: 0, state: "anchored" as const };

const group: BoardNode = { id: "n-g", type: "group", position: { x: 0, y: 0 }, width: 500, height: 400, data: { tags: [], name: null } };
const child: BoardNode = { id: "n-c", type: "chunk", position: { x: 10, y: 10 }, parentId: "n-g", extent: "parent", width: 300,
  data: { tags: [], collapsed: false, region, text: "t", user_sized: false, source_id: null } };
const note: BoardNode = { id: "n-n", type: "note", position: { x: 700, y: 0 }, initialWidth: 280, data: { tags: [], collapsed: false, note: "notes/n-n.md" } };

describe("toBoardJson", () => {
  it("strips runtime fields React Flow adds during interaction", () => {
    let nodes: BoardNode[] = [group, child, note];
    nodes = applyNodeChanges([{ type: "select", id: "n-n", selected: true }], nodes) as BoardNode[];
    nodes = applyNodeChanges([{ type: "position", id: "n-n", position: { x: 710, y: 5 }, dragging: true }], nodes) as BoardNode[];
    nodes = applyNodeChanges([{ type: "dimensions", id: "n-n", dimensions: { width: 300, height: 120 }, resizing: true, setAttributes: true }], nodes) as BoardNode[];
    const out = toBoardJson({ ...emptyBoard("p"), nodes });
    const text = JSON.stringify(out);
    for (const field of ["selected", "dragging", "resizing", "measured", "internals"]) expect(text).not.toContain(`"${field}"`);
    const saved = out.nodes.find((n) => n.id === "n-n")!;
    expect(saved.position).toEqual({ x: 710, y: 5 });
    expect(saved.width).toBe(300);
  });

  it("orders parents before children and keeps the rest stable", () => {
    const out = toBoardJson({ ...emptyBoard("p"), nodes: [child, note, group] });
    expect(out.nodes.map((n) => n.id)).toEqual(["n-g", "n-c", "n-n"]);
  });

  it("drops undefined so a board that did not change is byte-identical", () => {
    const a = JSON.stringify(toBoardJson({ ...emptyBoard("p"), nodes: [group, child, note] }));
    const b = JSON.stringify(toBoardJson({ ...emptyBoard("p"), nodes: [{ ...group, hidden: undefined }, child, note] }));
    expect(a).toBe(b);
    expect(a).not.toContain("undefined");
  });

  it("round-trips through JSON to the same object", () => {
    const board = { ...emptyBoard("p"), nodes: [group, child, note] };
    const out = toBoardJson(board);
    expect(JSON.parse(JSON.stringify(out))).toEqual(out);
  });
});
