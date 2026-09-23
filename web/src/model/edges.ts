import type { Edge } from "@xyflow/react";
import { lineIn } from "./geometry";
import type { Board, BoardEdge, ChunkNode, Highlight } from "./types";

/** A React Flow edge drawn for a stored connection; `id` and `data` are the stored edge's. */
export type FlowEdge = Edge<{ tags: string[] }>;
/** The plan's name for what `resolveEdges` returns. A node end's handle is undefined (no handle). */
export type ResolvedEdge = FlowEdge;

type End = { node: string; handle?: string };

/** Where one end of a connection is drawn (addendum 4.0): a node id is that node, with no handle; a
 *  highlight id is the first chunk in `nodes` order that contains one of its line rects, with the
 *  highlight id as the handle. `null` when there is no such node or chunk. */
function endOf(id: string, nodeIds: Set<string>, highlights: Map<string, Highlight>, chunks: ChunkNode[]): End | null {
  if (nodeIds.has(id)) return { node: id };
  const highlight = highlights.get(id);
  if (!highlight) return null;
  const holder = chunks.find((c) => highlight.anchor.rects.some((line) => lineIn(line, c.data.region)));
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
  const chunks = board.nodes.filter((n): n is ChunkNode => n.type === "chunk");
  const out: FlowEdge[] = [];
  for (const edge of board.edges) {
    const from = endOf(edge.from, nodeIds, highlights, chunks);
    const to = endOf(edge.to, nodeIds, highlights, chunks);
    if (!from || !to) continue;
    out.push(to.handle && !from.handle ? toFlow(edge, to, from) : toFlow(edge, from, to));
  }
  return out;
}
