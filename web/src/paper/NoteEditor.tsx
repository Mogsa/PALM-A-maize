import { useState } from "react";
import type { NoteOrigin } from "../model/types";
import { useNote } from "../state/BoardProvider";

export const READER_PLACEHOLDER = "In your own words…";
export const AI_PLACEHOLDER = "Paste the AI's answer here";

/** One note, edited in place. Saves when it loses focus; the text area keeps its own undo (addendum 4.7). */
export function NoteEditor({ noteId, origin }: { noteId: string; origin: NoteOrigin }) {
  const { text, error, save } = useNote(noteId);
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft !== null && draft !== text) void save(draft);
    setDraft(null);
  };
  return (
    <div className={`note-editor ${origin}`}>
      {origin === "ai" && <span className="ai-label">AI</span>}
      {/* Read-only until the saved text is here: typing over a note not yet loaded (or that failed to load) would replace it. */}
      <textarea value={draft ?? text ?? ""} readOnly={text === undefined} placeholder={origin === "ai" ? AI_PLACEHOLDER : READER_PLACEHOLDER}
                aria-label={origin === "ai" ? "AI answer" : "Your note"} onChange={(e) => setDraft(e.target.value)} onBlur={commit} />
      {error && <p className="note-error" role="alert">{error}</p>}
    </div>
  );
}
