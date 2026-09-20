import { Handle, NodeResizer, Position, type NodeProps } from "@xyflow/react";
import { highlightsIn } from "../../model/geometry";
import type { ChunkNode as ChunkNodeType } from "../../model/types";
import { useBoard } from "../../state/BoardProvider";
import { paintMarks } from "../marks";

export function ChunkNode({ id, data, selected }: NodeProps<ChunkNodeType>) {
  const { state, dispatch } = useBoard();
  // NodeProps.height also includes automatic measurements; only a stored height fixes the box size.
  const height = state.board.nodes.find((node) => node.id === id)?.height;
  const marks = highlightsIn(state.board.highlights, data.region);
  const title = data.region.start.exact.split("\n")[0].slice(0, 80);
  const toggle = () => {
    const node = state.board.nodes.find((n) => n.id === id)!;
    dispatch({ type: "replaceNode", node: { ...node, data: { ...data, collapsed: !data.collapsed } } as ChunkNodeType });
  };
  return (
    <div className={`node chunk ${data.region.state}${height !== undefined && !data.collapsed ? " sized" : ""}`}>
      <NodeResizer isVisible={selected && !data.collapsed} minWidth={200} minHeight={60} />
      <div className="node-head">
        <button className="quiet" onClick={toggle} title={data.collapsed ? "Expand" : "Collapse"}>{data.collapsed ? "▸" : "▾"}</button>
        <span className="title">{title}</span>
        <span className="count">{marks.length ? `${marks.length} marks` : ""}</span>
        <button className="quiet open-source" data-testid="open-source" title="Open in paper">↗</button>
      </div>
      {!data.collapsed && (
        <div className="node-body">
          {paintMarks(data.text, marks).map((run, i) => run.highlightId ? <mark key={i}>{run.text}</mark> : <span key={i}>{run.text}</span>)}
        </div>
      )}
      {marks.map((h, i) => (
        <Handle key={h.id} id={h.id} type="source" position={Position.Right} style={{ top: 36 + i * 14 }} title={h.anchor.quote.exact.slice(0, 60)} />
      ))}
      <Handle id={`${id}-in`} type="target" position={Position.Left} />
    </div>
  );
}
