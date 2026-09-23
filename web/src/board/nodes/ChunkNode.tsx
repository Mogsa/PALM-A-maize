import { Handle, NodeResizer, Position, type NodeProps } from "@xyflow/react";
import { highlightsIn } from "../../model/geometry";
import type { ChunkNode as ChunkNodeType } from "../../model/types";
import { useBoard } from "../../state/BoardProvider";
import { paintMarks, reflow } from "../marks";
import { useOverflow } from "../overflow";

export function ChunkNode({ id, data, selected }: NodeProps<ChunkNodeType>) {
  const { state, dispatch, words } = useBoard();
  // NodeProps.height also includes automatic measurements; only a stored height fixes the box size.
  const height = state.board.nodes.find((node) => node.id === id)?.height;
  const marks = highlightsIn(state.board.highlights, data.region);
  const text = reflow(data.text, words);
  const title = reflow(data.region.start.exact, words).slice(0, 80);
  const page = data.region.rects[0].page + 1;
  const [bodyRef, overflowing] = useOverflow<HTMLDivElement>();
  const toggle = () => {
    const node = state.board.nodes.find((n) => n.id === id)!;
    dispatch({ type: "replaceNode", node: { ...node, data: { ...data, collapsed: !data.collapsed } } as ChunkNodeType });
  };
  const classes = ["node", "chunk", data.region.state, height !== undefined && !data.collapsed ? "sized" : "", overflowing ? "overflowing" : ""].filter(Boolean).join(" ");
  return (
    <div className={classes}>
      <NodeResizer isVisible={selected && !data.collapsed} minWidth={200} minHeight={60} />
      <div className="node-head">
        <button className="quiet toggle" onClick={toggle} title={data.collapsed ? "Expand" : "Collapse"} aria-label={data.collapsed ? "Expand" : "Collapse"}>{data.collapsed ? "▸" : "▾"}</button>
        <span className="badge" title={`Page ${page}`}>p{page}</span>
        <span className="title">{title}</span>
        {marks.length > 0 && <span className="count" title={`${marks.length} highlight${marks.length === 1 ? "" : "s"} inside`}>{marks.length}</span>}
        <button className="quiet open-source" data-testid="open-source" title="Open in paper" aria-label="Open in paper">↗</button>
      </div>
      {!data.collapsed && (
        <div className="node-body" ref={bodyRef}>
          {paintMarks(text, marks, words).map((run, i) => run.highlightId ? <mark key={i}>{run.text}</mark> : <span key={i}>{run.text}</span>)}
        </div>
      )}
      {marks.map((h, i) => (
        <Handle key={h.id} id={h.id} type="source" position={Position.Right} style={{ top: 36 + i * 14 }} title={h.anchor.quote.exact.slice(0, 60)} />
      ))}
      <Handle id={`${id}-in`} type="target" position={Position.Left} />
    </div>
  );
}
