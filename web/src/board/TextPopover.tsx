import { useEffect, useRef, useState } from "react";
import { useDismiss } from "../ui/useDismiss";
import { api } from "../api/client";
import { newId } from "../model/ids";
import type { ChunkNode, Highlight, RecutMode } from "../model/types";
import type { Reshape } from "../model/boardReducer";
import { extraSelectionItems, type MenuItem } from "../commands/registry";
import { newEdge } from "../model/links";
import { newNote } from "../model/notes";
import { spotForNoteOn } from "../model/placement";
import { AskElsewhere } from "../paper/AskElsewhere";
import { popoverPlace } from "../paper/place";
import { useBoard } from "../state/BoardProvider";
import { TagDots } from "../tags/TagDots";
import { TagPicker } from "../tags/TagPicker";
import { ActionMenu } from "../ui/ActionMenu";
import { useBoardActions } from "./BoardActions";
import type { CardSelection } from "./cardSelection";
import { recutPlan } from "./recut";

const POPOVER_WIDTH = 320;
const POPOVER_HEIGHT = 110;
export const NOT_FOUND_MESSAGE = "These words could not be found in this piece's part of the paper.";
export const NOTHING_TO_DIVIDE = { split: "This is already where the piece starts.", cut: "The selection is already the whole piece." };
const FAILED_MESSAGE = "That did not work. Nothing was changed.";

/** Words selected on a card, then a choice (D20, D21, spec A2): colour dots | Cut out, Find, › (Add tag, Add note, Ask
 *  elsewhere, Split here, extensions). The server finds the words inside the chunk; each action is one undo step. */
export function TextPopover({ selection, menuOpen = false, onClose }: { selection: CardSelection; menuOpen?: boolean; onClose: () => void }) {
  const board = useBoard();
  const { state, dispatch, paperId } = board;
  const { find } = useBoardActions();
  const [busy, setBusy] = useState(false);
  // What was said belongs to the selection it was said about; a new selection starts with nothing said.
  const [said, setSaid] = useState<{ about: CardSelection; text: string } | null>(null);
  const [made, setMade] = useState<{ about: CardSelection; mark: Highlight; then: "tag" | "ask" } | null>(null);
  const chunk = state.board.nodes.find((n): n is ChunkNode => n.id === selection.nodeId && n.type === "chunk");
  const box = useRef<HTMLDivElement>(null);
  useDismiss(box, onClose);
  useEffect(() => { if (!chunk) onClose(); }, [chunk, onClose]);   // undone or deleted meanwhile
  if (!chunk) return null;

  /** Runs an action that either succeeds with a value (handled by `onSuccess`) or fails to say why: a problem
   *  the server reported on purpose, or an exception it threw. Shared by every action below, so the busy flag,
   *  the try/catch and the "why it failed" message are written once. */
  const run = async <T,>(act: () => Promise<{ value: T } | { problem: string }>, onSuccess: (value: T) => void) => {
    setBusy(true);
    try {
      const outcome = await act();
      if ("problem" in outcome) setSaid({ about: selection, text: outcome.problem });
      else onSuccess(outcome.value);
    } catch (failure) {
      console.error("board text action failed", failure);
      setSaid({ about: selection, text: (failure as { code?: string }).code === "quote_not_found" ? NOT_FOUND_MESSAGE : FAILED_MESSAGE });
    } finally {
      setBusy(false);
    }
  };
  const closeAfter = () => { window.getSelection()?.removeAllRanges(); onClose(); };
  const mark = async (tagId: string | null): Promise<Highlight> => {
    const anchor = await api.highlightInChunk(paperId, chunk.data.region, selection.quote);
    return { id: newId("h"), tags: tagId ? [tagId] : [], anchor };
  };
  const highlight = (tagId: string | null) => run(
    async () => ({ value: await mark(tagId) }),
    (h) => { dispatch({ type: "addHighlight", highlight: h }); closeAfter(); },
  );
  const recut = (mode: RecutMode) => run<Reshape>(
    async () => {
      const plan = recutPlan(chunk, await api.recut(paperId, chunk.data.region, selection.quote, mode));
      return plan ? { value: plan } : { problem: NOTHING_TO_DIVIDE[mode] };
    },
    (plan) => { dispatch({ type: "reshape", ...plan }); closeAfter(); },
  );
  /** Add note: the mark and a note of the reader's own connected to it, one undo step. */
  const addNote = () => run(
    async () => ({ value: await mark(null) }),
    (h) => {
      const note = newNote({ ...spotForNoteOn({ ...state.board, highlights: [...state.board.highlights, h] }, h.id), origin: "reader" });
      dispatch({ type: "add", highlights: [h], nodes: [note], edges: [newEdge(h.id, note.id)] });
      closeAfter();
    },
  );
  /** Add tag and Ask elsewhere: the mark first; the popover stays open to show what comes next. */
  const markThen = (then: "tag" | "ask") => void run(
    async () => ({ value: await mark(null) }),
    (h) => { dispatch({ type: "addHighlight", highlight: h }); setMade({ about: selection, mark: h, then }); },
  );
  const menu: MenuItem[] = [
    { id: "add-tag", label: "Add tag", run: () => markThen("tag") },
    { id: "add-note", label: "Add note", run: () => void addNote() },
    { id: "ask", label: "Ask elsewhere", run: () => markThen("ask") },
    { id: "split", label: "Split here", title: "Divide this piece where the selection starts", run: () => void recut("split") },
    ...extraSelectionItems({ on: "card", text: selection.quote.exact, nodeId: chunk.id, quote: selection.quote, at: selection.at }, board),
  ];
  const shown = made?.about === selection ? made : null;
  const liveMark = shown && state.board.highlights.find((h) => h.id === shown.mark.id);

  const { left, top } = popoverPlace(selection.at, POPOVER_WIDTH, POPOVER_HEIGHT);
  return (
    <div ref={box} className="popover text-popover" role="dialog" aria-label="Words on the card" style={{ left, top }} onMouseDown={(e) => e.stopPropagation()}>
      <div className="popover-preview" title={selection.quote.exact}>{selection.quote.exact}</div>
      <div className="popover-actions">
        <TagDots onPick={(tagId) => void highlight(tagId)} disabled={busy} plainLabel="Highlight" />
        <span className="bar-sep" aria-hidden="true" />
        <button className="quiet glyph" aria-label="Cut out" title="Make the selected lines a piece of their own" disabled={busy} onClick={() => void recut("cut")}>✂</button>
        <button className="quiet glyph" aria-label="Find" title="Every place these words appear in the paper" onClick={() => find(selection.quote.exact)}>🔍</button>
        <ActionMenu items={menu} initiallyOpen={menuOpen} />
      </div>
      {liveMark && shown?.then === "tag" && (
        <TagPicker value={liveMark.tags} onChange={(tags) => dispatch({ type: "setTags", target: "highlight", id: liveMark.id, tags })} />
      )}
      {liveMark && shown?.then === "ask" && <AskElsewhere highlight={liveMark} />}
      {said?.about === selection && <p className="popover-note" role="status">{said.text}</p>}
    </div>
  );
}
