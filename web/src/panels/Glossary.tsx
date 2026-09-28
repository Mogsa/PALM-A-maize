import { useMemo } from "react";
import type { AiGlossaryEntry } from "../ai/terms";
import { firstLine } from "../model/notes";
import type { PageRect } from "../model/types";
import { NoteMarkdown } from "../notes/NoteMarkdown";
import { termTagIds, glossary, type GlossaryEntry } from "../paper/term";
import { useBoard, useNote } from "../state/BoardProvider";
import { useTags } from "../state/TagsProvider";

/** How much of the reader's definition a row shows: its first line. */
export const GLOSSARY_LINE_CHARS = 120;

type Props = {
  onJump: (at: PageRect) => void;
  onOpenNote: (noteId: string) => void;
  /** The AI's terms the reader has not kept, computed once by App (it counts them too). */
  aiTerms?: AiGlossaryEntry[];
};

function Definition({ noteId, onOpen }: { noteId: string; onOpen: (id: string) => void }) {
  const { text } = useNote(noteId);
  const line = firstLine(text ?? "", GLOSSARY_LINE_CHARS);
  if (!line) return <span className="hint">Your note is empty</span>;
  return (
    <button type="button" className="definition" onClick={() => onOpen(noteId)} title="Open your note">
      <NoteMarkdown text={line} />
    </button>
  );
}

function Row({ entry, onJump, onOpenNote }: { entry: GlossaryEntry } & Props) {
  return (
    <li>
      <button type="button" className="term" onClick={() => onJump(entry.highlight.anchor.rects[0])} title="Go to where it is used">{entry.term}</button>
      {entry.noteId ? <Definition noteId={entry.noteId} onOpen={onOpenNote} /> : <span className="hint">No definition of yours yet</span>}
    </li>
  );
}

/** Every mark tagged term in this paper, alphabetically (D27): the term, the first line of the reader's own
 *  definition, and a jump to where it is used. Nothing is edited here; a definition opens its note. */
export function Glossary({ aiTerms: aiEntries = [], ...props }: Props) {
  const { state } = useBoard();
  const { tags } = useTags();
  const entries = useMemo(() => glossary(state.board, termTagIds(tags)), [state.board, tags]);
  return (
    <section className="glossary" aria-label="Glossary">
      <h3>Glossary</h3>
      {!entries.length && !aiEntries.length && <p className="hint">Tag a marked word <i>term</i> and it is listed here.</p>}
      <ul>
        {entries.map((entry) => <Row key={entry.highlight.id} entry={entry} {...props} />)}
        {aiEntries.map((e) => (
          <li key={`ai-${e.term}`} className="ai">
            <span className="term">{e.term}</span> <span className="ai-badge">AI</span>
            {e.explanation && <span className="hint">{e.explanation}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
