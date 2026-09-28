import { useMemo } from "react";
import { aiGlossary } from "../ai/terms";
import type { AiFile } from "../ai/types";
import { firstLine } from "../model/notes";
import type { PageRect } from "../model/types";
import { NoteMarkdown } from "../notes/NoteMarkdown";
import { termTagIds, glossary, type GlossaryEntry } from "../paper/term";
import { useBoard, useNote } from "../state/BoardProvider";
import { useTags } from "../state/TagsProvider";

/** How much of the reader's definition a row shows: its first line. */
export const GLOSSARY_LINE_CHARS = 120;

// `ai`/`aiStale` are optional: Task 9's AiProvider passes them once built (useAi().ai, useAi().status.stale).
// Absent, the Glossary works unchanged and shows no AI rows.
type Props = {
  onJump: (at: PageRect) => void;
  onOpenNote: (noteId: string) => void;
  ai?: AiFile | null;
  aiStale?: boolean;
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
export function Glossary({ ai, aiStale, ...props }: Props) {
  const { state } = useBoard();
  const { tags } = useTags();
  const entries = useMemo(() => glossary(state.board, termTagIds(tags)), [state.board, tags]);
  const aiEntries = useMemo(
    () => (ai && !aiStale ? aiGlossary(ai, entries.map((e) => e.term)) : []),
    [ai, aiStale, entries],
  );
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
