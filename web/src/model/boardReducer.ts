import { applyNodeChanges, type NodeChange } from "@xyflow/react";
import { planDelete } from "./dissolve";
import { begin, emptyHistory, patchNodes, record, redo, snapshot, undo, type History } from "./history";
import { isNewConnection } from "./links";
import { absoluteIn } from "./reparent";
import { emptyBoard, type Board, type BoardEdge, type BoardNode, type ChunkNode, type Highlight } from "./types";

/** `revision` counts the reader's saveable changes. It never resets, so a "saved" can tell whether the
 *  snapshot it saved is still the latest one. */
export type BoardState = { board: Board; dirty: boolean; revision: number; history: History };
export const initialBoardState: BoardState = { board: emptyBoard(""), dirty: false, revision: 0, history: emptyHistory };

export type TagTarget = "node" | "highlight" | "edge";
export type Removal = { nodeIds?: string[]; edgeIds?: string[]; highlightIds?: string[] };
export type FigureClip = { id: string; clip: string; clip_size: { width: number; height: number } };
/** Split here, Cut out and Join (addendum 4.10): `keep` replaces the chunk with its id, `add` goes in just after it,
 *  `removeIds` go, and their edges move to `keep`. */
export type Reshape = { keep: ChunkNode; add?: ChunkNode[]; removeIds?: string[] };

/** What the reader made or changed: one undo step each, unless `merge` joins it to the gesture in progress. */
type EditAction =
  | { type: "add"; nodes?: BoardNode[]; edges?: BoardEdge[]; highlights?: Highlight[] }
  | { type: "addNode"; node: BoardNode }
  | { type: "addHighlight"; highlight: Highlight }
  | { type: "replaceNode"; node: BoardNode; merge?: boolean }
  | { type: "upsertNodes"; nodes: BoardNode[]; merge?: boolean }
  | ({ type: "remove" } & Removal)
  | { type: "removeNode"; id: string }
  | { type: "setTags"; target: TagTarget; id: string; tags: string[] }
  | { type: "setNodeTags"; tags: Record<string, string[]> }
  | ({ type: "reshape" } & Reshape);

export type BoardAction =
  | EditAction
  | { type: "load"; board: Board }
  | { type: "saved"; version: number; revision?: number }
  | { type: "nodes"; changes: NodeChange<BoardNode>[] }
  | ({ type: "setFigureClip" } & FigureClip)
  | { type: "setGoal"; goal: string }
  | { type: "undo" }
  | { type: "redo" };

const DIRTYING_NODE_CHANGES = new Set(["position", "remove", "add", "replace"]);

/** React Flow (12.11) emits "dimensions" three ways; only the end of a resize and an expanding parent save. */
function isSavedDimensionsChange(c: NodeChange<BoardNode>): boolean {
  if (c.type !== "dimensions") return false;
  if (c.resizing === false) return true;
  return Boolean(c.setAttributes) && c.resizing !== true;
}

function dirtiesNodes(c: NodeChange<BoardNode>): boolean {
  if (c.type === "dimensions") return isSavedDimensionsChange(c);
  return DIRTYING_NODE_CHANGES.has(c.type) && !("dragging" in c && c.dragging);
}

/** A frame of a drag or a resize: the gesture is in progress and is recorded when it ends. */
function isGestureStep(c: NodeChange<BoardNode>): boolean {
  return (c.type === "position" && c.dragging === true) || (c.type === "dimensions" && c.resizing === true);
}

/** Once the reader resizes a piece it keeps that size (addendum 4.2, 4.1): chunks, figures and notes. */
function markUserSized(nodes: BoardNode[], changes: NodeChange<BoardNode>[]): BoardNode[] {
  const resized = new Set(changes.filter((c) => c.type === "dimensions" && c.resizing !== undefined).map((c) => (c as { id: string }).id));
  if (!resized.size) return nodes;
  return nodes.map((n) => (n.type !== "group" && resized.has(n.id) && !n.data.user_sized ? ({ ...n, data: { ...n.data, user_sized: true } } as BoardNode) : n));
}

function next(state: BoardState, board: Board): BoardState {
  return { ...state, board, dirty: true, revision: state.revision + 1 };
}

/** Edges with an end on a node React Flow removed go with it (addendum 4.7), whatever path the delete took. */
function dropEdgesOfRemoved(board: Board, changes: NodeChange<BoardNode>[]): Board {
  const removed = new Set(changes.flatMap((c) => (c.type === "remove" ? [c.id] : [])));
  if (!removed.size) return board;
  return { ...board, edges: board.edges.filter((e) => !removed.has(e.from) && !removed.has(e.to)) };
}

/** A gesture frame (a drag, or a resize, which from the left or top edge also moves the node) starts a pending
 *  step and saves nothing; the frame that ends the gesture saves and records it as one step. */
function applyNodes(state: BoardState, changes: NodeChange<BoardNode>[]): BoardState {
  const nodes = markUserSized(applyNodeChanges(changes, state.board.nodes) as BoardNode[], changes);
  const board = dropEdgesOfRemoved({ ...state.board, nodes }, changes);
  if (changes.some(isGestureStep)) return { ...state, board, history: begin(state.history, snapshot(state.board)) };
  if (!changes.some(dirtiesNodes)) return { ...state, board };
  return { ...next(state, board), history: record(state.history, state.history.pending ?? snapshot(state.board)) };
}

function addThings(board: Board, { nodes = [], edges = [], highlights = [] }: { nodes?: BoardNode[]; edges?: BoardEdge[]; highlights?: Highlight[] }): Board {
  const fresh: BoardEdge[] = [];
  for (const edge of edges) if (isNewConnection([...board.edges, ...fresh], edge)) fresh.push(edge);
  if (!nodes.length && !fresh.length && !highlights.length) return board;
  return { ...board, nodes: [...board.nodes, ...nodes], edges: [...board.edges, ...fresh], highlights: [...board.highlights, ...highlights] };
}

function upsert(board: Board, nodes: BoardNode[], appendMissing: boolean): Board {
  const present = new Set(board.nodes.map((n) => n.id));
  const added = appendMissing ? nodes.filter((n) => !present.has(n.id)) : [];
  if (!nodes.some((n) => present.has(n.id)) && !added.length) return board;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return { ...board, nodes: [...board.nodes.map((n) => byId.get(n.id) ?? n), ...added] };
}

/** Delete (addendum 4.7): a group dissolves in place (4.2); edges with an end on a removed node or highlight go;
 *  a chunk's removal never removes a highlight. */
function removeThings(board: Board, { nodeIds = [], edgeIds = [], highlightIds = [] }: Removal): Board {
  // planDelete removes the nodes marked selected: here, exactly the ones asked for.
  const chosen = board.nodes.filter((n) => nodeIds.includes(n.id)).map((n) => ({ ...n, selected: true }) as BoardNode);
  const plan = planDelete(board.nodes, chosen, [], absoluteIn(board.nodes));
  const removed = new Set(plan.nodes.map((n) => n.id));
  const gone = new Set([...removed, ...highlightIds]);
  const edges = board.edges.filter((e) => !edgeIds.includes(e.id) && !gone.has(e.from) && !gone.has(e.to));
  const highlights = board.highlights.filter((h) => !highlightIds.includes(h.id));
  if (!removed.size && edges.length === board.edges.length && highlights.length === board.highlights.length) return board;
  const lifted = new Map(plan.lifted.map((n) => [n.id, n]));
  return { ...board, nodes: board.nodes.filter((n) => !removed.has(n.id)).map((n) => lifted.get(n.id) ?? n), edges, highlights };
}

/** One undo step for Split here, Cut out or Join. An edge end on a removed chunk moves to `keep`; a line that would
 *  then join `keep` to itself, or repeat a connection, is dropped (isNewConnection). Nothing happens if `keep` is gone. */
function reshape(board: Board, { keep, add = [], removeIds = [] }: Reshape): Board {
  if (!board.nodes.some((n) => n.id === keep.id)) return board;
  const removed = new Set(removeIds.filter((id) => id !== keep.id));
  const nodes = board.nodes.flatMap((n) => (n.id === keep.id ? [keep, ...add] : removed.has(n.id) ? [] : [n]));
  const moved = (id: string) => (removed.has(id) ? keep.id : id);
  const edges: BoardEdge[] = [];
  for (const e of board.edges) {
    const edge = removed.has(e.from) || removed.has(e.to) ? { ...e, from: moved(e.from), to: moved(e.to) } : e;
    if (isNewConnection(edges, edge)) edges.push(edge);
  }
  return { ...board, nodes, edges };
}

function setTags(board: Board, target: TagTarget, id: string, tags: string[]): Board {
  if (target === "node") return { ...board, nodes: board.nodes.map((n) => (n.id === id ? ({ ...n, data: { ...n.data, tags } } as BoardNode) : n)) };
  if (target === "highlight") return { ...board, highlights: board.highlights.map((h) => (h.id === id ? { ...h, tags } : h)) };
  return { ...board, edges: board.edges.map((e) => (e.id === id ? { ...e, data: { ...e.data, tags } } : e)) };
}

/** Several nodes retagged at once (● on a multi-selection): one undo step. */
function setNodeTags(board: Board, tags: Record<string, string[]>): Board {
  return { ...board, nodes: board.nodes.map((n) => (n.id in tags ? ({ ...n, data: { ...n.data, tags: tags[n.id] } } as BoardNode) : n)) };
}

function applyEdit(board: Board, action: EditAction): Board {
  switch (action.type) {
    case "add": return addThings(board, action);
    case "addNode": return addThings(board, { nodes: [action.node] });
    case "addHighlight": return addThings(board, { highlights: [action.highlight] });
    case "replaceNode": return upsert(board, [action.node], false);
    case "upsertNodes": return upsert(board, action.nodes, true);
    case "remove": return removeThings(board, action);
    case "removeNode": return removeThings(board, { nodeIds: [action.id] });
    case "setTags": return setTags(board, action.target, action.id, action.tags);
    case "setNodeTags": return setNodeTags(board, action.tags);
    case "reshape": return reshape(board, action);
  }
}

function edit(state: BoardState, action: EditAction): BoardState {
  const board = applyEdit(state.board, action);
  if (board === state.board) return state;
  const merge = "merge" in action && action.merge === true;
  return { ...next(state, board), history: merge ? state.history : record(state.history, snapshot(state.board)) };
}

function travel(state: BoardState, direction: "undo" | "redo"): BoardState {
  const step = (direction === "undo" ? undo : redo)(state.history, snapshot(state.board));
  if (!step) return state;
  return { ...next(state, { ...state.board, ...step.restore }), history: step.history };
}

/** Saved on the usual debounce, never an undo step: the goal's text. (View state is not the board's: see paperView.) */
function unrecorded(state: BoardState, patch: Partial<Board>): BoardState {
  return next(state, { ...state.board, ...patch });
}

function figureClip(state: BoardState, { id, clip, clip_size }: FigureClip): BoardState {
  const patch = (n: BoardNode): BoardNode => (n.id === id && n.type === "figure" ? { ...n, data: { ...n.data, clip, clip_size } } : n);
  const history = patchNodes(state.history, patch);
  if (!state.board.nodes.some((n) => n.id === id)) return { ...state, history };
  return { ...next(state, { ...state.board, nodes: state.board.nodes.map(patch) }), history };
}

export function boardReducer(state: BoardState, action: BoardAction): BoardState {
  const { board } = state;
  switch (action.type) {
    case "load":
      return { board: action.board, dirty: false, revision: state.revision, history: emptyHistory };
    case "saved": {
      // A save without a revision (or of the latest revision) settles the board; an older one does not.
      const current = action.revision === undefined || action.revision === state.revision;
      return { ...state, board: { ...board, version: action.version }, dirty: state.dirty && !current };
    }
    case "nodes": return applyNodes(state, action.changes);
    case "setFigureClip": return figureClip(state, action);
    case "setGoal": return unrecorded(state, { goal: action.goal });
    case "undo":
    case "redo": return travel(state, action.type);
    default: return edit(state, action);
  }
}
