import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background, ConnectionMode, Controls, ReactFlow, ReactFlowProvider, SelectionMode, useReactFlow, useNodesInitialized,
  type EdgeChange, type Node, type OnBeforeDelete, type OnConnect, type OnConnectEnd, type OnNodeDrag,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { api } from "../api/client";
import { hiddenNodeIds } from "../model/filter";
import { newId } from "../model/ids";
import { newEdge } from "../model/links";
import { newNote } from "../model/notes";
import { fitsInside, isDescendant, reparent, type Box } from "../model/reparent";
import { parentsFirst } from "../model/serialize";
import type { BoardNode, ChunkNode as ChunkNodeType, GroupNode as GroupNodeType, PageRect } from "../model/types";
import { Hint } from "../hints/Hint";
import { closeHint } from "../hints/hints";
import { ContextCard } from "../paper/ContextCard";
import { useHoverCard } from "../paper/useHoverCard";
import { useBoard } from "../state/BoardProvider";
import { paperHoldsDelete } from "../state/keys";
import { useTags } from "../state/TagsProvider";
import { BoardActionsProvider } from "./BoardActions";
import { CUT_DRAG_TYPE, isCutDrag, offerCut, takeCut } from "./cutDrag";
import { emptyPaneAt, noteAtDrop, onEmptyBoard } from "./dropNote";
import { clearCardSelection, readCardSelection, textMenuAfterMouseUp, type CardSelection } from "./cardSelection";
import { EdgePopover } from "./EdgePopover";
import { groupAround } from "./grouping";
import { applySelection, endOf, flowEdges, type FlowEdge } from "./handles";
import { ChunkNode } from "./nodes/ChunkNode";
import { FigureNode } from "./nodes/FigureNode";
import { GroupNode } from "./nodes/GroupNode";
import { NoteNode } from "./nodes/NoteNode";
import { pieceIndexOf, placePiece, recutPlan } from "./recut";
import { SelectionBar } from "./SelectionBar";
import { TextPopover } from "./TextPopover";
import { ContextMenu } from "../ui/ContextMenu";
import { useBoardCards } from "./useBoardCards";

const nodeTypes = { chunk: ChunkNode, figure: FigureNode, note: NoteNode, group: GroupNode };

/** `active` is false while the paper view is shown: the board stays mounted but hidden, and must not
 *  take the delete key from the paper. */
type Props = {
  onOpenInPaper: (rect: PageRect) => void; active?: boolean; focusNode?: string | null; onFocusHandled?: () => void;
  /** Counts the New note presses in the top bar: each new count makes a note in the middle of the board. */
  noteRequests?: number;
  onFind?: (text: string) => void;
};

const DELETE_KEYS = ["Backspace", "Delete"];
/** Where a board never moved opens. */
const ORIGIN = { x: 0, y: 0, zoom: 1 };

function Inner({ onOpenInPaper, active = true, focusNode, onFocusHandled, noteRequests = 0, onFind }: Props) {
  const { state, dispatch, source, paperId, view, setView } = useBoard();
  const { byId } = useTags();
  const hover = useHoverCard();
  const cards = useBoardCards(source, paperId, state.board.highlights, hover);
  const { getInternalNode, getNodes, fitView, getZoom, screenToFlowPosition } = useReactFlow<BoardNode>();
  const boardRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const initialized = useNodesInitialized();
  const [selectedEdges, setSelectedEdges] = useState<ReadonlySet<string>>(() => new Set());
  const [edgeMenu, setEdgeMenu] = useState<{ id: string; at: DOMRect } | null>(null);
  const [textMenu, setTextMenu] = useState<(CardSelection & { menuOpen: boolean }) | null>(null);
  const [paneMenu, setPaneMenu] = useState<{ at: DOMRect; flow: { x: number; y: number } } | null>(null);
  // The note being written stays in sight whatever the filter: a new note carries no tag yet (D8).
  const hidden = useMemo(() => {
    const ids = hiddenNodeIds(state.board, view.active_tags);
    if (editing) ids.delete(editing);
    return ids;
  }, [state.board, view.active_tags, editing]);
  useEffect(() => {
    if (!initialized || !focusNode) return;
    void fitView({ nodes: [{ id: focusNode }], minZoom: 0.2, maxZoom: getZoom() });
    onFocusHandled?.();
  }, [initialized, focusNode, fitView, getZoom, onFocusHandled]);

  const box = useCallback((id: string): Box => {
    const internal = getInternalNode(id)!;
    return { ...internal.internals.positionAbsolute, width: internal.measured?.width ?? 0, height: internal.measured?.height ?? 0 };
  }, [getInternalNode]);

  /** On drop, a node belongs to the smallest group that wholly contains it, or to none. This one rule
   *  covers dropping in, dragging out, moving between groups, and nesting groups. Whole containment,
   *  not intersection, because a partial overlap is where the spike saw nodes jump (findings, section 2).
   *  Coordinates converted explicitly (addendum 4.2). The rule applies to every dragged node: React Flow
   *  calls onNodeDragStop for a multi-selection and for a dragged selection box too, with all of them in `nodes`.
   *  The re-parenting joins the drag's undo step. */
  const onNodeDragStop: OnNodeDrag<BoardNode> = useCallback((_, __, draggedNodes) => {
    const moved: BoardNode[] = [];
    for (const dragged of draggedNodes) {
      const me = box(dragged.id);
      const target = state.board.nodes
        .filter((n) => n.type === "group" && n.id !== dragged.id && !isDescendant(state.board.nodes, n.id, dragged.id))
        .map((n) => ({ id: n.id, box: box(n.id) }))
        .filter((g) => fitsInside(me, g.box))
        .sort((a, b) => a.box.width * a.box.height - b.box.width * b.box.height)[0] ?? null;
      if ((target?.id ?? null) === (dragged.parentId ?? null)) continue;
      const stored = state.board.nodes.find((n) => n.id === dragged.id)!;
      moved.push(reparent(stored, target?.id ?? null, { x: me.x, y: me.y }, target ? { x: target.box.x, y: target.box.y } : null));
    }
    if (moved.length) dispatch({ type: "upsertNodes", nodes: moved, merge: true });
  }, [box, dispatch, state.board.nodes]);

  const focusOn = useCallback((id: string) => {
    void fitView({ nodes: [{ id }], minZoom: 0.2, maxZoom: getZoom(), duration: 300 });
    // Only the piece shown is selected, so a Delete next removes that piece and nothing chosen before.
    const others = getNodes().filter((n) => n.selected && n.id !== id).map((n) => ({ type: "select" as const, id: n.id, selected: false }));
    dispatch({ type: "nodes", changes: [...others, { type: "select", id, selected: true }] });
  }, [fitView, getZoom, getNodes, dispatch]);
  const find = useCallback((text: string) => onFind?.(text), [onFind]);
  const actions = useMemo(() => ({ focusNode: focusOn, openInPaper: onOpenInPaper, editing, setEditing, find }), [focusOn, onOpenInPaper, editing, find]);

  const handledNotes = useRef(noteRequests);
  useEffect(() => {
    if (noteRequests === handledNotes.current || !boardRef.current) return;
    handledNotes.current = noteRequests;
    const box = boardRef.current.getBoundingClientRect();
    const note = newNote({ position: screenToFlowPosition({ x: box.left + box.width / 2, y: box.top + box.height / 2 }), origin: "reader" });
    dispatch({ type: "add", nodes: [note] });
    setEditing(note.id);
  }, [noteRequests, screenToFlowPosition, dispatch]);

  /** New group, from the empty board's right-click menu: where the menu was opened. */
  const addGroup = (at: { x: number; y: number }) => {
    const node: GroupNodeType = { id: newId("n"), type: "group", position: at, width: 480, height: 320, data: { tags: [], name: null } };
    dispatch({ type: "addNode", node });
    setPaneMenu(null);
  };

  /** A right-click (or the menu key) on words selected on a card opens the same bar as a plain selection, with its ›
   *  list already shown; on the empty board, New group. Anywhere else the browser keeps its own menu. A menu key
   *  press has no pointer: the board's middle. */
  const openMenu = (event: React.SyntheticEvent, point: { x: number; y: number }, keyboard: boolean) => {
    const words = readCardSelection(boardRef.current!);
    if (words) {
      event.preventDefault();
      setTextMenu({ ...words, at: new DOMRect(point.x, point.y, 0, 0), menuOpen: true });
      return;
    }
    const target = event.target as Element;
    if (keyboard ? target.closest(".react-flow__node") : !target.closest(".react-flow__pane")) return;
    event.preventDefault();
    setPaneMenu({ at: new DOMRect(point.x, point.y, 0, 0), flow: screenToFlowPosition(point) });
  };
  const middle = () => {
    const box = boardRef.current!.getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  };
  const onContextMenu = (event: React.MouseEvent) => {
    const keyboard = event.clientX === 0 && event.clientY === 0;
    openMenu(event, keyboard ? middle() : { x: event.clientX, y: event.clientY }, keyboard);
  };
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) openMenu(event, middle(), true);
  };
  const closePaneMenu = useCallback(() => setPaneMenu(null), []);

  /** Words selected on a card offer colour dots, Cut out, Find and a › list (D20, D21, spec A2). The popover follows
   *  the selection: it closes when the words are no longer selected, and closing it clears them so it does not come back. */
  const onBoardMouseUp = (event: React.MouseEvent) => {
    if (event.button !== 0) return;   // a right-click opens its own menu
    const next = textMenuAfterMouseUp(boardRef.current!, event.target);
    if (next !== undefined) setTextMenu(next && { ...next, menuOpen: false });
  };
  const closeTextMenu = useCallback(() => {
    clearCardSelection(boardRef.current);
    setTextMenu(null);
  }, []);

  const [dropError, setDropError] = useState<string | null>(null);
  /** Lines selected on a card and dragged onto empty board are cut out there (spec A2): the piece holding them lands at the drop. */
  const onDragStart = (event: React.DragEvent) => {
    const words = readCardSelection(boardRef.current!);
    const chunk = words && state.board.nodes.find((n): n is ChunkNodeType => n.id === words.nodeId && n.type === "chunk");
    if (!words || !chunk) return;
    event.dataTransfer.setData(CUT_DRAG_TYPE, "card");
    event.dataTransfer.effectAllowed = "move";
    offerCut(async (at) => {
      const pieces = await api.recut(paperId, chunk.data.region, words.quote, "cut");
      const plan = recutPlan(chunk, pieces);
      if (plan) dispatch({ type: "reshape", ...placePiece(plan, pieceIndexOf(pieces, words.quote), at) });
    });
  };
  const onDragOver = (event: React.DragEvent) => { if (isCutDrag(event.dataTransfer.types)) event.preventDefault(); };
  /** A cut carried from the paper or a card, let go of on empty board. Anywhere else nothing happens (Review Focus 4). */
  const onDrop = (event: React.DragEvent) => {
    if (!isCutDrag(event.dataTransfer.types)) return;
    event.preventDefault();
    const drop = takeCut();
    if (!drop || !emptyPaneAt(event.target as Element)) return;
    closeHint("drag-cut");
    setDropError(null);
    drop(screenToFlowPosition({ x: event.clientX, y: event.clientY })).catch((failure: unknown) => {
      console.error("drop to cut failed", failure);
      setDropError("That could not be cut. Nothing was added.");
    });
  };
  /** A double-click on empty board makes a note there, ready for typing (spec A3). */
  const onDoubleClick = (event: React.MouseEvent) => {
    if (!emptyPaneAt(event.target as Element)) return;
    const note = newNote({ position: screenToFlowPosition({ x: event.clientX, y: event.clientY }), origin: "reader" });
    dispatch({ type: "add", nodes: [note] });
    setEditing(note.id);
    closeHint("dblclick-note");
  };

  /** Group, one gesture (addendum 4.10): a new group just around the selected pieces, one undo step. */
  const group = (ids: string[]) => {
    const nodes = groupAround(state.board.nodes, ids, box);
    if (nodes.length) dispatch({ type: "upsertNodes", nodes });
  };
  const selectedNodes = useMemo(() => state.board.nodes.filter((n) => n.selected), [state.board.nodes]);

  /** ↗ opens a piece's place in the paper. With the paper beside the board (both), clicking the piece or a mark on
   *  it does too: the paper scrolls there and flashes it, and the view stays as it is. */
  const onNodeClick = (event: React.MouseEvent, node: Node) => {
    if (node.type !== "chunk" && node.type !== "figure") return;
    const target = event.target as HTMLElement;
    const region = (node as BoardNode & { data: { region: { rects: PageRect[] } } }).data.region;
    if (target.closest("[data-testid=open-source]")) return onOpenInPaper(region.rects[0]);
    if (view.view !== "both" || !window.getSelection()?.isCollapsed || target.closest("button")) return;
    const markId = target.closest<HTMLElement>("mark[data-highlight-id]")?.dataset.highlightId;
    const mark = markId ? state.board.highlights.find((h) => h.id === markId) : undefined;
    onOpenInPaper(mark?.anchor.rects[0] ?? region.rects[0]);
  };

  // Every path into <ReactFlow> goes through parentsFirst, not only saving: a node re-parented into a
  // group created after it would otherwise be listed before its parent (findings, section 3).
  // Collapse only the rendered height of any piece, retaining the expanded size in the saved board.
  // `hidden` is set on this copy only, never on the stored nodes (addendum 4.2).
  const nodes = useMemo(() => parentsFirst(state.board.nodes).map((node) => {
    const drawn = node.type !== "group" && node.data.collapsed ? { ...node, height: undefined, initialHeight: undefined } : node;
    return hidden.has(node.id) ? { ...drawn, hidden: true } : drawn;
  }), [state.board.nodes, hidden]);
  // Stored connections are between the things themselves; React Flow's form is computed here (addendum 4.0).
  const edges = useMemo(() => flowEdges(state.board, hidden, selectedEdges, (tagId) => byId.get(tagId)?.colour), [state.board, hidden, selectedEdges, byId]);

  const onConnect: OnConnect = useCallback(({ source, sourceHandle, target, targetHandle }) => {
    dispatch({ type: "add", edges: [newEdge(endOf(source, sourceHandle), endOf(target, targetHandle))] });
    closeHint("connect");
  }, [dispatch]);
  /** A line let go of on empty board makes a note there, connected (addendum 4.10): one undo step, then the note opens. */
  const onConnectEnd: OnConnectEnd = useCallback((event, connection) => {
    if (connection.isValid || !connection.fromNode) return;
    const { clientX, clientY } = "changedTouches" in event ? event.changedTouches[0] : event;
    if (!onEmptyBoard(document.elementFromPoint(clientX, clientY))) return;
    const { note, edge } = noteAtDrop(connection.fromNode.id, connection.fromHandle?.id, screenToFlowPosition({ x: clientX, y: clientY }));
    dispatch({ type: "add", nodes: [note], edges: [edge] });
    setEditing(note.id);
    closeHint("connect");
  }, [dispatch, screenToFlowPosition]);
  const onEdgesChange = useCallback((changes: EdgeChange<FlowEdge>[]) => setSelectedEdges((current) => applySelection(current, changes)), []);

  // React Flow offers the selection plus every descendant and every touching edge. The reader chose only the selected
  // ones: the reducer removes those as one undo step and dissolves groups in place (addendum 4.2, 4.7).
  // In the both view a Delete meant for the paper (its open popover, its selected text) is not also the board's.
  const onBeforeDelete: OnBeforeDelete<BoardNode, FlowEdge> = useCallback(async ({ nodes: offered, edges: offeredEdges }) => {
    if (paperHoldsDelete(document)) return false;
    const nodeIds = offered.filter((n) => n.selected).map((n) => n.id);
    const edgeIds = offeredEdges.filter((e) => e.selected).map((e) => e.id);
    if (nodeIds.length || edgeIds.length) dispatch({ type: "remove", nodeIds, edgeIds });
    setSelectedEdges(new Set());
    return false;
  }, [dispatch]);
  const closeEdgeMenu = useCallback(() => setEdgeMenu(null), []);

  return (
    <BoardActionsProvider value={actions}>
    <div className="board" ref={boardRef} tabIndex={0} aria-label="Board" onMouseUp={onBoardMouseUp} onContextMenu={onContextMenu} onKeyDown={onKeyDown}
         onDragStart={onDragStart} onDragOver={onDragOver} onDrop={onDrop} onDoubleClick={onDoubleClick} {...cards}>
      <SelectionBar selected={selectedNodes} onGroup={group} />
      {/* Loose, so a highlight's handle (a source handle) can also be an edge's target: highlight to highlight. */}
      <ReactFlow<BoardNode, FlowEdge>
        nodes={nodes} edges={edges} nodeTypes={nodeTypes} connectionMode={ConnectionMode.Loose}
        onNodesChange={(changes) => dispatch({ type: "nodes", changes })}
        onEdgesChange={onEdgesChange} onConnect={onConnect} onConnectEnd={onConnectEnd}
        onEdgeClick={(event, edge) => setEdgeMenu({ id: edge.id, at: new DOMRect(event.clientX, event.clientY, 0, 0) })}
        onPaneClick={() => { closeEdgeMenu(); closeTextMenu(); }}
        onNodeDragStop={onNodeDragStop} onNodeClick={onNodeClick} onBeforeDelete={onBeforeDelete}
        defaultViewport={view.viewport ?? ORIGIN}
        onMoveStart={() => hover.hide()} onMoveEnd={(_, viewport) => setView({ viewport })}
        minZoom={0.2} fitView={false} deleteKeyCode={active ? DELETE_KEYS : null}
        zoomOnDoubleClick={false} panOnDrag panOnScroll selectionKeyCode="Shift" selectionMode={SelectionMode.Partial}
        multiSelectionKeyCode={["Shift", "Meta", "Control"]}
      >
        <Background />
        <Controls />
      </ReactFlow>
      {edgeMenu && <EdgePopover edgeId={edgeMenu.id} at={edgeMenu.at} onClose={closeEdgeMenu} />}
      {textMenu && <TextPopover selection={textMenu} menuOpen={textMenu.menuOpen} onClose={closeTextMenu} />}
      {paneMenu && (
        <ContextMenu at={paneMenu.at} label="Board" onClose={closePaneMenu}>
          <button type="button" className="action" role="menuitem" onClick={() => addGroup(paneMenu.flow)}>
            <span aria-hidden="true">▢</span> New group
          </button>
        </ContextMenu>
      )}
      {hover.card && <ContextCard card={hover.card} hover={hover} onGo={onOpenInPaper} onOpenNote={focusOn} />}
      {dropError && <p className="selection-error" role="alert" onClick={() => setDropError(null)}>{dropError}</p>}
      <Hint id="connect" when={active && selectedNodes.length === 1} />
      <Hint id="dblclick-note" when={active && !state.board.nodes.some((n) => n.type === "note")} />
    </div>
    </BoardActionsProvider>
  );
}

export function BoardView(props: Props) {
  return <ReactFlowProvider><Inner {...props} /></ReactFlowProvider>;
}
