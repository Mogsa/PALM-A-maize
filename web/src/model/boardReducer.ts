import { applyNodeChanges, type EdgeChange, type NodeChange } from "@xyflow/react";
import { planDelete } from "./dissolve";
import type { FlowEdge } from "./edges";
import type { XY } from "./reparent";
import { emptyBoard, type Board, type BoardEdge, type BoardNode, type Highlight, type Viewport } from "./types";

/** `revision` counts the reader's saveable changes. It never resets, so a "saved" can tell whether the
 *  snapshot it saved is still the latest one. */
export type BoardState = { board: Board; dirty: boolean; revision: number };
export const initialBoardState: BoardState = { board: emptyBoard(""), dirty: false, revision: 0 };

export type BoardAction =
  | { type: "load"; board: Board }
  | { type: "nodes"; changes: NodeChange<BoardNode>[] }
  | { type: "edges"; changes: EdgeChange<FlowEdge>[] }
  | { type: "addHighlight"; highlight: Highlight }
  | { type: "addNode"; node: BoardNode }
  | { type: "replaceNode"; node: BoardNode }
  | { type: "removeNode"; id: string }
  | { type: "viewport"; viewport: Viewport }
  | { type: "saved"; version: number; revision?: number };

/** Selection changes are runtime-only; everything else the reader did must be saved. */
const DIRTYING_NODE_CHANGES = new Set(["position", "remove", "add", "replace"]);

/** React Flow (12.11) emits "dimensions" three ways. Measuring a node: no setAttributes, no resizing;
 *  it only sets `measured`, so it must not save. NodeResizer mid-drag: resizing true, setAttributes set;
 *  the resize path, like the drag path, does not save. NodeResizer's end: resizing false and no
 *  setAttributes; width and height were already written mid-drag, so this is the moment to save.
 *  Expanding a parent: setAttributes true, no resizing; a real size change. */
function isSavedDimensionsChange(c: NodeChange<BoardNode>): boolean {
  if (c.type !== "dimensions") return false;
  if (c.resizing === false) return true;
  return Boolean(c.setAttributes) && c.resizing !== true;
}

function dirtiesNodes(c: NodeChange<BoardNode>): boolean {
  if (c.type === "dimensions") return isSavedDimensionsChange(c);
  return DIRTYING_NODE_CHANGES.has(c.type) && !("dragging" in c && c.dragging);
}

/** Once the reader resizes a chunk it keeps that size (addendum 4.2). Only NodeResizer's changes carry
 *  `resizing`; a measurement or an expanding parent does not. Notes and figures have no `user_sized`. */
function markUserSized(nodes: BoardNode[], changes: NodeChange<BoardNode>[]): BoardNode[] {
  const resized = new Set(changes.filter((c) => c.type === "dimensions" && c.resizing !== undefined).map((c) => (c as { id: string }).id));
  if (!resized.size) return nodes;
  return nodes.map((n) => (n.type === "chunk" && resized.has(n.id) && !n.data.user_sized ? { ...n, data: { ...n.data, user_sized: true } } : n));
}

/** A node's absolute position from the stored ones: its own plus every ancestor's. */
function absoluteIn(nodes: BoardNode[]): (id: string) => XY {
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

/** React Flow's edge changes carry the stored edge's id (model/edges.ts), so they apply to the stored
 *  edges by id: `select` sets the runtime flag, `remove` drops the edge. React Flow emits no `add` or
 *  `replace` here, because the board draws no new connections yet. */
function applyEdgeChangesById(changes: EdgeChange<FlowEdge>[], edges: BoardEdge[]): BoardEdge[] {
  let out = edges;
  for (const change of changes) {
    if (change.type === "select") out = out.map((e) => (e.id === change.id ? { ...e, selected: change.selected } : e));
    else if (change.type === "remove") out = out.filter((e) => e.id !== change.id);
  }
  return out;
}

/** Remove one node as the delete key would (planDelete): its direct children are lifted in place, and
 *  every edge with an end on it goes, so the next save is valid. Highlights stay: they are the paper's. */
function removeNode(board: Board, id: string): Board {
  const target = board.nodes.find((n) => n.id === id);
  if (!target) return board;
  const touching = board.edges.filter((e) => e.from === id || e.to === id);
  const plan = planDelete(board.nodes, [target], touching, absoluteIn(board.nodes));
  const removed = new Set(plan.nodes.map((n) => n.id));
  const droppedEdges = new Set(plan.edges.map((e) => e.id));
  const lifted = new Map(plan.lifted.map((n) => [n.id, n]));
  return {
    ...board,
    nodes: board.nodes.filter((n) => !removed.has(n.id)).map((n) => lifted.get(n.id) ?? n),
    edges: board.edges.filter((e) => !droppedEdges.has(e.id)),
  };
}

/** The next state after an action; a saveable change marks it dirty and bumps the revision. */
function next(state: BoardState, board: Board, saveable: boolean): BoardState {
  if (!saveable) return { ...state, board };
  return { board, dirty: true, revision: state.revision + 1 };
}

export function boardReducer(state: BoardState, action: BoardAction): BoardState {
  const { board } = state;
  switch (action.type) {
    case "load":
      return { board: action.board, dirty: false, revision: state.revision };
    case "nodes": {
      const nodes = markUserSized(applyNodeChanges(action.changes, board.nodes) as BoardNode[], action.changes);
      return next(state, { ...board, nodes }, action.changes.some(dirtiesNodes));
    }
    case "edges": {
      const edges = applyEdgeChangesById(action.changes, board.edges);
      return next(state, { ...board, edges }, action.changes.some((c) => c.type !== "select"));
    }
    case "addHighlight":
      return next(state, { ...board, highlights: [...board.highlights, action.highlight] }, true);
    case "addNode":
      return next(state, { ...board, nodes: [...board.nodes, action.node] }, true);
    case "replaceNode":
      return next(state, { ...board, nodes: board.nodes.map((n) => (n.id === action.node.id ? action.node : n)) }, true);
    case "removeNode":
      return next(state, removeNode(board, action.id), true);
    case "viewport":
      if (board.viewport.x === action.viewport.x && board.viewport.y === action.viewport.y
          && board.viewport.zoom === action.viewport.zoom) return state;
      return next(state, { ...board, viewport: action.viewport }, true);
    case "saved": {
      // A save without a revision (or of the latest revision) settles the board; an older one does not.
      const current = action.revision === undefined || action.revision === state.revision;
      return { ...state, board: { ...board, version: action.version }, dirty: state.dirty && !current };
    }
  }
}
