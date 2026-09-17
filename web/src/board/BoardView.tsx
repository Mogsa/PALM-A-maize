import { useCallback, useMemo } from "react";
import { Background, Controls, ReactFlow, ReactFlowProvider, useReactFlow, type Node, type OnNodeDrag } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { planDelete } from "../model/dissolve";
import { newId } from "../model/ids";
import { fitsInside, isDescendant, reparent, type Box } from "../model/reparent";
import { parentsFirst } from "../model/serialize";
import type { BoardEdge, BoardNode, GroupNode as GroupNodeType, PageRect } from "../model/types";
import { useBoard } from "../state/BoardProvider";
import { ChunkNode } from "./nodes/ChunkNode";
import { FigureNode } from "./nodes/FigureNode";
import { GroupNode } from "./nodes/GroupNode";
import { NoteNode } from "./nodes/NoteNode";

const nodeTypes = { chunk: ChunkNode, figure: FigureNode, note: NoteNode, group: GroupNode };

function Inner({ onOpenInPaper }: { onOpenInPaper: (rect: PageRect) => void }) {
  const { state, dispatch } = useBoard();
  const { getInternalNode } = useReactFlow<BoardNode>();

  /** On drop, a node belongs to the smallest group that wholly contains it, or to none. This one rule
   *  covers dropping in, dragging out, moving between groups, and nesting groups. Whole containment,
   *  not intersection, because a partial overlap is where the spike saw nodes jump (findings, section 2).
   *  Coordinates converted explicitly (addendum 4.2). */
  const onNodeDragStop: OnNodeDrag<BoardNode> = useCallback((_, dragged) => {
    const box = (id: string): Box => {
      const internal = getInternalNode(id)!;
      return { ...internal.internals.positionAbsolute, width: internal.measured?.width ?? 0, height: internal.measured?.height ?? 0 };
    };
    const me = box(dragged.id);
    const target = state.board.nodes
      .filter((n) => n.type === "group" && n.id !== dragged.id && !isDescendant(state.board.nodes, n.id, dragged.id))
      .map((n) => ({ id: n.id, box: box(n.id) }))
      .filter((g) => fitsInside(me, g.box))
      .sort((a, b) => a.box.width * a.box.height - b.box.width * b.box.height)[0] ?? null;
    if ((target?.id ?? null) === (dragged.parentId ?? null)) return;
    const stored = state.board.nodes.find((n) => n.id === dragged.id)!;
    dispatch({ type: "replaceNode", node: reparent(stored, target?.id ?? null, { x: me.x, y: me.y }, target ? { x: target.box.x, y: target.box.y } : null) });
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
  const nodes = useMemo(() => parentsFirst(state.board.nodes), [state.board.nodes]);
  return (
    <div className="board">
      <div className="board-tools"><button onClick={addGroup}>New group</button></div>
      <ReactFlow<BoardNode, BoardEdge>
        nodes={nodes} edges={state.board.edges} nodeTypes={nodeTypes}
        onNodesChange={(changes) => dispatch({ type: "nodes", changes })}
        onEdgesChange={(changes) => dispatch({ type: "edges", changes })}
        onNodeDragStop={onNodeDragStop} onNodeClick={onNodeClick}
        onBeforeDelete={async ({ nodes: toDelete, edges: edgesToDelete }) => {
          // Dissolving a group must leave its pieces (addendum 4.2). React Flow hands us the group, all its
          // descendants and every edge touching them; planDelete keeps what the reader did not choose.
          const absolute = (id: string) => getInternalNode(id)!.internals.positionAbsolute;
          const plan = planDelete(state.board.nodes, toDelete, edgesToDelete, absolute);
          for (const node of plan.lifted) dispatch({ type: "replaceNode", node });
          return { nodes: plan.nodes, edges: plan.edges };
        }}
        defaultViewport={state.board.viewport}
        onMoveEnd={(_, viewport) => dispatch({ type: "viewport", viewport })}
        minZoom={0.2} fitView={false} deleteKeyCode={["Backspace", "Delete"]}
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}

export function BoardView(props: { onOpenInPaper: (rect: PageRect) => void }) {
  return <ReactFlowProvider><Inner {...props} /></ReactFlowProvider>;
}
