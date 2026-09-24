import { useState } from "react";
import { api } from "../api/client";
import { useBoard, useNote } from "../state/BoardProvider";
import { SketchEditor } from "./SketchEditor";

/** A note's sketch, shown above its text (D23); nothing when it has none. Its URL changes with every save. */
export function NoteSketch({ noteId }: { noteId: string }) {
  const { paperId } = useBoard();
  const { hasSketch, sketchVersion } = useNote(noteId);
  if (!hasSketch) return null;
  return <img className="note-sketch" src={api.sketchUrl(paperId, noteId, sketchVersion)} alt="Sketch" draggable={false} />;
}

/** The Sketch action: a button that opens the drawing surface for this note. */
export function SketchButton({ noteId, className = "" }: { noteId: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={`quiet sketch-action ${className}`} onClick={() => setOpen(true)} title="Draw on this note">Sketch</button>
      {open && <SketchEditor noteId={noteId} onClose={() => setOpen(false)} />}
    </>
  );
}
