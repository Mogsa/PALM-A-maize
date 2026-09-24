import { Handle, NodeResizer, Position, type NodeProps } from "@xyflow/react";
import { highlightsIn } from "../../model/geometry";
import { notesConnectedTo } from "../../model/links";
import type { FigureNode as FigureNodeType } from "../../model/types";
import { useBoard } from "../../state/BoardProvider";
import { inHandle, outHandle } from "../handles";
import { CollapseToggle } from "./CollapseToggle";
import { Counts } from "./Counts";

/** A figure is a clip of the paper as printed. One with no clip yet is one whose clip is still being stored on
 *  first open; it shows its caption meanwhile. */
export function FigureNode({ id, data, selected }: NodeProps<FigureNodeType>) {
  const { state, paperId } = useBoard();
  const title = data.caption.split(/[:.]/)[0] || "Figure";
  const marks = highlightsIn(state.board.highlights, data.region);
  const notes = notesConnectedTo(state.board, [id, ...marks.map((m) => m.id)]).length;
  return (
    <div className={`node figure ${data.region.state}`}>
      <NodeResizer isVisible={selected && !data.collapsed} minWidth={160} minHeight={60} keepAspectRatio />
      <div className="node-head">
        <CollapseToggle id={id} collapsed={data.collapsed} />
        <span className="badge" title={`Page ${data.region.rects[0].page + 1}`}>p{data.region.rects[0].page + 1}</span>
        <span className="title">{title}</span>
        <Counts marks={marks.length} notes={notes} />
        <button className="quiet open-source" data-testid="open-source" title="Open in paper">↗</button>
      </div>
      {!data.collapsed && (
        <div className="node-body">
          {data.clip && data.clip_size
            ? <img src={`/api/papers/${paperId}/${data.clip}`} width={data.clip_size.width} height={data.clip_size.height} alt={data.caption} className="clip" />
            : <span>{data.caption}</span>}
        </div>
      )}
      <Handle id={inHandle(id)} type="target" position={Position.Left} />
      <Handle id={outHandle(id)} type="source" position={Position.Right} />
    </div>
  );
}
