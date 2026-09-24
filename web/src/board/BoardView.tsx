import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background, ConnectionMode, Controls, ReactFlow, ReactFlowProvider, useReactFlow, useNodesInitialized,
  type EdgeChange, type Node, type OnBeforeDelete, type OnConnect, type OnConnectEnd, type OnNodeDrag,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { hiddenNodeIds } from "../model/filter";
import { newId } from "../model/ids";
import { newEdge } from "../model/links";
import { newNote } from "../model/notes";
import { fitsInside, isDescendant, reparent, type Box } from "../model/reparent";
import { parentsFirst } from "../model/serialize";
import type { BoardNode, GroupNode as GroupNodeType, PageRect } from "../model/types";
import { ContextCard } from "../paper/ContextCard";
import { useHoverCard } from "../paper/useHoverCard";
import { useBoard } from "../state/BoardProvider";
import { useTags } from "../state/TagsProvider";
import { BoardActionsProvider } from "./BoardActions";
import { BoardTools } from "./BoardTools";
import { noteAtDrop, onEmptyBoard } from "./dropNote";
import { clearCardSelection, textMenuAfterMouseUp, type CardSelection } from "./cardSelection";
import { EdgePopover } from "./EdgePopover";
import { groupAround } from "./grouping";
import { applySelection, endOf, flowEdges, type FlowEdge } from "./handles";
import { ChunkNode } from "./nodes/ChunkNode";
import { FigureNode } from "./nodes/FigureNode";
import { GroupNode } from "./nodes/GroupNode";
import { NoteNode } from "./nodes/NoteNode";
import { SelectionBar } from "./SelectionBar";
import { TextPopover } from "./TextPopover";
import { tidyPositions } from "./tidy";
import { useBoardCards } from "./useBoardCards";

const nodeTypes = { chunk: ChunkNode, figure: FigureNode, note: NoteNode, group: GroupNode };

/** `active` is false while the paper view is shown: the board stays mounted but hidden, and must not
 *  take the delete key from the paper. */
type Props = { onOpenInPaper: (rect: PageRect) => void; active?: boolean; focusNode?: string | null; onFocusHandled?: () => void };

const DELETE_KEYS = ["Backspace", "Delete"];

function Inner({ onOpenInPaper, active = true, focusNode, onFocusHandled }: Props) {
  const { state, dispatch, source, paperId } = useBoard();
  const { byId } = useTags();
  const hover = useHoverCard();
  const cards = useBoardCards(source, paperId, state.board.highlights, hover);
  const { getInternalNode, getNodes, fitView, getZoom, screenToFlowPosition } = useReactFlow<BoardNode>();
  const boardRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const initialized = useNodesInitialized();
  const [selectedEdges, setSelectedEdges] = useState<ReadonlySet<string>>(() => new Set());
  const [edgeMenu, setEdgeMenu] = useState<{ id: string; at: DOMRect } | null>(null);
  const [textMenu, setTextMenu] = useState<CardSelection | null>(null);
  // The note being written stays in sight whatever the filter: a new note carries no tag yet (D8).
  const hidden = useMemo(() => {
    const ids = hiddenNodeIds(state.board);
    if (editing) ids.delete(editing);
    return ids;
  }, [state.board, editing]);
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
  const actions = useMemo(() => ({ focusNode: focusOn, openInPaper: onOpenInPaper, editing, setEditing }), [focusOn, onOpenInPaper, editing]);

  const addNote = () => {
    const box = boardRef.current!.getBoundingClientRect();
    const note = newNote({ position: screenToFlowPosition({ x: box.left + box.width / 2, y: box.top + box.height / 2 }), origin: "reader" });
    dispatch({ type: "add", nodes: [note] });
    setEditing(note.id);
  };

  const tidy = () => {
    const sizeOf = (id: string) => {
      const measured = getInternalNode(id)?.measured;
      const stored = state.board.nodes.find((n) => n.id === id);
      return { width: measured?.width ?? stored?.width ?? 0, height: measured?.height ?? stored?.height ?? 0 };
    };
    const moved = tidyPositions(state.board, sizeOf);
    if (!moved.size) return;
    dispatch({ type: "upsertNodes", nodes: state.board.nodes.filter((n) => moved.has(n.id)).map((n) => ({ ...n, position: moved.get(n.id)! })) });
  };

  const addGroup = () => {
    const node: GroupNodeType = { id: newId("n"), type: "group", position: { x: 400, y: 40 }, width: 480, height: 320, data: { tags: [], name: null } };
    dispatch({ type: "addNode", node });
  };

  /** Words selected on a card offer Highlight, Split here and Cut out (D20, D21). The popover follows the selection:
   *  it closes when the words are no longer selected, and closing it clears them so it does not come back. */
  const onBoardMouseUp = (event: React.MouseEvent) => {
    const next = textMenuAfterMouseUp(boardRef.current!, event.target);
    if (next !== undefined) setTextMenu(next);
  };
  const closeTextMenu = useCallback(() => {
    clearCardSelection(boardRef.current);
    setTextMenu(null);
  }, []);

  /** Group, one gesture (addendum 4.10): a new group just around the selected pieces, one undo step. */
  const group = (ids: string[]) => {
    const nodes = groupAround(state.board.nodes, ids, box);
    if (nodes.length) dispatch({ type: "upsertNodes", nodes });
  };
  const selectedNodes = useMemo(() => state.board.nodes.filter((n) => n.selected), [state.board.nodes]);

  const onNodeClick = (event: React.MouseEvent, node: Node) => {
    if ((event.target as HTMLElement).closest("[data-testid=open-source]") && (node.type === "chunk" || node.type === "figure")) {
      onOpenInPaper((node as BoardNode & { data: { region: { rects: PageRect[] } } }).data.region.rects[0]);
    }
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
  }, [dispatch]);
  /** A line let go of on empty board makes a note there, connected (addendum 4.10): one undo step, then the note opens. */
  const onConnectEnd: OnConnectEnd = useCallback((event, connection) => {
    if (connection.isValid || !connection.fromNode) return;
    const { clientX, clientY } = "changedTouches" in event ? event.changedTouches[0] : event;
    if (!onEmptyBoard(document.elementFromPoint(clientX, clientY))) return;
    const { note, edge } = noteAtDrop(connection.fromNode.id, connection.fromHandle?.id, screenToFlowPosition({ x: clientX, y: clientY }));
    dispatch({ type: "add", nodes: [note], edges: [edge] });
    setEditing(note.id);
  }, [dispatch, screenToFlowPosition]);
  const onEdgesChange = useCallback((changes: EdgeChange<FlowEdge>[]) => setSelectedEdges((current) => applySelection(current, changes)), []);

  // React Flow offers the selection plus every descendant and every touching edge. The reader chose only the selected
  // ones: the reducer removes those as one undo step and dissolves groups in place (addendum 4.2, 4.7).
  const onBeforeDelete: OnBeforeDelete<BoardNode, FlowEdge> = useCallback(async ({ nodes: offered, edges: offeredEdges }) => {
    const nodeIds = offered.filter((n) => n.selected).map((n) => n.id);
    const edgeIds = offeredEdges.filter((e) => e.selected).map((e) => e.id);
    if (nodeIds.length || edgeIds.length) dispatch({ type: "remove", nodeIds, edgeIds });
    setSelectedEdges(new Set());
    return false;
  }, [dispatch]);
  const closeEdgeMenu = useCallback(() => setEdgeMenu(null), []);

  return (
    <BoardActionsProvider value={actions}>
    <div className="board" ref={boardRef} onMouseUp={onBoardMouseUp} {...cards}>
      <BoardTools onAddGroup={addGroup} onAddNote={addNote} onTidy={tidy} />
      <SelectionBar selected={selectedNodes} onGroup={group} />
      {/* Loose, so a highlight's handle (a source handle) can also be an edge's target: highlight to highlight. */}
      <ReactFlow<BoardNode, FlowEdge>
        nodes={nodes} edges={edges} nodeTypes={nodeTypes} connectionMode={ConnectionMode.Loose}
        onNodesChange={(changes) => dispatch({ type: "nodes", changes })}
        onEdgesChange={onEdgesChange} onConnect={onConnect} onConnectEnd={onConnectEnd}
        onEdgeClick={(event, edge) => setEdgeMenu({ id: edge.id, at: new DOMRect(event.clientX, event.clientY, 0, 0) })}
        onPaneClick={() => { closeEdgeMenu(); closeTextMenu(); }}
        onNodeDragStop={onNodeDragStop} onNodeClick={onNodeClick} onBeforeDelete={onBeforeDelete}
        defaultViewport={state.board.viewport}
        onMoveStart={() => hover.hide()} onMoveEnd={(_, viewport) => dispatch({ type: "viewport", viewport })}
        minZoom={0.2} fitView={false} deleteKeyCode={active ? DELETE_KEYS : null}
      >
        <Background />
        <Controls />
      </ReactFlow>
      {edgeMenu && <EdgePopover edgeId={edgeMenu.id} at={edgeMenu.at} onClose={closeEdgeMenu} />}
      {textMenu && <TextPopover selection={textMenu} onClose={closeTextMenu} />}
      {hover.card && <ContextCard card={hover.card} hover={hover} onGo={onOpenInPaper} onOpenNote={focusOn} />}
    </div>
    </BoardActionsProvider>
  );
}

export function BoardView(props: Props) {
  return <ReactFlowProvider><Inner {...props} /></ReactFlowProvider>;
}
