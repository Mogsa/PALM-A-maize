import { useState } from "react";
import { FLUSH_FAILED_MESSAGE, useBoard } from "../state/BoardProvider";

export const SPLIT_FAILED_MESSAGE = "Could not split the paper. Nothing was added.";
const splitDone = (added: number) => (added ? `Added ${added} piece${added === 1 ? "" : "s"} to the tray` : "Every section and figure is already on the board");
/** A failed save before the split says why in its own words; anything else is the split's own failure. */
const splitFailed = (failure: unknown) => (failure instanceof Error && failure.message === FLUSH_FAILED_MESSAGE ? FLUSH_FAILED_MESSAGE : SPLIT_FAILED_MESSAGE);

type Props = { onAddGroup: () => void; onAddNote: () => void };

export function BoardTools({ onAddGroup, onAddNote }: Props) {
  const { split } = useBoard();
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const runSplit = async () => {
    setBusy(true);
    try {
      setSaid(splitDone(await split()));
    } catch (failure) {
      console.error(SPLIT_FAILED_MESSAGE, failure);
      setSaid(splitFailed(failure));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="board-tools">
      <button onClick={onAddGroup} title="A rectangle to pile pieces in. Drag pieces wholly inside it."><span aria-hidden="true">▢</span> New group</button>
      <button onClick={onAddNote} title="A note in your own words"><span aria-hidden="true">✎</span> New note</button>
      <button onClick={() => void runSplit()} disabled={busy} title="Add every section and figure the board does not have yet, into the tray">
        <span aria-hidden="true">✂</span> Split
      </button>
      {said && <span className="tool-note" role="status">{said}</span>}
    </div>
  );
}
