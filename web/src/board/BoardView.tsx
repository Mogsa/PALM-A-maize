import { useCallback, useEffect, useMemo } from "react";
import { Background, ConnectionMode, Controls, ReactFlow, ReactFlowProvider, useReactFlow, useNodesInitialized, type Node, type OnNodeDrag } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { planDelete } from "../model/dissolve";
import { resolveEdges, type FlowEdge } from "../model/edges";
import { newId } from "../model/ids";
import { fitsInside, isDescendant, reparent, type Box } from "../model/reparent";
import { parentsFirst } from "../model/serialize";
import type { BoardNode, GroupNode as GroupNodeType, PageRect } from "../model/types";
import { useBoard } from "../state/BoardProvider";
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
  const { getInternalNode, fitView, getZoom } = useReactFlow<BoardNode>();
  const initialized = useNodesInitialized();
  useEffect(() => {
    if (!initialized || !focusNode) return;
    void fitView({ nodes: [{ id: focusNode }], minZoom: 0.2, maxZoom: getZoom() });
    onFocusHandled?.();
  }, [initialized, focusNode, fitView, getZoom, onFocusHandled]);

  /** On drop, a node belongs to the smallest group that wholly contains it, or to none. This one rule
   *  covers dropping in, dragging out, moving between groups, and nesting groups. Whole containment,
   *  not intersection, because a partial overlap is where the spike saw nodes jump (findings, section 2).
   *  Coordinates converted explicitly (addendum 4.2). The rule applies to every dragged node: React Flow
   *  calls onNodeDragStop for a multi-selection and for a dragged selection box too, with all of them in `nodes`. */
  const onNodeDragStop: OnNodeDrag<BoardNode> = useCallback((_, __, draggedNodes) => {
    const box = (id: string): Box => {
      const internal = getInternalNode(id)!;
      return { ...internal.internals.positionAbsolute, width: internal.measured?.width ?? 0, height: internal.measured?.height ?? 0 };
    };
    for (const dragged of draggedNodes) {
      const me = box(dragged.id);
      const target = state.board.nodes
        .filter((n) => n.type === "group" && n.id !== dragged.id && !isDescendant(state.board.nodes, n.id, dragged.id))
        .map((n) => ({ id: n.id, box: box(n.id) }))
        .filter((g) => fitsInside(me, g.box))
        .sort((a, b) => a.box.width * a.box.height - b.box.width * b.box.height)[0] ?? null;
      if ((target?.id ?? null) === (dragged.parentId ?? null)) continue;
      const stored = state.board.nodes.find((n) => n.id === dragged.id)!;
      dispatch({ type: "replaceNode", node: reparent(stored, target?.id ?? null, { x: me.x, y: me.y }, target ? { x: target.box.x, y: target.box.y } : null) });
    }
  }, [dispatch, getInternalNode, state.board.nodes]);

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
  const nodes = useMemo(() => parentsFirst(state.board.nodes).map((node) =>
    node.type !== "group" && node.data.collapsed ? { ...node, height: undefined, initialHeight: undefined } : node), [state.board.nodes]);
  // Stored connections are between the things themselves; React Flow's form is computed here (addendum 4.0).
  const edges = useMemo(() => resolveEdges(state.board), [state.board]);
  return (
    <div className="board">
      <div className="board-tools">
        <button onClick={addGroup} title="A rectangle to pile pieces in. Drag pieces wholly inside it."><span aria-hidden="true">▢</span> New group</button>
      </div>
      {state.board.nodes.length === 0 && (
        <div className="empty-hint"><p>Nothing here yet. In the paper, select some text and choose <b>Cut</b> to place it on the board.</p></div>
      )}
      {/* Loose, so a highlight's handle (a source handle) can also be an edge's target: highlight to highlight. */}
      <ReactFlow<BoardNode, FlowEdge>
        nodes={nodes} edges={edges} nodeTypes={nodeTypes} connectionMode={ConnectionMode.Loose}
        onNodesChange={(changes) => dispatch({ type: "nodes", changes })}
        onEdgesChange={(changes) => dispatch({ type: "edges", changes })}
        onNodeDragStop={onNodeDragStop} onNodeClick={onNodeClick}
        onBeforeDelete={async ({ nodes: toDelete, edges: edgesToDelete }) => {
          // Dissolving a group must leave its pieces (addendum 4.2). React Flow hands us the group, all its
          // descendants and every edge touching them; planDelete keeps what the reader did not choose. It
          // decides on the stored edges, whose ends are what they connect, not the chunk drawing them.
          const absolute = (id: string) => getInternalNode(id)!.internals.positionAbsolute;
          const offered = new Set(edgesToDelete.map((e) => e.id));
          const stored = state.board.edges.filter((e) => offered.has(e.id));
          const plan = planDelete(state.board.nodes, toDelete, stored, absolute);
          for (const node of plan.lifted) dispatch({ type: "replaceNode", node });
          const dropped = new Set(plan.edges.map((e) => e.id));
          return { nodes: plan.nodes, edges: edgesToDelete.filter((e) => dropped.has(e.id)) };
        }}
        defaultViewport={state.board.viewport}
        onMoveEnd={(_, viewport) => dispatch({ type: "viewport", viewport })}
        minZoom={0.2} fitView={false} deleteKeyCode={active ? DELETE_KEYS : null}
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}

export function BoardView(props: Props) {
  return <ReactFlowProvider><Inner {...props} /></ReactFlowProvider>;
}
