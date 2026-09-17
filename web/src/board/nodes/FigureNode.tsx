import { Handle, NodeResizer, Position, type NodeProps } from "@xyflow/react";
import type { FigureNode as FigureNodeType } from "../../model/types";
import { useBoard } from "../../state/BoardProvider";

/** A figure is a clip of the paper as printed. Until the next plan writes clips,
 *  `data.clip` is null and the node shows its caption only. */
export function FigureNode({ id, data, selected }: NodeProps<FigureNodeType>) {
  const { paperId } = useBoard();
  const title = data.caption.split(/[:.]/)[0] || "Figure";
  return (
    <div className={`node figure ${data.region.state}`}>
      <NodeResizer isVisible={selected} minWidth={160} minHeight={60} keepAspectRatio />
      <div className="node-head">
        <span className="title">{title}</span>
        <button className="quiet open-source" data-testid="open-source" title="Open in paper">↗</button>
      </div>
      {!data.collapsed && (
        <div className="node-body">
          {data.clip && data.clip_size
            ? <img src={`/api/papers/${paperId}/${data.clip}`} width={data.clip_size.width} height={data.clip_size.height} alt={data.caption} style={{ maxWidth: "100%", height: "auto" }} />
            : <span>{data.caption}</span>}
        </div>
      )}
      <Handle id={`${id}-in`} type="target" position={Position.Left} />
      <Handle id={`${id}-out`} type="source" position={Position.Right} />
    </div>
  );
}
