import { useState, type FormEvent, type KeyboardEvent } from "react";
import { useAi } from "../ai/AiProvider";
import { isStreaming, MAX_QUESTION_CHARS, type AskPanelState, type ChatEntry } from "../ai/ask/useAskPanel";
import { api } from "../api/client";
import { firstLine } from "../model/notes";
import { useBoard, useNote } from "../state/BoardProvider";

/** How much of a note a chip shows: its first line. */
export const NOTE_CHIP_CHARS = 60;

function NoteChip({ noteId, onOpen }: { noteId: string; onOpen: (id: string) => void }) {
  const { text } = useNote(noteId);
  const line = firstLine(text ?? "", NOTE_CHIP_CHARS);
  return (
    <button type="button" className="chip" onClick={() => onOpen(noteId)} title="Open your note">
      Your note{line ? `: ${line}` : ""}
    </button>
  );
}

function Grounds({ entry, onOpenNote }: { entry: ChatEntry; onOpenNote: (id: string) => void }) {
  const { goTo } = useAi();
  const answer = entry.answer!;
  const grounds = answer.grounds.filter((g) => g.at);
  return (
    <>
      {grounds.length > 0
        ? <div className="ask-grounds"><span className="hint">based on</span>
            {grounds.map((g, i) => (
              <button key={i} type="button" className="chip" onClick={() => goTo(g.at!)} title={g.quote}>p{g.at!.page + 1}</button>
            ))}
          </div>
        : <p className="ask-not-found">Not found in the paper: treat with care</p>}
      {answer.notes.length > 0 && (
        <div className="ask-grounds">{answer.notes.map((id) => <NoteChip key={id} noteId={id} onOpen={onOpenNote} />)}</div>
      )}
      {answer.trimmed && <p className="hint">Oldest turns were left out to fit.</p>}
    </>
  );
}

function Turn({ entry, onOpenNote }: { entry: ChatEntry; onOpenNote: (id: string) => void }) {
  return (
    <li>
      {entry.selection && <blockquote>{entry.selection}</blockquote>}
      <p className="ask-question">{entry.question}</p>
      {entry.error
        ? <p className="hint">{entry.error}</p>
        : <p className={`ask-answer ${isStreaming(entry) ? "streaming" : ""}`}>{entry.text}</p>}
      {entry.answer && <Grounds entry={entry} onOpenNote={onOpenNote} />}
    </li>
  );
}

/** Show what's sent: the reader's layer as the server builds it for a question, read afresh each time it opens. */
function WhatIsSent({ useMarks }: { useMarks: boolean }) {
  const { paperId } = useBoard();
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const read = (open: boolean) => {
    if (!open) return;
    setError(null);
    api.askContext(paperId).then(setText, (failure: unknown) => setError(failure instanceof Error ? failure.message : "Could not read it."));
  };
  return (
    <details className="ask-context" onToggle={(e) => read(e.currentTarget.open)}>
      <summary>Show what's sent</summary>
      <p className="hint">With each question: the whole paper, the chat so far{useMarks ? ", and this:" : ". Your highlights and notes are not sent."}</p>
      {useMarks && error && <p className="hint">{error}</p>}
      {useMarks && text !== null && <pre data-testid="ask-context">{text}</pre>}
    </details>
  );
}

type Props = { ask: AskPanelState; onOpenNote: (noteId: string) => void };

/** Ask (spec 2026-09-30): a short chat about the paper, each answer tied to the lines it rests on. It explains and
 *  points; it never writes to the board. */
export function Ask({ ask: { chat, selection, setSelection, useMarks, setUseMarks }, onOpenNote }: Props) {
  const [question, setQuestion] = useState("");
  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const text = question.trim();
    if (!text || chat.busy) return;
    void chat.ask(text, selection, useMarks);
    setQuestion("");
    setSelection(null);
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter that confirms an input method's composition (Japanese, Chinese, …) is not a send.
    const composing = e.nativeEvent.isComposing || e.keyCode === 229;
    if (e.key === "Enter" && !e.shiftKey && !composing) submit(e);
  };
  return (
    <section className="ask" aria-label="Ask">
      <h3>Ask <span className="ai-badge">AI</span>
        {chat.entries.length > 0 && <button type="button" className="quiet new-chat" onClick={chat.newChat}>New chat</button>}
      </h3>
      {!chat.entries.length && <p className="hint">Ask about the paper. Each answer points to the lines it rests on.</p>}
      <ul className="ask-turns">{chat.entries.map((entry, i) => <Turn key={i} entry={entry} onOpenNote={onOpenNote} />)}</ul>
      <form className="ask-form" onSubmit={submit}>
        {selection && (
          <div className="ask-selection">
            <blockquote>{selection}</blockquote>
            <button type="button" className="quiet" aria-label="Remove the quoted words" onClick={() => setSelection(null)}>×</button>
          </div>
        )}
        <textarea aria-label="Question" rows={2} placeholder="Ask about the paper…" value={question} maxLength={MAX_QUESTION_CHARS}
                  onChange={(e) => setQuestion(e.target.value)} onKeyDown={onKey} />
        <div className="ask-actions">
          <label><input type="checkbox" checked={useMarks} onChange={(e) => setUseMarks(e.target.checked)} /> Use my highlights &amp; notes</label>
          <button type="submit" className="action" disabled={chat.busy || !question.trim()}>Send</button>
        </div>
      </form>
      <WhatIsSent useMarks={useMarks} />
    </section>
  );
}
