import { NodeResizer, type NodeProps } from "@xyflow/react";
import type { GroupNode as GroupNodeType } from "../../model/types";

export function GroupNode({ data, selected }: NodeProps<GroupNodeType>) {
  return (
    <div className={`node group ${selected ? "selected" : ""}`}>
      <NodeResizer isVisible={selected} minWidth={160} minHeight={120} />
      <div className={`group-name ${data.name ? "" : "unnamed"}`}>{data.name ?? "Group"}</div>
    </div>
  );
}
