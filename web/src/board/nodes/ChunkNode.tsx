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
  // The count is what is painted: a mark inside the region whose quote is not found in the text (or ties)
  // is not painted and not counted, but it keeps its handle, since an edge may end on it.
  const runs = paintMarks(text, marks, words);
  const painted = new Set(runs.flatMap((run) => (run.highlightId ? [run.highlightId] : []))).size;
  const unplaced = marks.length - painted;
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
        {painted > 0 && <span className="count" title={`${painted} highlight${painted === 1 ? "" : "s"} inside${unplaced ? `; ${unplaced} more not found in this text` : ""}`}>{painted}</span>}
        <button className="quiet open-source" data-testid="open-source" title="Open in paper" aria-label="Open in paper">↗</button>
      </div>
      {!data.collapsed && (
        <div className="node-body" ref={bodyRef}>
          {runs.map((run, i) => run.highlightId ? <mark key={i}>{run.text}</mark> : <span key={i}>{run.text}</span>)}
        </div>
      )}
      {marks.map((h, i) => (
        <Handle key={h.id} id={h.id} type="source" position={Position.Right} style={{ top: 36 + i * 14 }} title={h.anchor.quote.exact.slice(0, 60)} />
      ))}
      <Handle id={`${id}-in`} type="target" position={Position.Left} />
    </div>
  );
}
