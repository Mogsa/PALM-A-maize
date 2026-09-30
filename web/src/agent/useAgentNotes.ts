import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";
import type { AgentNote } from "./agentNotes";

/** How often the open panel re-reads `agent/` (spec: every 5 s while open). */
export const AGENT_POLL_MS = 5000;

export type AgentNotesState = { notes: AgentNote[]; refresh: () => Promise<void> };

/** The notes waiting in the paper's `agent/` folder. Read when the paper opens, when the window regains focus (the
 *  reader coming back from their agent), when the panel opens, and every AGENT_POLL_MS while it is open. */
export function useAgentNotes(paperId: string, open: boolean): AgentNotesState {
  const [notes, setNotes] = useState<AgentNote[]>([]);
  const refresh = useCallback(async () => {
    try {
      setNotes(await api.agentNotes(paperId));
    } catch (error) {
      console.error("Could not read the agent's notes", error);   // what was listed stays listed
    }
  }, [paperId]);
  useEffect(() => {
    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);
  useEffect(() => {
    if (!open) return;
    void refresh();
    const timer = setInterval(() => void refresh(), AGENT_POLL_MS);
    return () => clearInterval(timer);
  }, [open, refresh]);
  return { notes, refresh };
}
