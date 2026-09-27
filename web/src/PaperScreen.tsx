import { useCallback, useEffect, useState } from "react";
import { api } from "./api/client";
import { newId } from "./model/ids";
import { sectionLabel } from "./model/sections";
import type { PageRect, PaperScroll, Section, SelectionMode } from "./model/types";
import { makeCut } from "./paper/cut";
import { FindPanel, useFind } from "./paper/FindPanel";
import type { PaperHit } from "./paper/hit";
import type { JumpTarget } from "./paper/margin";
import { AskElsewhere } from "./paper/AskElsewhere";
import { MarkPopover } from "./paper/MarkPopover";
import { ContextMenu } from "./ui/ContextMenu";
import { PaperView } from "./paper/PaperView";
import { SelectionPopover } from "./paper/SelectionPopover";
import { previewText } from "./paper/preview";
import { useConnect } from "./paper/useConnect";
import { useBoard } from "./state/BoardProvider";

/** A selection waiting for a choice: dragged text, a Shift-drag rectangle ("area"), or a clicked heading (`section`).
 *  `lines` is dragged text's own lines (contract 1). */
type Pending = {
  rects: PageRect[]; lines?: PageRect[]; at: DOMRect; exact: boolean; text: string; preview: string; mode: SelectionMode; section?: Section;
};
type OpenMark = { id: string; at: DOMRect };

export const SELECTION_FAILED_MESSAGE = "Could not read that selection from the paper. Nothing was added.";

type Props = { focus: PageRect | null; onFocusHandled: () => void; onOpenOnBoard: (nodeId: string) => void };

export function PaperScreen({ focus, onFocusHandled, onOpenOnBoard }: Props) {
  const { state, dispatch, source, paperId, view, setView } = useBoard();
  const [pending, setPending] = useState<Pending | null>(null);
  const [openMark, setOpenMark] = useState<OpenMark | null>(null);
  const [markMenu, setMarkMenu] = useState<OpenMark | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jump, setJump] = useState<PageRect | null>(null);
  const connect = useConnect(setError);
  const find = useFind(setJump);
  // The shell keeps the paper mounted, only hidden, while the board is shown: nothing of the paper's may stay open
  // there, or its keys (Delete, Escape) would act on the paper behind the board.
  const active = view.view !== "board";
  const cancelConnect = connect.cancel;
  useEffect(() => {
    if (active) return;
    setPending(null);
    setOpenMark(null);
    setMarkMenu(null);
    cancelConnect();
  }, [active, cancelConnect]);

  const choose = async (kind: "highlight" | "cut") => {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      const selection = await api.postText(paperId, pending.rects, !pending.exact, pending.mode, pending.lines);
      if (kind === "highlight") dispatch({ type: "addHighlight", highlight: { id: newId("h"), tags: [], anchor: selection.highlight } });
      else dispatch({ type: "addNode", node: await makeCut(paperId, source, state.board, selection, { mode: pending.mode, sectionId: pending.section?.id }) });
    } catch (failure) {
      console.error(SELECTION_FAILED_MESSAGE, failure);
      setError(SELECTION_FAILED_MESSAGE);
    } finally {
      setBusy(false);
      setPending(null);
      window.getSelection()?.removeAllRanges();
    }
  };

  const onClickPaper = (hit: PaperHit) => {
    setError(null);
    if (connect.connectingFrom) return connect.connectTo(hit);
    if (hit.mark) { setPending(null); setOpenMark({ id: hit.mark.id, at: hit.at }); return; }
    if (hit.heading) {
      setOpenMark(null);
      setPending({ rects: hit.heading.extent, at: hit.at, exact: true, text: "", preview: sectionLabel(hit.heading), mode: "text", section: hit.heading });
    }
  };
  const onSelect = (rects: PageRect[], at: DOMRect, exact: boolean, mode: SelectionMode, lines?: PageRect[]) => {
    setError(null);
    setOpenMark(null);
    const text = window.getSelection()?.toString() ?? "";
    setPending({ rects, lines, at, exact, mode, text, preview: previewText(text) });
  };
  const onJump = (target: JumpTarget) => ("paper" in target ? setJump({ ...target.paper }) : onOpenOnBoard(target.board));
  const onScrollSettled = (scroll: PaperScroll | null) => {
    setView({ paper_scroll: scroll });   // an unchanged scroll saves nothing (withView)
  };
  const onJumpHandled = useCallback(() => { setJump(null); onFocusHandled(); }, [onFocusHandled]);

  const existingPiece = (section: Section | undefined) =>
    section ? state.board.nodes.find((n) => n.type === "chunk" && n.data.source_id === section.id) : undefined;
  const markOpen = openMark && state.board.highlights.find((h) => h.id === openMark.id);
  const menuMark = markMenu && state.board.highlights.find((h) => h.id === markMenu.id);
  const onMarkMenu = (mark: { id: string }, at: DOMRect) => { setPending(null); setOpenMark(null); setMarkMenu({ id: mark.id, at }); };
  const closeMarkMenu = useCallback(() => setMarkMenu(null), []);

  const selectionPopover = (p: Pending) => {
    const piece = existingPiece(p.section);
    return <SelectionPopover at={p.at} preview={p.preview} busy={busy} canHighlight={!p.section}
                             onHighlight={() => choose("highlight")} onCut={() => choose("cut")} onDismiss={() => setPending(null)}
                             onOpen={piece ? () => { setPending(null); onOpenOnBoard(piece.id); } : undefined}
                             onFind={p.text.trim() ? () => { find.open(p.text); setPending(null); } : undefined} />;
  };

  return (
    <>
      <PaperView paperId={paperId} source={source} board={state.board} focus={jump ?? focus} onFocusHandled={onJumpHandled}
                 onSelect={onSelect} onClickPaper={onClickPaper} onMarkMenu={onMarkMenu} onOutlineClick={onOpenOnBoard}
                 connecting={connect.connectingFrom !== null} onJump={onJump} onOpenNote={onOpenOnBoard} findMark={find.findMark}
                 paperScroll={view.paper_scroll} onScrollSettled={onScrollSettled} />
      {pending && selectionPopover(pending)}
      {find.query && <FindPanel query={find.query} onPick={find.pick} onClose={find.close} />}
      {markOpen && openMark && (
        <MarkPopover highlight={markOpen} at={openMark.at} onClose={() => setOpenMark(null)}
                     onConnect={() => { connect.start(openMark.id); setOpenMark(null); }} />
      )}
      {menuMark && markMenu && (
        <ContextMenu at={markMenu.at} label="Mark" onClose={closeMarkMenu}><AskElsewhere highlight={menuMark} /></ContextMenu>
      )}
      {connect.connectingFrom && (
        <p className="connect-hint" role="status">Click another mark or a section heading to connect. <button className="quiet" onClick={connect.cancel}>Cancel</button></p>
      )}
      {error && <p className="selection-error" role="alert" onClick={() => setError(null)}>{error}</p>}
    </>
  );
}
