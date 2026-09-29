import { describe, expect, it } from "vitest";
import type { Box } from "../model/reparent";
import type { BoardNode } from "../model/types";
import { GROUP_HEAD, GROUP_PAD, groupAround } from "./grouping";

const note = (id: string, x: number, y: number, parentId?: string): BoardNode =>
  ({ id, type: "note", position: { x, y }, ...(parentId ? { parentId } : {}), data: { tags: [], collapsed: false, note: `notes/${id}.md`, origin: "reader" } });
const slot: BoardNode = { id: "n-s", type: "group", position: { x: 1000, y: 500 }, width: 800, height: 600, data: { tags: [], name: "Main point", prompt: "?" } };
const boxes: Record<string, Box> = {
  "n-a": { x: 100, y: 100, width: 200, height: 80 }, "n-b": { x: 400, y: 300, width: 200, height: 80 },
  "n-s": { x: 1000, y: 500, width: 800, height: 600 }, "n-c": { x: 1100, y: 600, width: 200, height: 80 }, "n-d": { x: 1400, y: 700, width: 200, height: 80 },
};
const boxOf = (id: string) => boxes[id];

describe("groupAround (addendum 4.10)", () => {
  it("makes a group just around the chosen nodes and re-parents them without moving them on screen", () => {
    const [group, a, b] = groupAround([note("n-a", 100, 100), note("n-b", 400, 300)], ["n-a", "n-b"], boxOf);
    expect(group).toMatchObject({ type: "group", position: { x: 100 - GROUP_PAD, y: 100 - GROUP_PAD - GROUP_HEAD },
      width: 500 + 2 * GROUP_PAD, height: 280 + 2 * GROUP_PAD + GROUP_HEAD, data: { name: null } });
    expect(group.parentId).toBeUndefined();
    expect(a).toMatchObject({ parentId: group.id, position: { x: GROUP_PAD, y: GROUP_PAD + GROUP_HEAD } });
    expect(b).toMatchObject({ parentId: group.id, position: { x: 300 + GROUP_PAD, y: 200 + GROUP_PAD + GROUP_HEAD } });
  });
  it("makes the group inside the parent the chosen nodes share", () => {
    const [group, c] = groupAround([slot, note("n-c", 100, 100, "n-s"), note("n-d", 400, 200, "n-s")], ["n-c", "n-d"], boxOf);
    expect(group).toMatchObject({ parentId: "n-s", position: { x: 100 - GROUP_PAD, y: 100 - GROUP_PAD - GROUP_HEAD } });
    expect(c.position).toEqual({ x: GROUP_PAD, y: GROUP_PAD + GROUP_HEAD });
  });
  it("leaves a chosen node inside another chosen node to move with it, and needs two things to group", () => {
    const made = groupAround([slot, note("n-c", 100, 100, "n-s"), note("n-a", 100, 100)], ["n-s", "n-c", "n-a"], boxOf);
    expect(made.map((n) => n.id).slice(1)).toEqual(["n-s", "n-a"]);
    expect(groupAround([note("n-a", 0, 0)], ["n-a"], boxOf)).toEqual([]);
  });
});
