import { Handle, NodeResizer, Position, type NodeProps } from "@xyflow/react";
import type { NoteNode as NoteNodeType } from "../../model/types";

/** A note in the reader's own words. This plan draws it; editing and the note file
 *  arrive in the next plan, so the body shows the note path as a placeholder. */
export function NoteNode({ id, data, selected }: NodeProps<NoteNodeType>) {
  return (
    <div className="node note">
      <NodeResizer isVisible={selected} minWidth={160} minHeight={60} />
      <div className="node-head"><span className="title">Note</span></div>
      {!data.collapsed && <div className="node-body">{data.note}</div>}
      <Handle id={`${id}-in`} type="target" position={Position.Left} />
      <Handle id={`${id}-out`} type="source" position={Position.Right} />
    </div>
  );
}
