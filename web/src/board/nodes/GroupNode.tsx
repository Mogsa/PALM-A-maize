import { NodeResizer, type NodeProps } from "@xyflow/react";
import type { GroupNode as GroupNodeType } from "../../model/types";

export function GroupNode({ data, selected }: NodeProps<GroupNodeType>) {
  return (
    <div className="node group">
      <NodeResizer isVisible={selected} minWidth={160} minHeight={120} />
      {data.name && <div className="group-name">{data.name}</div>}
    </div>
  );
}
