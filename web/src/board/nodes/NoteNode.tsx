import { useEffect, useRef } from "react";
import { Handle, NodeResizer, Position, type NodeProps } from "@xyflow/react";
import { firstLine } from "../../model/notes";
import type { NoteNode as NoteNodeType } from "../../model/types";
import { useBoard, useNote } from "../../state/BoardProvider";
import { useBoardActions } from "../BoardActions";
import { inHandle, outHandle } from "../handles";
import { slotPrompt } from "../slots";
import { CollapseToggle } from "./CollapseToggle";
import { NodeTags } from "./NodeTags";

export const NOTE_PLACEHOLDER = "Write in your own words";

/** A note in the reader's own words, or an AI's answer marked as such (D14). The text lives in notes/<id>.md;
 *  the text area keeps its own undo (addendum 4.7). */
export function NoteNode({ id, data, selected, width, height }: NodeProps<NoteNodeType>) {
  const { state } = useBoard();
  const { editing, setEditing } = useBoardActions();
  const { text, error, edit, commit, loadFailed, retry } = useNote(id);
  const textRef = useRef<HTMLTextAreaElement>(null);
  // React Flow keeps a node hidden until it is measured, and a hidden field cannot take focus: a note just made
  // (New note, a slot's question) is focused once it shows, not on mount.
  const shown = Boolean(width && height);
  useEffect(() => { if (editing === id && shown) textRef.current?.focus(); }, [editing, id, shown]);
  const prompt = slotPrompt(state.board.nodes, state.board.nodes.find((n) => n.id === id)?.parentId);
  const finish = () => {
    void commit();
    setEditing(null);
  };
  const origin = data.origin ?? "reader";
  const ai = origin === "ai";
  return (
    <div className={`node note ${origin}`}>
      <NodeResizer isVisible={selected && !data.collapsed} minWidth={160} minHeight={60} />
      <div className="node-head">
        <CollapseToggle id={id} collapsed={data.collapsed} />
        <span className={`badge note-badge ${origin}`}>{ai ? "AI" : "note"}</span>
        <span className="title">{firstLine(text ?? "") || (ai ? "AI answer" : "Note")}</span>
        <NodeTags id={id} tags={data.tags} />
      </div>
      {/* Read-only until the saved text is here, and no field at all when it could not be read: typing over a note
          not yet loaded would replace it (M3). */}
      {loadFailed
        ? <p className="note-error" role="alert">{error} <button className="quiet nodrag" onClick={retry}>Retry</button></p>
        : <>
            {!data.collapsed && (editing === id
              ? <textarea ref={textRef} className="note-text nodrag nowheel" value={text ?? ""} aria-label="Note" readOnly={text === undefined}
                          placeholder={prompt ?? NOTE_PLACEHOLDER} onChange={(e) => edit(e.target.value)} onBlur={finish} />
              : <div className="node-body note-body" onDoubleClick={() => setEditing(id)} title="Double-click to write">
                  {text || <span className="hint">{prompt ?? NOTE_PLACEHOLDER}</span>}
                </div>)}
            {error && <p className="note-error" role="alert">{error}</p>}
          </>}
      <Handle id={inHandle(id)} type="target" position={Position.Left} />
      <Handle id={outHandle(id)} type="source" position={Position.Right} />
    </div>
  );
}
