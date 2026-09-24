import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { newEdge, notesConnectedTo } from "../model/links";
import { newNote } from "../model/notes";
import { spotForNoteOn } from "../model/placement";
import type { Highlight } from "../model/types";
import { useBoard } from "../state/BoardProvider";
import { isTextField } from "../state/keys";
import { TagPicker } from "../tags/TagPicker";
import { AskElsewhere } from "./AskElsewhere";
import { NoteEditor } from "./NoteEditor";
import { POPOVER_MARGIN, popoverPlace } from "./place";
import { previewText } from "./preview";

export const MARK_POPOVER_WIDTH = 320;
export const MARK_POPOVER_HEIGHT = 360;

type Props = { highlight: Highlight; at: DOMRect; onClose: () => void; onConnect: () => void };

/** The popover's rendered height, re-measured after every render: its tags, notes and a copied prompt all change it,
 *  and placing it by a guess can push its buttons below the window. */
function useMeasuredHeight(guess: number) {
  const box = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(guess);
  useLayoutEffect(() => {
    const measured = box.current?.offsetHeight;
    if (measured && measured !== height) setHeight(measured);
  });
  return { box, height };
}

/** Everything a mark can take (SPEC 5.1): tags, notes, connections. Delete or Backspace removes it (D4). */
export function MarkPopover({ highlight, at, onClose, onConnect }: Props) {
  const { state, dispatch } = useBoard();
  const notes = notesConnectedTo(state.board, [highlight.id]);
  const addNote = () => {
    const note = newNote({ ...spotForNoteOn(state.board, highlight.id), origin: "reader" });
    dispatch({ type: "add", nodes: [note], edges: [newEdge(highlight.id, note.id)] });   // one undo step
  };
  const remove = useCallback(() => {
    dispatch({ type: "remove", highlightIds: [highlight.id] });
    onClose();
  }, [dispatch, highlight.id, onClose]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isTextField(event.target)) return;
      if (event.key === "Escape") onClose();
      if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); remove(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, remove]);
  const { box, height } = useMeasuredHeight(MARK_POPOVER_HEIGHT);
  const { left, top } = popoverPlace(at, MARK_POPOVER_WIDTH, Math.min(height, window.innerHeight - 2 * POPOVER_MARGIN));
  return (
    <div ref={box} className="popover mark-popover" role="dialog" aria-label="Mark" style={{ left, top }} onMouseDown={(e) => e.stopPropagation()}>
      <div className="popover-preview" title={highlight.anchor.quote.exact}>{previewText(highlight.anchor.quote.exact)}</div>
      <TagPicker value={highlight.tags} onChange={(tags) => dispatch({ type: "setTags", target: "highlight", id: highlight.id, tags })} />
      {notes.map((n) => <NoteEditor key={n.id} noteId={n.id} origin={n.data.origin ?? "reader"} />)}
      <div className="popover-actions">
        <button className="action" onClick={onConnect} title="Then click another mark or a section heading">Connect</button>
        <button className="action" onClick={addNote}>Add note</button>
        <AskElsewhere highlight={highlight} />
        <button className="action" onClick={remove} title="Delete">Remove</button>
        <button className="quiet close" aria-label="Dismiss" onClick={onClose}>×</button>
      </div>
    </div>
  );
}
