import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background, ConnectionMode, Controls, ReactFlow, ReactFlowProvider, useReactFlow, useNodesInitialized,
  type EdgeChange, type Node, type OnBeforeDelete, type OnConnect, type OnNodeDrag,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { hiddenNodeIds } from "../model/filter";
import { newId } from "../model/ids";
import { newEdge } from "../model/links";
import { newNote } from "../model/notes";
import { fitsInside, isDescendant, reparent, type Box } from "../model/reparent";
import { parentsFirst } from "../model/serialize";
import type { BoardNode, GroupNode as GroupNodeType, PageRect } from "../model/types";
import { useBoard } from "../state/BoardProvider";
import { useTags } from "../state/TagsProvider";
import { BoardActionsProvider } from "./BoardActions";
import { BoardTools } from "./BoardTools";
import { EdgePopover } from "./EdgePopover";
import { applySelection, endOf, flowEdges, type FlowEdge } from "./handles";
import { ChunkNode } from "./nodes/ChunkNode";
import { FigureNode } from "./nodes/FigureNode";
import { GroupNode } from "./nodes/GroupNode";
import { NoteNode } from "./nodes/NoteNode";

const nodeTypes = { chunk: ChunkNode, figure: FigureNode, note: NoteNode, group: GroupNode };

/** `active` is false while the paper view is shown: the board stays mounted but hidden, and must not
 *  take the delete key from the paper. */
type Props = { onOpenInPaper: (rect: PageRect) => void; active?: boolean; focusNode?: string | null; onFocusHandled?: () => void };

const DELETE_KEYS = ["Backspace", "Delete"];

function Inner({ onOpenInPaper, active = true, focusNode, onFocusHandled }: Props) {
  const { state, dispatch } = useBoard();
  const { byId } = useTags();
  const { getInternalNode, fitView, getZoom, screenToFlowPosition } = useReactFlow<BoardNode>();
  const boardRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const initialized = useNodesInitialized();
  const [selectedEdges, setSelectedEdges] = useState<ReadonlySet<string>>(() => new Set());
  const [edgeMenu, setEdgeMenu] = useState<{ id: string; at: DOMRect } | null>(null);
  const hidden = useMemo(() => hiddenNodeIds(state.board), [state.board]);
  useEffect(() => {
    if (!initialized || !focusNode) return;
    void fitView({ nodes: [{ id: focusNode }], minZoom: 0.2, maxZoom: getZoom() });
    onFocusHandled?.();
  }, [initialized, focusNode, fitView, getZoom, onFocusHandled]);

  /** On drop, a node belongs to the smallest group that wholly contains it, or to none. This one rule
   *  covers dropping in, dragging out, moving between groups, and nesting groups. Whole containment,
   *  not intersection, because a partial overlap is where the spike saw nodes jump (findings, section 2).
   *  Coordinates converted explicitly (addendum 4.2). The rule applies to every dragged node: React Flow
   *  calls onNodeDragStop for a multi-selection and for a dragged selection box too, with all of them in `nodes`.
   *  The re-parenting joins the drag's undo step. */
  const onNodeDragStop: OnNodeDrag<BoardNode> = useCallback((_, __, draggedNodes) => {
    const box = (id: string): Box => {
      const internal = getInternalNode(id)!;
      return { ...internal.internals.positionAbsolute, width: internal.measured?.width ?? 0, height: internal.measured?.height ?? 0 };
    };
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
  }, [dispatch, getInternalNode, state.board.nodes]);

  const focusOn = useCallback((id: string) => {
    void fitView({ nodes: [{ id }], minZoom: 0.2, maxZoom: getZoom(), duration: 300 });
    dispatch({ type: "nodes", changes: [{ type: "select", id, selected: true }] });
  }, [fitView, getZoom, dispatch]);
  const actions = useMemo(() => ({ focusNode: focusOn, openInPaper: onOpenInPaper, editing, setEditing }), [focusOn, onOpenInPaper, editing]);

  const addNote = () => {
    const box = boardRef.current!.getBoundingClientRect();
    const note = newNote({ position: screenToFlowPosition({ x: box.left + box.width / 2, y: box.top + box.height / 2 }), origin: "reader" });
    dispatch({ type: "add", nodes: [note] });
    setEditing(note.id);
  };

  const addGroup = () => {
    const node: GroupNodeType = { id: newId("n"), type: "group", position: { x: 400, y: 40 }, width: 480, height: 320, data: { tags: [], name: null } };
    dispatch({ type: "addNode", node });
  };

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
    <div className="board" ref={boardRef}>
      <BoardTools onAddGroup={addGroup} onAddNote={addNote} />
      {/* Loose, so a highlight's handle (a source handle) can also be an edge's target: highlight to highlight. */}
      <ReactFlow<BoardNode, FlowEdge>
        nodes={nodes} edges={edges} nodeTypes={nodeTypes} connectionMode={ConnectionMode.Loose}
        onNodesChange={(changes) => dispatch({ type: "nodes", changes })}
        onEdgesChange={onEdgesChange} onConnect={onConnect}
        onEdgeClick={(event, edge) => setEdgeMenu({ id: edge.id, at: new DOMRect(event.clientX, event.clientY, 0, 0) })}
        onPaneClick={closeEdgeMenu}
        onNodeDragStop={onNodeDragStop} onNodeClick={onNodeClick} onBeforeDelete={onBeforeDelete}
        defaultViewport={state.board.viewport}
        onMoveEnd={(_, viewport) => dispatch({ type: "viewport", viewport })}
        minZoom={0.2} fitView={false} deleteKeyCode={active ? DELETE_KEYS : null}
      >
        <Background />
        <Controls />
      </ReactFlow>
      {edgeMenu && <EdgePopover edgeId={edgeMenu.id} at={edgeMenu.at} onClose={closeEdgeMenu} />}
    </div>
    </BoardActionsProvider>
  );
}

export function BoardView(props: Props) {
  return <ReactFlowProvider><Inner {...props} /></ReactFlowProvider>;
}
