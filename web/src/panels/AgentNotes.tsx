import { useRef, useState } from "react";
import { agentNoteMarkdown, placedAgentNote, targetOf, type AgentNote } from "../agent/agentNotes";
import type { AgentNotesState } from "../agent/useAgentNotes";
import { api } from "../api/client";
import type { PageRect } from "../model/types";
import { NoteMarkdown } from "../notes/NoteMarkdown";
import { useBoard } from "../state/BoardProvider";

type Props = { agent: AgentNotesState; onJump: (at: PageRect) => void; onOpenNote: (id: string) => void };

function Entry({ note, agent, onJump, onOpenNote }: { note: AgentNote } & Props) {
  const { paperId, dispatch, state, notes } = useBoard();
  const [placing, setPlacing] = useState(false);
  const placingNow = useRef(false);   // a ref too: two clicks before the next render would both see the old state
  const target = targetOf(state.board, note.on);
  /** The text is written first, so the card never opens empty; the file is marked placed only once the note is on the
   *  board. Nothing reaches the board but by this button (Principle 1). */
  const put = async () => {
    if (placingNow.current) return;
    placingNow.current = true;
    setPlacing(true);
    try {
      const placed = placedAgentNote(state.board, note);
      await notes.save(placed.note.id, agentNoteMarkdown(note));
      dispatch({ type: "add", nodes: [placed.note], edges: placed.edges });
      await api.placeAgentNote(paperId, note.file);
      await agent.refresh();
    } catch (error) {
      console.error(`Could not put ${note.file} on the board`, error);
    } finally {
      placingNow.current = false;
      setPlacing(false);
    }
  };
  const jump = () => {
    if (target?.kind === "highlight") onJump(target.at);
    else if (target) onOpenNote(target.id);
  };
  return (
    <li>
      <div className="agent-note-head">
        <span className="ai-label">AI</span>
        {note.title && <strong className="agent-note-title">{note.title}</strong>}
      </div>
      {target && (
        <button type="button" className="chip" onClick={jump} title={target.kind === "highlight" ? "Go to it in the paper" : "Open it on the board"}>
          {target.label}
        </button>
      )}
      <div className="agent-note-text"><NoteMarkdown text={note.text} /></div>
      <div className="agent-note-foot">
        <span className="hint">{note.file}</span>
        <button type="button" className="quiet" disabled={placing} onClick={() => void put()}
                title="Make it a note on your board, marked AI">Put on board</button>
      </div>
    </li>
  );
}

/** Notes an AI agent wrote into this paper's `agent/` folder (bring-your-own-agent spec), newest first. Each stays off
 *  the board until the reader puts it there, and stays marked AI when they do. */
export function AgentNotes(props: Props) {
  const { notes } = props.agent;
  return (
    <section className="agent-notes" aria-label="Agent notes">
      <h3>Agent notes <span className="ai-badge">AI</span></h3>
      {!notes.length && (
        <p className="hint">
          Open your Paper Board folder in the AI agent you use and ask it about this paper. It follows AGENTS.md and
          writes its notes into the paper's agent folder; they are listed here.
        </p>
      )}
      <ul>{notes.map((note) => <Entry key={note.file} note={note} {...props} />)}</ul>
    </section>
  );
}
