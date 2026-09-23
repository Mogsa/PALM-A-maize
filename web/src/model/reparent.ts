import type { BoardNode } from "./types";

export type XY = { x: number; y: number };

export const toRelative = (absolute: XY, parentAbsolute: XY): XY => ({ x: absolute.x - parentAbsolute.x, y: absolute.y - parentAbsolute.y });
export const toAbsolute = (relative: XY, parentAbsolute: XY): XY => ({ x: relative.x + parentAbsolute.x, y: relative.y + parentAbsolute.y });

export type Box = { x: number; y: number; width: number; height: number };

/** Change a node's parent without moving it on screen. React Flow does not convert for you (addendum 4.2).
 *  Never sets `extent: "parent"`: the spike measured that it clamps a node the moment it is re-parented
 *  and stops it from ever being dragged back out (findings, section 2). Also drops `dragging`: a node is
 *  re-parented on drop, and the node handed in predates React Flow's final dragging:false change. */
export function reparent(node: BoardNode, newParentId: string | null, nodeAbsolute: XY, parentAbsolute: XY | null): BoardNode {
  const { parentId: _p, extent: _e, dragging: _d, ...rest } = node;
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

/** A node's absolute position from the stored ones: its own plus every ancestor's. */
export function absoluteIn(nodes: BoardNode[]): (id: string) => XY {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return (id) => {
    let x = 0, y = 0;
    for (let node = byId.get(id); node; node = node.parentId ? byId.get(node.parentId) : undefined) {
      x += node.position.x;
      y += node.position.y;
    }
    return { x, y };
  };
}
