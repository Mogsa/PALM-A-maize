import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "../api/client";
import { registerCommands, registerSelectionItems } from "../commands/registry";
import type { PageRect } from "../model/types";
import { useBoard } from "../state/BoardProvider";
import { aiCommands } from "./commands";
import { defineAction } from "./defineAction";
import { keySentences, type KeySentenceGroup } from "./keySentences";
import { NO_AI, type AiFile, type AiStatus, type Definition } from "./types";

/** How often the status is re-read while a pass started elsewhere (another tab, before a reload) runs. */
export const AI_POLL_MS = 3000;

export type AiContext = {
  on: boolean; status: AiStatus["status"]; message: string | null; stale: boolean;
  /** The pass's answer, or null when AI help is off, has nothing yet, or is stale: everything AI reads this. */
  ai: AiFile | null;
  setOn: (on: boolean) => void; redo: () => void; addDefinition: (key: string, d: Definition) => void;
  goTo: (at: PageRect) => void;
  /** The paper's own sentences answering each slot, in the template's order; none when `ai` is null. */
  keySentences: KeySentenceGroup[];
};

const Ctx = createContext<AiContext | null>(null);
const failed = (error: unknown): AiStatus =>
  ({ ...NO_AI, status: "failed", message: error instanceof Error ? error.message : "AI help could not run: unknown error" });

/** AI help for one paper (spec B2): off, nothing is read or sent. On, it reads ai.json, runs the pass when there is
 *  none, and on a failed pass says so in one line and turns itself off. It never touches the board. */
export function AiProvider({ children, goTo }: { children: ReactNode; goTo: (at: PageRect) => void }) {
  const { paperId, view, setView, flushView, activity } = useBoard();
  const on = view.ai;
  const [status, setStatus] = useState<AiStatus>(NO_AI);
  const [slotNames, setSlotNames] = useState<string[]>([]);
  const running = useRef(false);

  /** Spec B3: a failed pass is one plain line and leaves AI help off (the server has already written that). */
  const failPass = useCallback((error: unknown) => {
    setStatus(failed(error));
    setView({ ai: false });
  }, [setView]);
  // A status that could not be read (server restarting, laptop asleep) is not a failed pass: the pass may well be
  // running still. Say so, keep AI help on, and let the poll below ask again.
  const failRead = useCallback((error: unknown) => setStatus(failed(error)), []);

  const run = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setStatus((s) => ({ ...s, status: "running", message: null }));
    try {
      setStatus(await api.runAi(paperId));
    } catch (error) {
      failPass(error);
    } finally {
      running.current = false;
    }
  }, [paperId, failPass]);

  /** A status just read is kept, and a paper with no pass yet gets one. */
  const settle = useCallback((s: AiStatus) => { setStatus(s); if (s.status === "none") void run(); }, [run]);

  useEffect(() => {
    if (!on) return;
    let live = true;
    // The server refuses a pass while view.json says off, and turning on only schedules that write: save it first.
    flushView().then(() => api.getAi(paperId)).then((s) => { if (live) settle(s); })
      .catch((error: unknown) => { if (live) failRead(error); });
    return () => { live = false; };
  }, [on, paperId, settle, failRead, flushView]);

  // The template orders and colours the key sentences. Without it they keep the pass's order, so it is not a failure.
  // Read when AI help turns on and again on every redo: slots renamed or reordered since must match the new pass.
  const readSlotNames = useCallback(() => {
    api.getTemplate().then((t) => setSlotNames(t.slots.map((s) => s.name)),
      (error: unknown) => console.error("Could not read the template; key sentences keep the AI's order", error));
  }, []);
  useEffect(() => { if (on) readSlotNames(); }, [on, readSlotNames]);

  // A pass this tab did not start, or a status it could not read: ask again until the answer is in. "failed" while
  // AI help is on can only be a failed read, since a failed pass turns it off in the same render.
  useEffect(() => {
    if (!on || running.current || (status.status !== "running" && status.status !== "failed")) return;
    const timer = setInterval(() => void api.getAi(paperId).then(settle, failRead), AI_POLL_MS);
    return () => clearInterval(timer);
  }, [on, status.status, paperId, settle, failRead]);

  const addDefinition = useCallback((key: string, d: Definition) => setStatus((s) => (s.ai
    ? { ...s, ai: { ...s.ai, defined: { ...s.ai.defined, [key]: d } } }
    : { ...s, ai: { schema: 1, extracted_at: "", reader: null, defined: { [key]: d } } })), []);

  const value = useMemo<AiContext>(() => {
    const ai = on && !status.stale ? status.ai : null;
    return {
      on, status: on ? status.status : "none", message: status.message, stale: on && status.stale, ai,
      setOn: (next) => {
        activity.log("ai", next ? "on" : "off");   // the reader's switch; a failure turning it off is not logged
        setView({ ai: next });
        if (next) setStatus((s) => ({ ...s, message: null }));
      },
      redo: () => { readSlotNames(); void run(); }, addDefinition, goTo, keySentences: keySentences(ai, slotNames),
    };
  }, [on, status, setView, run, readSlotNames, addDefinition, goTo, slotNames, activity]);

  useEffect(() => registerCommands(() => aiCommands({ on: value.on, setOn: value.setOn, redo: value.redo })),
    [value.on, value.setOn, value.redo]);

  // Define in the selection bar's › (Part B, Task 12): one word or a short phrase, when the caller wired an opener.
  useEffect(() => registerSelectionItems((target) => {
    const at = target.on === "paper" ? (target.rects[0] ?? null) : null;
    const action = defineAction({ on: value.on, text: target.text, at, open: (term, at) => target.openDefine?.(term, at) });
    return action ? [action] : [];
  }), [value.on]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAi(): AiContext {
  const ai = useContext(Ctx);
  if (!ai) throw new Error("useAi outside AiProvider");
  return ai;
}
