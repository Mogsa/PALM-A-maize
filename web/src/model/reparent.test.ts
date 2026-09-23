import { describe, expect, it } from "vitest";
import { absoluteIn, fitsInside, isDescendant, reparent, toAbsolute, toRelative } from "./reparent";
import type { BoardNode } from "./types";

const note: BoardNode = { id: "n-n", type: "note", position: { x: 700, y: 300 }, data: { tags: [], collapsed: false, note: "notes/n-n.md" } };

describe("reparent", () => {
  it("relative and absolute are inverses", () => {
    expect(toRelative({ x: 700, y: 300 }, { x: 400, y: 120 })).toEqual({ x: 300, y: 180 });
    expect(toAbsolute({ x: 300, y: 180 }, { x: 400, y: 120 })).toEqual({ x: 700, y: 300 });
  });
  it("moving into a group keeps the node visually still", () => {
    const moved = reparent(note, "n-g", { x: 700, y: 300 }, { x: 400, y: 120 });
    expect(moved.parentId).toBe("n-g");
    expect(moved.extent).toBeUndefined();   // spike finding 3: extent "parent" clamps and traps the node
    expect(moved.position).toEqual({ x: 300, y: 180 });
  });
  it("moving out of a group restores absolute coordinates", () => {
    const inside: BoardNode = { ...note, parentId: "n-g", extent: "parent", position: { x: 300, y: 180 } };
    const out = reparent(inside, null, { x: 700, y: 300 }, null);
    expect(out.parentId).toBeUndefined();
    expect(out.extent).toBeUndefined();
    expect(out.position).toEqual({ x: 700, y: 300 });
  });
  it("a node re-parented on drop is no longer dragging, into a group or out of one", () => {
    // onNodeDragStop builds the replacement from nodes that predate React Flow's final dragging:false
    // change, so a stale dragging:true would otherwise stick to the node (final review, finding 3).
    const held = { ...note, dragging: true } as BoardNode;
    expect(reparent(held, "n-g", { x: 700, y: 300 }, { x: 400, y: 120 }).dragging).toBeUndefined();
    expect(reparent({ ...held, parentId: "n-g" }, null, { x: 700, y: 300 }, null).dragging).toBeUndefined();
  });
  it("fitsInside needs the whole box inside, edges inclusive", () => {
    const group = { x: 100, y: 100, width: 480, height: 480 };
    expect(fitsInside({ x: 100, y: 100, width: 480, height: 480 }, group)).toBe(true);
    expect(fitsInside({ x: 150, y: 150, width: 120, height: 40 }, group)).toBe(true);
    expect(fitsInside({ x: 500, y: 150, width: 120, height: 40 }, group)).toBe(false);   // overhangs the right edge
  });
  it("isDescendant walks the parent chain, so a group cannot be dropped into its own child", () => {
    const g = (id: string, parentId?: string): BoardNode => ({ id, type: "group", position: { x: 0, y: 0 }, parentId, data: { tags: [], name: null } });
    const nodes = [g("n-a"), g("n-b", "n-a"), g("n-c", "n-b")];
    expect(isDescendant(nodes, "n-c", "n-a")).toBe(true);
    expect(isDescendant(nodes, "n-a", "n-c")).toBe(false);
    expect(isDescendant(nodes, "n-b", "n-b")).toBe(false);
  });
});

describe("absoluteIn", () => {
  it("adds every ancestor's position", () => {
    const nodes = [
      { id: "n-g", type: "group", position: { x: 100, y: 100 }, data: { tags: [] } },
      { id: "n-h", type: "group", position: { x: 10, y: 20 }, parentId: "n-g", data: { tags: [] } },
      { id: "n-c", type: "note", position: { x: 5, y: 7 }, parentId: "n-h", data: { tags: [], collapsed: false, note: "notes/n-c.md", origin: "reader" } },
    ] as BoardNode[];
    expect(absoluteIn(nodes)("n-c")).toEqual({ x: 115, y: 127 });
    expect(absoluteIn(nodes)("n-missing")).toEqual({ x: 0, y: 0 });
  });
});
