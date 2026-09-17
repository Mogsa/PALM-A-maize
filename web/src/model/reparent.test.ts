import { describe, expect, it } from "vitest";
import { fitsInside, isDescendant, reparent, toAbsolute, toRelative } from "./reparent";
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
