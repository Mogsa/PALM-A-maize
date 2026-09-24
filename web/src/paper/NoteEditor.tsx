import { useEffect, useRef, useState } from "react";
import type { NoteOrigin } from "../model/types";
import { NoteMarkdown } from "../notes/NoteMarkdown";
import { NoteSketch, SketchButton } from "../notes/NoteSketch";
import { useNote } from "../state/BoardProvider";

export const READER_PLACEHOLDER = "In your own words…";
export const AI_PLACEHOLDER = "Paste the AI's answer here";

/** One note, shown rendered with its maths (D22) and edited in place as plain text. An empty note is a field ready for
 *  typing. Saves after a pause in typing and when it loses focus; the text area keeps its own undo (addendum 4.7). */
export function NoteEditor({ noteId, origin }: { noteId: string; origin: NoteOrigin }) {
  const { text, error, edit, commit } = useNote(noteId);
  const [editing, setEditing] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (editing) field.current?.focus(); }, [editing]);
  const finish = () => {
    void commit();
    setEditing(false);
  };
  // A click on a link follows the link; anywhere else on the rendered note edits it.
  const editUnlessLink = (event: React.MouseEvent) => { if (!(event.target as Element).closest("a")) setEditing(true); };
  return (
    <div className={`note-editor ${origin}`}>
      {origin === "ai" && <span className="ai-label">AI</span>}
      <NoteSketch noteId={noteId} />
      {editing || !text
        // Read-only until the saved text is here: typing over a note not yet loaded (or that failed to load) would replace it.
        ? <textarea ref={field} value={text ?? ""} readOnly={text === undefined} placeholder={origin === "ai" ? AI_PLACEHOLDER : READER_PLACEHOLDER}
                    aria-label={origin === "ai" ? "AI answer" : "Your note"} onChange={(e) => edit(e.target.value)}
                    onFocus={() => setEditing(true)} onBlur={finish} onKeyDown={(e) => { if (e.key === "Escape") finish(); }} />
        : <div className="note-rendered" onClick={editUnlessLink} title="Click to edit">
            <NoteMarkdown text={text} />
            <button className="quiet note-edit" aria-label="Edit note" onClick={() => setEditing(true)}>Edit</button>
          </div>}
      {error && <p className="note-error" role="alert">{error}</p>}
      <SketchButton noteId={noteId} />
    </div>
  );
}
