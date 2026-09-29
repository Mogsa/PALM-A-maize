import { useAi } from "./AiProvider";

/** The top bar's one line about AI help: reading, failed, or out of date. Nothing when there is nothing to say. */
export function AiStatus() {
  const { on, status, message, stale } = useAi();
  if (message) return <span className="ai-status failed" role="status">{message}</span>;
  if (!on) return null;
  if (status === "running") return <span className="ai-status" role="status">AI reading…</span>;
  if (stale) return <span className="ai-status" role="status">AI notes are from an older reading of this paper: Redo AI pass in ⌘K</span>;
  return null;
}
