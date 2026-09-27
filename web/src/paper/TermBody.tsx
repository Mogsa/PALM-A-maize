import { useMemo } from "react";
import type { Highlight, PageRect } from "../model/types";
import { NoteMarkdown } from "../notes/NoteMarkdown";
import { useBoard, useNote } from "../state/BoardProvider";
import { termCard, type TermPart } from "./term";

type Props = { highlight: Highlight; onGo: (at: PageRect) => void; onOpenNote: (noteId: string) => void };

function ReaderDefinition({ noteId, onOpen }: { noteId: string; onOpen: (id: string) => void }) {
  const { text } = useNote(noteId);
  if (!text?.trim()) return null;
  return (
    <section className="term-part">
      <div className="citation-label">Your definition</div>
      <NoteMarkdown text={text} />
      <button type="button" className="quiet" onClick={() => onOpen(noteId)}>Open your note</button>
    </section>
  );
}

function PaperDefinition({ part, onGo }: { part: Extract<TermPart, { kind: "definition" }>; onGo: Props["onGo"] }) {
  return (
    <section className="term-part">
      <div className="citation-label">In this paper <span className="where">p{part.page + 1}{part.section ? ` · ${part.section}` : ""}</span></div>
      <p className="citation-text">{part.sentence}</p>
      <div className="popover-actions">
        <button className="action" onClick={() => onGo({ page: part.page, rect: [0, 0, 0, 0] })} title="Jump to this page of the paper">Go there</button>
      </div>
    </section>
  );
}

/** A term's card (D27): the reader's own definition, then the paper's likely definition by D25's rules. Look up
 *  elsewhere is on the mark's right-click. */
export function TermBody({ highlight, onGo, onOpenNote }: Props) {
  const { state, source } = useBoard();
  const parts = useMemo(() => termCard(state.board, source, highlight), [state.board, source, highlight]);
  return (
    <>
      {parts.map((part) => {
        switch (part.kind) {
          case "note": return <ReaderDefinition key="note" noteId={part.noteId} onOpen={onOpenNote} />;
          case "definition": return <PaperDefinition key="definition" part={part} onGo={onGo} />;
        }
      })}
    </>
  );
}
