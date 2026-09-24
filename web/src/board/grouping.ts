import { newId } from "../model/ids";
import { isDescendant, reparent, type Box } from "../model/reparent";
import type { BoardNode, GroupNode } from "../model/types";

/** Room around a new group's contents on every side, and above them for its name (addendum 4.10). */
export const GROUP_PAD = 24;
export const GROUP_HEAD = 36;

/** Group, as one gesture: a new unnamed group just big enough for the chosen nodes, which are re-parented into it
 *  without moving on screen (addendum 4.2). A chosen node inside another chosen node moves with it. When every one
 *  has the same parent, the group is made inside that parent. `boxOf` gives absolute boxes, as React Flow measures
 *  them. Returns the group first, then the re-parented nodes: one upsertNodes, one undo step. */
export function groupAround(nodes: BoardNode[], ids: string[], boxOf: (id: string) => Box): BoardNode[] {
  const chosen = nodes.filter((n) => ids.includes(n.id) && !ids.some((other) => other !== n.id && isDescendant(nodes, n.id, other)));
  if (chosen.length < 2) return [];
  const boxes = chosen.map((n) => boxOf(n.id));
  const x = Math.min(...boxes.map((b) => b.x)) - GROUP_PAD;
  const y = Math.min(...boxes.map((b) => b.y)) - GROUP_PAD - GROUP_HEAD;
  const width = Math.max(...boxes.map((b) => b.x + b.width)) + GROUP_PAD - x;
  const height = Math.max(...boxes.map((b) => b.y + b.height)) + GROUP_PAD - y;
  const parents = new Set(chosen.map((n) => n.parentId ?? null));
  const parentId = parents.size === 1 ? [...parents][0] : null;
  const parentAt = parentId ? boxOf(parentId) : { x: 0, y: 0 };
  const group: GroupNode = {
    id: newId("n"), type: "group", position: { x: x - parentAt.x, y: y - parentAt.y }, width, height,
    ...(parentId ? { parentId } : {}), data: { tags: [], name: null },
  };
  return [group, ...chosen.map((n, i) => reparent(n, group.id, { x: boxes[i].x, y: boxes[i].y }, { x, y }))];
}
