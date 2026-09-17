import type { BoardNode } from "./types";

export type XY = { x: number; y: number };

export const toRelative = (absolute: XY, parentAbsolute: XY): XY => ({ x: absolute.x - parentAbsolute.x, y: absolute.y - parentAbsolute.y });
export const toAbsolute = (relative: XY, parentAbsolute: XY): XY => ({ x: relative.x + parentAbsolute.x, y: relative.y + parentAbsolute.y });

export type Box = { x: number; y: number; width: number; height: number };

/** Change a node's parent without moving it on screen. React Flow does not convert for you (addendum 4.2).
 *  Never sets `extent: "parent"`: the spike measured that it clamps a node the moment it is re-parented
 *  and stops it from ever being dragged back out (findings, section 2). */
export function reparent(node: BoardNode, newParentId: string | null, nodeAbsolute: XY, parentAbsolute: XY | null): BoardNode {
  const { parentId: _p, extent: _e, ...rest } = node;
  if (newParentId === null || parentAbsolute === null) {
    return { ...rest, position: { ...nodeAbsolute } } as BoardNode;
  }
  return { ...rest, parentId: newParentId, position: toRelative(nodeAbsolute, parentAbsolute) } as BoardNode;
}

export function fitsInside(child: Box, parent: Box): boolean {
  return child.x >= parent.x && child.y >= parent.y
    && child.x + child.width <= parent.x + parent.width && child.y + child.height <= parent.y + parent.height;
}

/** True if `candidateId` sits somewhere inside `ancestorId`'s subtree. */
export function isDescendant(nodes: BoardNode[], candidateId: string, ancestorId: string): boolean {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  let parent = byId.get(candidateId)?.parentId;
  while (parent) {
    if (parent === ancestorId) return true;
    parent = byId.get(parent)?.parentId;
  }
  return false;
}
