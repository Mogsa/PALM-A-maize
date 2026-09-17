import { reparent, type XY } from "./reparent";
import type { BoardEdge, BoardNode } from "./types";

export type DeletePlan = { nodes: BoardNode[]; edges: BoardEdge[]; lifted: BoardNode[] };

/** What a delete really removes. React Flow hands over the chosen nodes plus all their descendants and
 *  every edge touching any of them; dissolving a group must leave its pieces (addendum 4.2).
 *  Removed: the nodes the reader chose (selected, or not inside another node being deleted) and edges
 *  that were selected or touch a removed node. Every other descendant survives as it is, except the direct
 *  children of a removed node: they move to their nearest surviving ancestor (or the root) without moving
 *  on screen. `absolute` gives a node's absolute position as currently drawn. */
export function planDelete(nodes: BoardNode[], toDelete: BoardNode[], edgesToDelete: BoardEdge[], absolute: (id: string) => XY): DeletePlan {
  const offered = new Set(toDelete.map((n) => n.id));
  const removed = toDelete.filter((n) => n.selected || !n.parentId || !offered.has(n.parentId));
  const removedIds = new Set(removed.map((n) => n.id));
  const byId = new Map(nodes.map((n) => [n.id, n]));

  const survivingAncestor = (id: string | undefined): string | null => {
    while (id && removedIds.has(id)) id = byId.get(id)?.parentId;
    return id ?? null;
  };

  const lifted = nodes
    .filter((n) => !removedIds.has(n.id) && n.parentId && removedIds.has(n.parentId))
    .map((n) => {
      const parent = survivingAncestor(n.parentId);
      return reparent(n, parent, absolute(n.id), parent ? absolute(parent) : null);
    });

  const edges = edgesToDelete.filter((e) => e.selected || removedIds.has(e.source) || removedIds.has(e.target));
  return { nodes: removed, edges, lifted };
}
