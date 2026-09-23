import type { Board, BoardEdge, BoardNode } from "./types";

export const PERSISTED_NODE_FIELDS = ["id", "type", "position", "data", "parentId", "extent", "width", "height", "initialWidth", "initialHeight", "hidden", "zIndex"] as const;
// Schema 2 stores an edge by what it connects (addendum 4.0); React Flow's source/target are computed at render.
export const PERSISTED_EDGE_FIELDS = ["id", "from", "to", "data"] as const;

function pick<T extends object>(obj: T, fields: readonly string[]): T {
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    const value = (obj as Record<string, unknown>)[field];
    if (value !== undefined) out[field] = value;
  }
  return out as T;
}

/** Parents first, otherwise the original order. React Flow warns and misrenders a child listed before its parent. */
export function parentsFirst(nodes: BoardNode[]): BoardNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const placed = new Set<string>();
  const out: BoardNode[] = [];
  const place = (node: BoardNode) => {
    if (placed.has(node.id)) return;
    if (node.parentId && byId.has(node.parentId)) place(byId.get(node.parentId)!);
    placed.add(node.id);
    out.push(node);
  };
  nodes.forEach(place);
  return out;
}

/** The only path to a board the server will accept. Never use React Flow's toObject(). */
export function toBoardJson(board: Board): Board {
  const nodes = parentsFirst(board.nodes).map((n) => pick(n, PERSISTED_NODE_FIELDS));
  const edges = board.edges.map((e) => pick(e, PERSISTED_EDGE_FIELDS)) as BoardEdge[];
  return JSON.parse(JSON.stringify({ ...board, nodes, edges }));
}
