import { describe, expect, it } from "vitest";
import { planDelete } from "./dissolve";
import type { BoardEdge, BoardNode } from "./types";
import type { XY } from "./reparent";

const group = (id: string, x: number, y: number, parentId?: string, selected = false): BoardNode =>
  ({ id, type: "group", position: { x, y }, width: 400, height: 300, data: { tags: [] }, ...(parentId ? { parentId } : {}), selected });
const note = (id: string, x: number, y: number, parentId?: string, selected = false): BoardNode =>
  ({ id, type: "note", position: { x, y }, data: { tags: [], collapsed: false, note: `notes/${id}.md` }, ...(parentId ? { parentId } : {}), selected });
const edge = (id: string, source: string, target: string, selected = false): BoardEdge => ({ id, source, target, selected });

/** Absolute positions as React Flow would report them, walking parents. */
const absoluteOf = (nodes: BoardNode[]) => (id: string): XY => {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  let node = byId.get(id);
  let x = 0, y = 0;
  while (node) { x += node.position.x; y += node.position.y; node = node.parentId ? byId.get(node.parentId) : undefined; }
  return { x, y };
};

describe("planDelete", () => {
  it("dissolving a group lifts its child to absolute coordinates and keeps the child's edges", () => {
    const nodes = [group("n-g", 100, 50, undefined, true), note("n-c", 20, 30, "n-g"), note("n-o", 900, 900)];
    const edges = [edge("e-1", "n-c", "n-o")];
    // React Flow hands over the group, its descendant and every edge touching either.
    const plan = planDelete(nodes, [nodes[0], nodes[1]], edges, absoluteOf(nodes));
    expect(plan.nodes.map((n) => n.id)).toEqual(["n-g"]);
    expect(plan.edges).toEqual([]);
    expect(plan.lifted).toHaveLength(1);
    expect(plan.lifted[0].parentId).toBeUndefined();
    expect(plan.lifted[0].position).toEqual({ x: 120, y: 80 });
  });

  it("dissolving an outer group keeps a nested group whole and lifts only the nested group", () => {
    const nodes = [group("n-G", 100, 100, undefined, true), group("n-H", 10, 20, "n-G"), note("n-C", 5, 7, "n-H")];
    const plan = planDelete(nodes, nodes, [], absoluteOf(nodes));
    expect(plan.nodes.map((n) => n.id)).toEqual(["n-G"]);
    expect(plan.lifted.map((n) => n.id)).toEqual(["n-H"]);
    expect(plan.lifted[0].parentId).toBeUndefined();
    expect(plan.lifted[0].position).toEqual({ x: 110, y: 120 });
  });

  it("a child of a dissolved nested group lands in the surviving parent group, same place on screen", () => {
    const nodes = [group("n-G", 100, 100), group("n-H", 10, 20, "n-G", true), note("n-C", 5, 7, "n-H")];
    const plan = planDelete(nodes, [nodes[1], nodes[2]], [], absoluteOf(nodes));
    expect(plan.nodes.map((n) => n.id)).toEqual(["n-H"]);
    expect(plan.lifted).toHaveLength(1);
    expect(plan.lifted[0].parentId).toBe("n-G");
    expect(plan.lifted[0].position).toEqual({ x: 15, y: 27 });   // absolute (115,127) minus G at (100,100)
  });

  it("deletes a selected node inside a deleted group, and edges the reader selected", () => {
    const nodes = [group("n-g", 0, 0, undefined, true), note("n-c", 20, 30, "n-g", true), note("n-o", 900, 900)];
    const edges = [edge("e-1", "n-c", "n-o"), edge("e-2", "n-o", "n-x", true)];
    const plan = planDelete(nodes, [nodes[0], nodes[1]], edges, absoluteOf(nodes));
    expect(plan.nodes.map((n) => n.id)).toEqual(["n-g", "n-c"]);
    expect(plan.lifted).toEqual([]);
    expect(plan.edges.map((e) => e.id)).toEqual(["e-1", "e-2"]);
  });
});
