import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "../api/client";
import { registerCommands, registerSelectionItems } from "../commands/registry";
import type { PageRect } from "../model/types";
import { useBoard } from "../state/BoardProvider";
import { aiCommands } from "./commands";
import { defineAction } from "./defineAction";
import { NO_AI, type AiFile, type AiStatus, type Definition } from "./types";

/** How often the status is re-read while a pass started elsewhere (another tab, before a reload) runs. */
export const AI_POLL_MS = 3000;

export type AiContext = {
  on: boolean; status: AiStatus["status"]; message: string | null; stale: boolean;
  /** The pass's answer, or null when AI help is off, has nothing yet, or is stale: everything AI reads this. */
  ai: AiFile | null;
  setOn: (on: boolean) => void; redo: () => void; addDefinition: (key: string, d: Definition) => void;
  goTo: (at: PageRect) => void;
};

const Ctx = createContext<AiContext | null>(null);
const failure = (error: unknown) => (error instanceof Error ? error.message : "AI help could not run: unknown error");

/** AI help for one paper (spec B2): off, nothing is read or sent. On, it reads ai.json, runs the pass when there is
 *  none, and on a failure says so in one line and turns itself off. It never touches the board. */
export function AiProvider({ children, goTo }: { children: ReactNode; goTo: (at: PageRect) => void }) {
  const { paperId, view, setView, flushView } = useBoard();
  const on = view.ai;
  const [status, setStatus] = useState<AiStatus>(NO_AI);
  const running = useRef(false);

  /** Spec B3: any error is one plain line and leaves AI help off. */
  const fail = useCallback((error: unknown) => {
    setStatus({ ...NO_AI, status: "failed", message: failure(error) });
    setView({ ai: false });
  }, [setView]);

  const run = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setStatus((s) => ({ ...s, status: "running", message: null }));
    try {
      setStatus(await api.runAi(paperId));
    } catch (error) {
      fail(error);
    } finally {
      running.current = false;
    }
  }, [paperId, fail]);

  useEffect(() => {
    if (!on) return;
    let live = true;
    // The server refuses a pass while view.json says off, and turning on only schedules that write: save it first.
    flushView().then(() => api.getAi(paperId)).then((s) => {
      if (!live) return;
      setStatus(s);
      if (s.status === "none") void run();
    }).catch((error: unknown) => { if (live) fail(error); });
    return () => { live = false; };
  }, [on, paperId, run, fail, flushView]);

  useEffect(() => {   // a pass this tab did not start: wait for it
    if (!on || status.status !== "running" || running.current) return;
    const timer = setInterval(() => void api.getAi(paperId).then(setStatus).catch((error: unknown) => {
      clearInterval(timer);
      fail(error);
    }), AI_POLL_MS);
    return () => clearInterval(timer);
  }, [on, status.status, paperId, fail]);

  const addDefinition = useCallback((key: string, d: Definition) => setStatus((s) => (s.ai
    ? { ...s, ai: { ...s.ai, defined: { ...s.ai.defined, [key]: d } } }
    : { ...s, ai: { schema: 1, extracted_at: "", reader: null, defined: { [key]: d } } })), []);

  const value = useMemo<AiContext>(() => ({
    on, status: on ? status.status : "none", message: status.message, stale: on && status.stale,
    ai: on && !status.stale ? status.ai : null,
    setOn: (next) => { setView({ ai: next }); if (next) setStatus((s) => ({ ...s, message: null })); },
    redo: () => void run(), addDefinition, goTo,
  }), [on, status, setView, run, addDefinition, goTo]);

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
