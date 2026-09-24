import type { Edge } from "@xyflow/react";
import { lineIn } from "./geometry";
import type { Board, BoardEdge, BoardNode, ChunkNode, Highlight } from "./types";

/** A React Flow edge drawn for a stored connection; `id` and `data` are the stored edge's. */
export type FlowEdge = Edge<{ tags: string[] }>;
/** The plan's name for what `resolveEdges` returns. A node end's handle is undefined (no handle). */
export type ResolvedEdge = FlowEdge;

type End = { node: string; handle?: string };
type Holder = (highlight: Highlight) => ChunkNode | undefined;

const regionArea = (chunk: ChunkNode) =>
  chunk.data.region.rects.reduce((sum, { rect: [x0, y0, x1, y1] }) => sum + (x1 - x0) * (y1 - y0), 0);

/** True for a node inside the tray group, at any depth. */
function inTrayOf(nodes: BoardNode[]): (node: BoardNode) => boolean {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return (node) => {
    const seen = new Set<string>();
    for (let parent = byId.get(node.parentId ?? ""); parent && !seen.has(parent.id); parent = byId.get(parent.parentId ?? "")) {
      if (parent.type === "group" && parent.data.tray) return true;
      seen.add(parent.id);
    }
    return false;
  };
}

/** The chunk that draws a highlight's end (contract 3), among the chunks containing one of its line rects: those
 *  outside the tray if any, else the tray's; of those, the smallest total region area; ties by `nodes` order.
 *  First open puts every line in a tray chunk, so "first in nodes order" alone would always draw from the tray.
 *  The one rule for everything that asks which chunk holds a mark: edges, Tidy, where a note on a mark lands. */
export function chunkHolder(nodes: BoardNode[]): Holder {
  const chunks = nodes.filter((n): n is ChunkNode => n.type === "chunk");
  const inTray = inTrayOf(nodes);
  return (highlight) => {
    const containing = chunks.filter((c) => highlight.anchor.rects.some((line) => lineIn(line, c.data.region)));
    const outside = containing.filter((c) => !inTray(c));
    const pool = outside.length ? outside : containing;
    return pool.reduce<ChunkNode | undefined>((best, c) => (best && regionArea(best) <= regionArea(c) ? best : c), undefined);
  };
}

/** Where one end of a connection is drawn (addendum 4.0): a node id is that node, with no handle; a highlight id is
 *  its holder (chunkHolder), with the highlight id as the handle. `null` when there is no such node or chunk. */
function endOf(id: string, nodeIds: Set<string>, highlights: Map<string, Highlight>, holderOf: Holder): End | null {
  if (nodeIds.has(id)) return { node: id };
  const highlight = highlights.get(id);
  const holder = highlight && holderOf(highlight);
  return holder ? { node: holder.id, handle: id } : null;
}

function toFlow(edge: BoardEdge, source: End, target: End): FlowEdge {
  return { id: edge.id, source: source.node, sourceHandle: source.handle, target: target.node, targetHandle: target.handle,
    data: edge.data, selected: edge.selected };
}

/** The board's stored connections as React Flow edges, computed on every render and never stored.
 *  An edge with an end that resolves to nothing is omitted: that is the normal state of a connection
 *  between marks no chunk holds yet. A highlight's handle is a source handle, and React Flow finds
 *  an edge's source only among source handles, so when just the `to` end is a highlight the edge is
 *  drawn from it; `from` and `to` carry no meaning (addendum 4.0). */
export function resolveEdges(board: Board): FlowEdge[] {
  const nodeIds = new Set(board.nodes.map((n) => n.id));
  const highlights = new Map(board.highlights.map((h) => [h.id, h]));
  const holderOf = chunkHolder(board.nodes);
  const out: FlowEdge[] = [];
  for (const edge of board.edges) {
    const from = endOf(edge.from, nodeIds, highlights, holderOf);
    const to = endOf(edge.to, nodeIds, highlights, holderOf);
    if (!from || !to) continue;
    out.push(to.handle && !from.handle ? toFlow(edge, to, from) : toFlow(edge, from, to));
  }
  return out;
}
