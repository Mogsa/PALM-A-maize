import { useState } from "react";
import { Handle, NodeResizer, Position, type NodeProps } from "@xyflow/react";
import { newNote } from "../../model/notes";
import type { GroupNode as GroupNodeType } from "../../model/types";
import { useBoard } from "../../state/BoardProvider";
import { useBoardActions } from "../BoardActions";
import { inHandle, outHandle } from "../handles";
import { hasNote, SLOT_NOTE_AT } from "../slots";
import { NodeTags } from "./NodeTags";
import { TrayRows } from "./TrayRows";

function GroupName({ id, name }: { id: string; name: string | null | undefined }) {
  const { state, dispatch } = useBoard();
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    const node = state.board.nodes.find((n) => n.id === id);
    const next = draft?.trim() || null;
    if (draft !== null && node?.type === "group" && next !== (node.data.name ?? null)) {
      dispatch({ type: "replaceNode", node: { ...node, data: { ...node.data, name: next } } });
    }
    setDraft(null);
  };
  if (draft !== null) {
    return <input className="group-name nodrag" autoFocus value={draft} aria-label="Group name" onChange={(e) => setDraft(e.target.value)}
                  onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setDraft(null); }} />;
  }
  return <div className={`group-name ${name ? "" : "unnamed"}`} onDoubleClick={() => setDraft(name ?? "")} title="Double-click to name">{name ?? "Group"}</div>;
}

/** A group, a slot when it carries a question (D17), the tray when it is the Paper group (D15). */
export function GroupNode({ id, data, selected }: NodeProps<GroupNodeType>) {
  const { state, dispatch } = useBoard();
  const { setEditing } = useBoardActions();
  const answer = (event: React.MouseEvent) => {
    event.stopPropagation();   // answering a slot does not select the slot
    const note = newNote({ position: SLOT_NOTE_AT, parentId: id, origin: "reader" });
    dispatch({ type: "add", nodes: [note] });
    setEditing(note.id);
  };
  const classes = ["node", "group", data.tray ? "tray" : "", data.prompt ? "slot" : "", selected ? "selected" : ""].filter(Boolean).join(" ");
  return (
    <div className={classes}>
      <NodeResizer isVisible={selected} minWidth={160} minHeight={120} />
      <div className="group-head"><GroupName id={id} name={data.name} /><NodeTags id={id} tags={data.tags} /></div>
      {data.prompt && !hasNote(state.board.nodes, id) && (
        <button type="button" className="slot-prompt nodrag" onClick={answer} title="Answer it in a note of your own">{data.prompt}</button>
      )}
      {data.tray && <TrayRows trayId={id} />}
      <Handle id={inHandle(id)} type="target" position={Position.Left} />
      <Handle id={outHandle(id)} type="source" position={Position.Right} />
    </div>
  );
}
