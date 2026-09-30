import { useEffect, useRef, useState } from "react";
import { api } from "../../api/client";
import { registerCommands, registerSelectionItems, type Command, type MenuItem } from "../../commands/registry";
import { useBoard } from "../../state/BoardProvider";
import { partialField } from "../partial";
import type { AskAnswer, AskTurn } from "./types";

/** One turn on screen: `text` fills as the answer streams; `answer` or `error` ends it. */
export type ChatEntry = { question: string; selection: string | null; text: string; answer: AskAnswer | null; error: string | null };

export const isStreaming = (e: ChatEntry) => !e.answer && !e.error;

/** What the next question carries back: every finished turn, answers without their grounds. The server leaves the
 *  oldest out only past its budget, and says so. */
export const sentHistory = (entries: ChatEntry[]): AskTurn[] =>
  entries.flatMap((e) => (e.answer ? [{ question: e.question, answer: e.answer.answer }] : []));

const failure = (error: unknown) => (error instanceof Error ? error.message : "AI help could not run.");

/** The chat on screen. New chat clears it (chat.jsonl keeps it); an answer still coming for a cleared chat is dropped. */
export function useAsk(paperId: string) {
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const chat = useRef(0);
  const ask = async (question: string, selection: string | null, useMarks: boolean) => {
    const mine = chat.current;
    const index = entries.length;
    const history = sentHistory(entries);
    setEntries((all) => [...all, { question, selection, text: "", answer: null, error: null }]);
    const update = (patch: Partial<ChatEntry>) => {
      if (chat.current === mine) setEntries((all) => all.map((e, i) => (i === index ? { ...e, ...patch } : e)));
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
  const newChat = () => { chat.current += 1; setEntries([]); };
  return { entries, busy: entries.some(isStreaming), ask, newChat };
}

const words = (text: string) => text.replace(/\s+/g, " ").trim();

/** ⌘K "Ask", only while AI help is on (spec: off, no Ask command). */
export const askCommands = (on: boolean, open: () => void): Command[] =>
  on ? [{ id: "ai-ask", label: "Ask", keywords: "question chat AI", run: open }] : [];

/** A selection's › "Ask about this": the panel opens with the words quoted as the question's subject. */
export function askAboutThis(on: boolean, text: string, open: (selection: string) => void): MenuItem | null {
  const selection = words(text);
  return on && selection ? { id: "ai-ask-about", label: "Ask about this", run: () => open(selection) } : null;
}

export type AskPanelState = ReturnType<typeof useAskPanel>;

/** Everything the Ask panel keeps while it is closed, and its ways in: ⌘K and a selection's ›. With AI help off
 *  nothing is offered and the panel closes. `open` and `close` must be stable. */
export function useAskPanel({ on, open, close }: { on: boolean; open: () => void; close: () => void }) {
  const { paperId } = useBoard();
  const chat = useAsk(paperId);
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
