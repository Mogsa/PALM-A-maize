import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { newEdge, notesConnectedTo } from "../model/links";
import { newNote } from "../model/notes";
import { spotForNoteOn } from "../model/placement";
import type { Highlight } from "../model/types";
import { useBoard } from "../state/BoardProvider";
import { isTextField } from "../state/keys";
import { setMainTag } from "../tags/mainTag";
import { TagChips } from "../tags/TagChips";
import { TagDots } from "../tags/TagDots";
import { TagPicker } from "../tags/TagPicker";
import { useDismiss } from "../ui/useDismiss";
import { NoteEditor } from "./NoteEditor";
import { PeekButton, PeekText, usePeek } from "./PeekLines";
import { POPOVER_MARGIN, popoverPlace } from "./place";
import { previewText } from "./preview";

export const MARK_POPOVER_WIDTH = 320;
export const MARK_POPOVER_HEIGHT = 360;

type Props = { highlight: Highlight; at: DOMRect; addTag?: boolean; onClose: () => void; onConnect: () => void };

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
export function MarkPopover({ highlight, at, addTag: startAdding = false, onClose, onConnect }: Props) {
  const { state, dispatch } = useBoard();
  const [adding, setAdding] = useState(startAdding);
  const notes = notesConnectedTo(state.board, [highlight.id]);
  const peek = usePeek(highlight.anchor.rects);
  const setTags = (tags: string[]) => dispatch({ type: "setTags", target: "highlight", id: highlight.id, tags });
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
      if (event.key === "Escape" && !peek.open) onClose();   // an open peek takes the first Escape (D28)
      if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); remove(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, remove, peek.open]);
  const { box, height } = useMeasuredHeight(MARK_POPOVER_HEIGHT);
  useDismiss(box, onClose, { escape: false });   // its own Escape waits for an open peek
  const { left, top } = popoverPlace(at, MARK_POPOVER_WIDTH, Math.min(height, window.innerHeight - 2 * POPOVER_MARGIN));
  return (
    <div ref={box} className="popover mark-popover" role="dialog" aria-label="Mark" style={{ left, top }} onMouseDown={(e) => e.stopPropagation()}>
      <PeekText peek={peek} side="before" />
      <div className="popover-preview" title={highlight.anchor.quote.exact}>{previewText(highlight.anchor.quote.exact)}</div>
      <PeekText peek={peek} side="after" />
      <div className="mark-tags">
        <TagDots current={highlight.tags[0] ?? null} onPick={(id) => setTags(setMainTag(highlight.tags, id))} />
        <TagChips ids={highlight.tags.slice(1)} />
      </div>
      {adding && <TagPicker value={highlight.tags} onChange={setTags} />}
      {notes.map((n) => <NoteEditor key={n.id} noteId={n.id} origin={n.data.origin ?? "reader"} />)}
      <div className="popover-actions">
        {!adding && <button className="action" onClick={() => setAdding(true)}>Add tag</button>}
        <button className="action" onClick={onConnect} title="Then click another mark or a section heading">Connect</button>
        <button className="action" onClick={addNote}>Add note</button>
        <PeekButton peek={peek} />
        <button className="action" onClick={remove} title="Delete">Remove</button>
      </div>
    </div>
  );
}
