import { useEffect, useRef, useState } from "react";
import { api } from "../../api/client";
import { registerCommands, registerSelectionItems, type Command, type MenuItem } from "../../commands/registry";
import { useBoard } from "../../state/BoardProvider";
import { partialField } from "../partial";
import type { AskAnswer, AskTurn, SavedTurn } from "./types";

/** One turn on screen: `text` fills as the answer streams; `answer` or `error` ends it. `id` is the turn's own, so a
 *  saved chat arriving after a question was asked can go in front of it without moving it. */
export type ChatEntry = { id: number; question: string; selection: string | null; text: string; answer: AskAnswer | null; error: string | null };

export const isStreaming = (e: ChatEntry) => !e.answer && !e.error;

/** What the next question carries back: every finished turn, answers without their grounds. The server leaves the
 *  oldest out only past its budget, and says so. */
export const sentHistory = (entries: ChatEntry[]): AskTurn[] =>
  entries.flatMap((e) => (e.answer ? [{ question: e.question, answer: e.answer.answer }] : []));

const failure = (error: unknown) => (error instanceof Error ? error.message : "AI help could not run.");

/** A saved turn back on screen, its chips from the grounds the server kept. */
const restored = (turn: SavedTurn, id: number): ChatEntry => ({
  id, question: turn.question, selection: turn.selection, text: turn.answer, error: null,
  answer: { answer: turn.answer, grounds: turn.grounds, notes: turn.notes, trimmed: false },
});

/** The chat on screen: the paper's latest saved chat, read back when it opens with AI help on, so the reader goes on
 *  where they left off. New chat clears it and marks the file (which keeps every chat); an answer still coming for a
 *  cleared or left chat is dropped. */
export function useAsk(paperId: string, on: boolean) {
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const chat = useRef(0);
  const nextId = useRef(0);
  useEffect(() => {
    if (!on) return;
    const mine = chat.current;
    api.getChat(paperId).then((turns) => {
      if (chat.current !== mine) return;
      const first = nextId.current;
      nextId.current += turns.length;
      setEntries((all) => [...turns.map((turn, i) => restored(turn, first + i)), ...all]);   // in front of anything asked meanwhile
    }, (error: unknown) => console.error("Could not read the saved chat", error));
    return () => { chat.current += 1; setEntries([]); };
  }, [paperId, on]);
  const ask = async (question: string, selection: string | null, useMarks: boolean) => {
    const mine = chat.current;
    const id = nextId.current++;
    const history = sentHistory(entries);
    setEntries((all) => [...all, { id, question, selection, text: "", answer: null, error: null }]);
    const update = (patch: Partial<ChatEntry>) => {
      if (chat.current === mine) setEntries((all) => all.map((e) => (e.id === id ? { ...e, ...patch } : e)));
    };
    let buffer = "";
    try {
      const answer = await api.ask(paperId, { question, selection, history, use_marks: useMarks }, (delta) => {
        buffer += delta;
        update({ text: partialField(buffer, "answer") });
      });
      update({ answer, text: answer.answer });
    } catch (error) {
      update({ error: failure(error) });
    }
  };
  const newChat = () => {
    chat.current += 1;
    setEntries([]);
    api.newChat(paperId).catch((error: unknown) => console.error("Could not mark the new chat", error));
  };
  return { entries, busy: entries.some(isStreaming), ask, newChat };
}

/** The server's limits (MAX_QUESTION_CHARS and MAX_SELECTION_CHARS in src/paperboard/ask.py): keep them in sync.
 *  A longer question is refused there, so the box stops at it; a longer selection is clipped as `clipSelection` does. */
export const MAX_QUESTION_CHARS = 2000;
export const MAX_SELECTION_CHARS = 4000;

/** At most MAX_SELECTION_CHARS characters, counted as Python counts them: a longer selection keeps its start and
 *  ends in "…", as the server's clip_selection does. */
export function clipSelection(text: string): string {
  const chars = Array.from(text);
  return chars.length <= MAX_SELECTION_CHARS ? text : chars.slice(0, MAX_SELECTION_CHARS - 1).join("") + "…";
}

const words = (text: string) => text.replace(/\s+/g, " ").trim();

/** ⌘K "Ask", only while AI help is on (spec: off, no Ask command). */
export const askCommands = (on: boolean, open: () => void): Command[] =>
  on ? [{ id: "ai-ask", label: "Ask", keywords: "question chat AI", run: open }] : [];

/** A selection's › "Ask about this": the panel opens with the words quoted as the question's subject. */
export function askAboutThis(on: boolean, text: string, open: (selection: string) => void): MenuItem | null {
  const selection = clipSelection(words(text));
  return on && selection ? { id: "ai-ask-about", label: "Ask about this", run: () => open(selection) } : null;
}

export type AskPanelState = ReturnType<typeof useAskPanel>;

/** Everything the Ask panel keeps while it is closed, and its ways in: ⌘K and a selection's ›. With AI help off
 *  nothing is offered and the panel closes. `open` and `close` must be stable. */
export function useAskPanel({ on, open, close }: { on: boolean; open: () => void; close: () => void }) {
  const { paperId } = useBoard();
  const chat = useAsk(paperId, on);
  const [selection, setSelection] = useState<string | null>(null);
  const [useMarks, setUseMarks] = useState(true);
  useEffect(() => registerCommands(() => askCommands(on, open)), [on, open]);
  useEffect(() => registerSelectionItems((target) => {
    const item = askAboutThis(on, target.text, (words) => { setSelection(words); open(); });
    return item ? [item] : [];
  }), [on, open]);
  useEffect(() => { if (!on) close(); }, [on, close]);
  return { chat, selection, setSelection, useMarks, setUseMarks };
}
