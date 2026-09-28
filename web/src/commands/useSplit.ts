import { useRef, useState } from "react";
import { FLUSH_FAILED_MESSAGE, useBoard } from "../state/BoardProvider";

export const SPLIT_FAILED_MESSAGE = "Could not add the missing sections. Nothing was added.";
const splitDone = (added: number) => (added ? `Added ${added} piece${added === 1 ? "" : "s"} to the tray` : "Every section and figure is already on the board");
/** A failed save before the split says why in its own words; anything else is the split's own failure. */
const splitFailed = (failure: unknown) => (failure instanceof Error && failure.message === FLUSH_FAILED_MESSAGE ? FLUSH_FAILED_MESSAGE : SPLIT_FAILED_MESSAGE);

/** "Add missing sections" (split, D16): every section and figure the board lacks, into the tray. */
export function useSplit() {
  const { split } = useBoard();
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const running = useRef(false);   // ⌘K keeps an older `run`, which sees a stale `busy`
  const run = async () => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    try {
      setSaid(splitDone(await split()));
    } catch (failure) {
      console.error(SPLIT_FAILED_MESSAGE, failure);
      setSaid(splitFailed(failure));
    } finally {
      running.current = false;
      setBusy(false);
    }
  };
  return { busy, said, run };
}
