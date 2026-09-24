import { newId } from "./ids";
import type { Board, BoardEdge, NoteNode } from "./types";

/** The ids at the other end of every edge touching `id`. Edges carry no direction (addendum 4.0). */
export function neighbours(edges: BoardEdge[], id: string): string[] {
  return edges.flatMap((e) => (e.from === id ? [e.to] : e.to === id ? [e.from] : []));
}

/** Note nodes connected to any of `ids`, each once, in nodes order. Nothing caches this (D7). */
export function notesConnectedTo(board: Board, ids: string[]): NoteNode[] {
  const linked = new Set(ids.flatMap((id) => neighbours(board.edges, id)));
  return board.nodes.filter((n): n is NoteNode => n.type === "note" && linked.has(n.id));
}

/** Not a line to itself, and not a second line between the same two things. */
export function isNewConnection(edges: BoardEdge[], edge: BoardEdge): boolean {
  if (edge.from === edge.to) return false;
  return !edges.some((e) => (e.from === edge.from && e.to === edge.to) || (e.from === edge.to && e.to === edge.from));
}

export function newEdge(from: string, to: string): BoardEdge {
  return { id: newId("e"), from, to, data: { tags: [] } };
}
