import { useEffect, useRef, useState } from "react";
import { useDismiss } from "../ui/useDismiss";
import { api } from "../api/client";
import { newId } from "../model/ids";
import type { ChunkNode, RecutMode } from "../model/types";
import { popoverPlace } from "../paper/place";
import { useBoard } from "../state/BoardProvider";
import type { CardSelection } from "./cardSelection";
import { recutPlan } from "./recut";

const POPOVER_WIDTH = 320;
const POPOVER_HEIGHT = 110;
export const NOT_FOUND_MESSAGE = "These words could not be found in this piece's part of the paper.";
export const NOTHING_TO_DIVIDE = { split: "This is already where the piece starts.", cut: "The selection is already the whole piece." };
const FAILED_MESSAGE = "That did not work. Nothing was changed.";

/** What words selected on a card offer: Highlight when they are selected, Split here and Cut out on a right-click. */
export type TextActions = "highlight" | "recut";

/** Words selected on a card, then a choice (D20, D21). The server finds the words inside the chunk; each action is
 *  one undo step. */
export function TextPopover({ selection, actions = "highlight", onClose }: { selection: CardSelection; actions?: TextActions; onClose: () => void }) {
  const { state, dispatch, paperId } = useBoard();
  const [busy, setBusy] = useState(false);
  // What was said belongs to the selection it was said about; a new selection starts with nothing said.
  const [said, setSaid] = useState<{ about: CardSelection; text: string } | null>(null);
  const chunk = state.board.nodes.find((n): n is ChunkNode => n.id === selection.nodeId && n.type === "chunk");
  const box = useRef<HTMLDivElement>(null);
  useDismiss(box, onClose);
  useEffect(() => { if (!chunk) onClose(); }, [chunk, onClose]);   // undone or deleted meanwhile
  if (!chunk) return null;

  const run = async (act: () => Promise<string | null>) => {
    setBusy(true);
    try {
      const problem = await act();
      if (problem) setSaid({ about: selection, text: problem });
      else { window.getSelection()?.removeAllRanges(); onClose(); }
    } catch (failure) {
      console.error("board text action failed", failure);
      setSaid({ about: selection, text: (failure as { code?: string }).code === "quote_not_found" ? NOT_FOUND_MESSAGE : FAILED_MESSAGE });
    } finally {
      setBusy(false);
    }
  };
  const highlight = () => run(async () => {
    const anchor = await api.highlightInChunk(paperId, chunk.data.region, selection.quote);
    dispatch({ type: "addHighlight", highlight: { id: newId("h"), tags: [], anchor } });
    return null;
  });
  const recut = (mode: RecutMode) => run(async () => {
    const plan = recutPlan(chunk, await api.recut(paperId, chunk.data.region, selection.quote, mode));
    if (!plan) return NOTHING_TO_DIVIDE[mode];
    dispatch({ type: "reshape", ...plan });
    return null;
  });

  const { left, top } = popoverPlace(selection.at, POPOVER_WIDTH, POPOVER_HEIGHT);
  return (
    <div ref={box} className="popover text-popover" role="dialog" aria-label="Words on the card" style={{ left, top }} onMouseDown={(e) => e.stopPropagation()}>
      <div className="popover-preview" title={selection.quote.exact}>{selection.quote.exact}</div>
      <div className="popover-actions">
        {actions === "highlight" ? (
          <button className="action highlight" disabled={busy} title="Mark these words, here and on the paper" onClick={() => void highlight()}>
            <span className="swatch" aria-hidden="true" />Highlight
          </button>
        ) : (<>
          <button className="action" disabled={busy} title="Divide this piece where the selection starts" onClick={() => void recut("split")}>Split here</button>
          <button className="action" disabled={busy} title="Make the selected lines a piece of their own" onClick={() => void recut("cut")}>
            <span className="glyph" aria-hidden="true">✂</span>Cut out
          </button>
        </>)}
      </div>
      {said?.about === selection && <p className="popover-note" role="status">{said.text}</p>}
    </div>
  );
}
