import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "../api/client";
import { registerCommands } from "../commands/registry";
import type { PageRect } from "../model/types";
import { useBoard } from "../state/BoardProvider";
import { aiCommands } from "./commands";
import { NO_AI, type AiFile, type AiStatus, type Definition, type SlotSpans } from "./types";

/** How often the status is re-read while a pass started elsewhere (another tab, before a reload) runs. */
export const AI_POLL_MS = 3000;

export type AiContext = {
  on: boolean; status: AiStatus["status"]; message: string | null; stale: boolean;
  /** The pass's answer, or null when AI help is off, has nothing yet, or is stale: everything AI reads this. */
  ai: AiFile | null;
  setOn: (on: boolean) => void; redo: () => void; addDefinition: (key: string, d: Definition) => void;
  outlined: SlotSpans | null; toggleSlot: (slot: SlotSpans) => void; goTo: (at: PageRect) => void;
};

const Ctx = createContext<AiContext | null>(null);
const failure = (error: unknown) => (error instanceof Error ? error.message : "AI help could not run: unknown error");

/** AI help for one paper (spec B2): off, nothing is read or sent. On, it reads ai.json, runs the pass when there is
 *  none, and on a failure says so in one line and turns itself off. It never touches the board. */
export function AiProvider({ children, goTo }: { children: ReactNode; goTo: (at: PageRect) => void }) {
  const { paperId, view, setView } = useBoard();
  const on = view.ai;
  const [status, setStatus] = useState<AiStatus>(NO_AI);
  const [outlined, setOutlined] = useState<SlotSpans | null>(null);
  const running = useRef(false);

  const run = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setStatus((s) => ({ ...s, status: "running", message: null }));
    try {
      setStatus(await api.runAi(paperId));
    } catch (error) {
      setStatus({ ...NO_AI, status: "failed", message: failure(error) });
      setView({ ai: false });
    } finally {
      running.current = false;
    }
  }, [paperId, setView]);

  useEffect(() => {
    if (!on) return;
    let live = true;
    api.getAi(paperId).then((s) => {
      if (!live) return;
      setStatus(s);
      if (s.status === "none") void run();
    }).catch((error: unknown) => live && setStatus({ ...NO_AI, status: "failed", message: failure(error) }));
    return () => { live = false; };
  }, [on, paperId, run]);

  useEffect(() => {   // a pass this tab did not start: wait for it
    if (!on || status.status !== "running" || running.current) return;
    const timer = setInterval(() => void api.getAi(paperId).then(setStatus).catch(() => {}), AI_POLL_MS);
    return () => clearInterval(timer);
  }, [on, status.status, paperId]);

  const addDefinition = useCallback((key: string, d: Definition) => setStatus((s) => (s.ai
    ? { ...s, ai: { ...s.ai, defined: { ...s.ai.defined, [key]: d } } }
    : { ...s, ai: { schema: 1, extracted_at: "", reader: null, defined: { [key]: d } } })), []);

  const toggleSlot = useCallback((slot: SlotSpans) => {
    setOutlined((current) => (current?.slot === slot.slot ? null : slot));
    const first = slot.spans.find((g) => g.at)?.at;
    if (first && outlined?.slot !== slot.slot) goTo(first);
  }, [goTo, outlined]);

  const value = useMemo<AiContext>(() => ({
    on, status: on ? status.status : "none", message: status.message, stale: on && status.stale,
    ai: on && !status.stale ? status.ai : null,
    setOn: (next) => { setOutlined(null); setView({ ai: next }); if (next) setStatus((s) => ({ ...s, message: null })); },
    redo: () => void run(), addDefinition, outlined: on ? outlined : null, toggleSlot, goTo,
  }), [on, status, setView, run, addDefinition, outlined, toggleSlot, goTo]);

  useEffect(() => registerCommands(() => aiCommands({ on: value.on, setOn: value.setOn, redo: value.redo })),
    [value.on, value.setOn, value.redo]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAi(): AiContext {
  const ai = useContext(Ctx);
  if (!ai) throw new Error("useAi outside AiProvider");
  return ai;
}
