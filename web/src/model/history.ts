import type { Board, BoardEdge, BoardNode, Highlight } from "./types";

/** Addendum 4.7: 100 steps, the oldest drops. */
export const UNDO_LIMIT = 100;

/** The board without its view state and without note text: what one undo step restores. */
export type Snapshot = { nodes: BoardNode[]; edges: BoardEdge[]; highlights: Highlight[] };
/** `pending` is the board before a drag or resize began; it becomes a step when the gesture ends. */
export type History = { past: Snapshot[]; future: Snapshot[]; pending: Snapshot | null };

export const emptyHistory: History = { past: [], future: [], pending: null };

export const snapshot = (board: Board): Snapshot => ({ nodes: board.nodes, edges: board.edges, highlights: board.highlights });

export function record(history: History, before: Snapshot): History {
  return { past: [...history.past, before].slice(-UNDO_LIMIT), future: [], pending: null };
}

export function begin(history: History, before: Snapshot): History {
  return history.pending ? history : { ...history, pending: before };
}

type Step = { history: History; restore: Snapshot };

export function undo(history: History, current: Snapshot): Step | null {
  const restore = history.past.at(-1);
  if (!restore) return null;
  return { history: { past: history.past.slice(0, -1), future: [current, ...history.future], pending: null }, restore };
}

export function redo(history: History, current: Snapshot): Step | null {
  const restore = history.future[0];
  if (!restore) return null;
  return { history: { past: [...history.past, current].slice(-UNDO_LIMIT), future: history.future.slice(1), pending: null }, restore };
}

/** Apply a change that is outside undo, such as a figure's clip landing, to every snapshot too. */
export function patchNodes(history: History, patch: (node: BoardNode) => BoardNode): History {
  const apply = (s: Snapshot): Snapshot => ({ ...s, nodes: s.nodes.map(patch) });
  return { past: history.past.map(apply), future: history.future.map(apply), pending: history.pending && apply(history.pending) };
}
