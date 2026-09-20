import { applyEdgeChanges, applyNodeChanges, type EdgeChange, type NodeChange } from "@xyflow/react";
import { emptyBoard, type Board, type BoardEdge, type BoardNode, type Highlight, type Viewport } from "./types";

/** `revision` counts the reader's saveable changes. It never resets, so a "saved" can tell whether the
 *  snapshot it saved is still the latest one. */
export type BoardState = { board: Board; dirty: boolean; revision: number };
export const initialBoardState: BoardState = { board: emptyBoard(""), dirty: false, revision: 0 };

export type BoardAction =
  | { type: "load"; board: Board }
  | { type: "nodes"; changes: NodeChange<BoardNode>[] }
  | { type: "edges"; changes: EdgeChange<BoardEdge>[] }
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
      const nodes = applyNodeChanges(action.changes, board.nodes) as BoardNode[];
      return next(state, { ...board, nodes }, action.changes.some(dirtiesNodes));
    }
    case "edges": {
      const edges = applyEdgeChanges(action.changes, board.edges) as BoardEdge[];
      return next(state, { ...board, edges }, action.changes.some((c) => c.type !== "select"));
    }
    case "addHighlight":
      return next(state, { ...board, highlights: [...board.highlights, action.highlight] }, true);
    case "addNode":
      return next(state, { ...board, nodes: [...board.nodes, action.node] }, true);
    case "replaceNode":
      return next(state, { ...board, nodes: board.nodes.map((n) => (n.id === action.node.id ? action.node : n)) }, true);
    case "removeNode":
      return next(state, {
        ...board,
        nodes: board.nodes.filter((n) => n.id !== action.id && n.parentId !== action.id),
        edges: board.edges.filter((e) => e.source !== action.id && e.target !== action.id),
      }, true);
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
