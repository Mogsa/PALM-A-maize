import { useCallback, useEffect, useState } from "react";
import { api } from "./api/client";
import { CUT_DRAG_TYPE, offerCut, withdrawCut } from "./board/cutDrag";
import { extraSelectionItems, type MenuItem } from "./commands/registry";
import { newId } from "./model/ids";
import { newEdge } from "./model/links";
import { newNote } from "./model/notes";
import { spotForNoteOn } from "./model/placement";
import type { XY } from "./model/reparent";
import { sectionLabel } from "./model/sections";
import type { Highlight, PageRect, PaperScroll, Section, SelectionMode } from "./model/types";
import { makeCut } from "./paper/cut";
import { FindPanel, useFind } from "./paper/FindPanel";
import { Hint } from "./hints/Hint";
import type { PaperHit } from "./paper/hit";
import type { JumpTarget } from "./paper/margin";
import { MarkMenu } from "./paper/MarkMenu";
import { MarkPopover } from "./paper/MarkPopover";
import { ContextMenu } from "./ui/ContextMenu";
import { PaperView } from "./paper/PaperView";
import { SelectionPopover } from "./paper/SelectionPopover";
import { previewText } from "./paper/preview";
import { useConnect } from "./paper/useConnect";
import { useHoverCard } from "./paper/useHoverCard";
import { useBoard } from "./state/BoardProvider";

/** A selection waiting for a choice: dragged text, a Shift-drag rectangle ("area"), or a clicked heading (`section`).
 *  `lines` is dragged text's own lines (contract 1). */
type Pending = {
  rects: PageRect[]; lines?: PageRect[]; at: DOMRect; exact: boolean; text: string; preview: string; mode: SelectionMode; section?: Section;
};
type OpenMark = { id: string; at: DOMRect; addTag?: boolean };

export const SELECTION_FAILED_MESSAGE = "Could not read that selection from the paper. Nothing was added.";

type Props = {
  focus: PageRect | null; onFocusHandled: () => void; onOpenOnBoard: (nodeId: string) => void;
  findRequest: { text: string } | null; onFindHandled: () => void;
};

export function PaperScreen({ focus, onFocusHandled, onOpenOnBoard, findRequest, onFindHandled }: Props) {
  const board = useBoard();
  const { state, dispatch, source, paperId, view, setView } = board;
  const hover = useHoverCard();
  const [pending, setPending] = useState<Pending | null>(null);
  const [openMark, setOpenMark] = useState<OpenMark | null>(null);
  const [markMenu, setMarkMenu] = useState<OpenMark | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jump, setJump] = useState<PageRect | null>(null);
  const connect = useConnect(setError);
  const find = useFind(setJump, (text) => board.activity.log("read", "find", { text }));
  // Find in paper asked for from ⌘K or a card: a fresh object each time, consumed once.
  const openFind = find.open;
  useEffect(() => {
    if (!findRequest) return;
    openFind(findRequest.text);
    onFindHandled();
  }, [findRequest, openFind, onFindHandled]);
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

  /** Highlight (with a main tag, or plain) or cut the selection `p`. Resolves to the highlight made, if one was. */
  const chooseFor = async (p: Pending, kind: "highlight" | "cut", tagId: string | null = null, at?: XY): Promise<Highlight | null> => {
    setBusy(true);
    setError(null);
    let made: Highlight | null = null;
    try {
      const selection = await api.postText(paperId, p.rects, !p.exact, p.mode, p.lines);
      if (kind === "highlight") {
        made = { id: newId("h"), tags: tagId ? [tagId] : [], anchor: selection.highlight };
        dispatch({ type: "addHighlight", highlight: made });
      } else dispatch({ type: "addNode", node: await makeCut(paperId, source, state.board, selection, { mode: p.mode, sectionId: p.section?.id, at }) });
    } catch (failure) {
      console.error(SELECTION_FAILED_MESSAGE, failure);
      setError(SELECTION_FAILED_MESSAGE);
    } finally {
      setBusy(false);
      setPending(null);
      window.getSelection()?.removeAllRanges();
    }
    return made;
  };
  const choose = (kind: "highlight" | "cut", tagId: string | null = null) => (pending ? chooseFor(pending, kind, tagId) : Promise.resolve(null));

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
  /** Selected words dragged onto the board are cut there (spec A2). The popover goes; the drop does the rest. */
  const onDragSelection = (event: React.DragEvent, rects: PageRect[], lines?: PageRect[]) => {
    event.dataTransfer.setData(CUT_DRAG_TYPE, "paper");
    event.dataTransfer.effectAllowed = "copy";
    const p: Pending = { rects, lines, at: new DOMRect(), exact: false, mode: "text", text: "", preview: "" };
    setPending(null);
    offerCut(async (at) => { await chooseFor(p, "cut", null, at); });
  };
  useEffect(() => {
    const end = () => withdrawCut();
    window.addEventListener("dragend", end);
    return () => window.removeEventListener("dragend", end);
  }, []);
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

  /** A note of the reader's own, connected to the mark: one undo step (SPEC 5.1). */
  const addNoteOn = (h: Highlight) => {
    const note = newNote({ ...spotForNoteOn({ ...state.board, highlights: [...state.board.highlights, h] }, h.id), origin: "reader" });
    dispatch({ type: "add", nodes: [note], edges: [newEdge(h.id, note.id)] });
  };
  /** A selection's ›: each item first makes a plain highlight, then acts on it (a mark is what these act on). */
  const selectionMenu = (p: Pending): MenuItem[] => {
    if (p.section) return [];
    const markThen = (then: (h: Highlight) => void) => () => { void chooseFor(p, "highlight").then((h) => { if (h) then(h); }); };
    return [
      { id: "add-tag", label: "Add tag", run: markThen((h) => setOpenMark({ id: h.id, at: p.at, addTag: true })) },
      { id: "connect", label: "Connect", run: markThen((h) => connect.start(h.id)) },
      { id: "add-note", label: "Add note", run: markThen(addNoteOn) },
      { id: "ask", label: "Ask elsewhere", run: markThen((h) => setMarkMenu({ id: h.id, at: p.at })) },
      ...extraSelectionItems({
        on: "paper", text: p.text, rects: p.rects, at: p.at,
        openDefine: (term, at) => hover.open(term, p.at, { kind: "aiTerm", term, at }),
      }, board),
    ];
  };

  const selectionPopover = (p: Pending) => {
    const piece = existingPiece(p.section);
    return <SelectionPopover at={p.at} preview={p.preview} busy={busy} canHighlight={!p.section}
                             onHighlight={(tagId) => void choose("highlight", tagId)} onCut={() => choose("cut")} onDismiss={() => setPending(null)}
                             onOpen={piece ? () => { setPending(null); onOpenOnBoard(piece.id); } : undefined}
                             onFind={p.text.trim() ? () => { find.open(p.text); setPending(null); } : undefined}
                             menu={selectionMenu(p)} />;
  };

  return (
    <>
      <PaperView paperId={paperId} source={source} board={state.board} focus={jump ?? focus} onFocusHandled={onJumpHandled}
                 onSelect={onSelect} onClickPaper={onClickPaper} onMarkMenu={onMarkMenu} onDragSelection={onDragSelection} onOutlineClick={onOpenOnBoard}
                 connecting={connect.connectingFrom !== null} onJump={onJump} onOpenNote={onOpenOnBoard} findMark={find.findMark}
                 paperScroll={view.paper_scroll} onScrollSettled={onScrollSettled} fit={view.view === "both"} hover={hover} />
      {pending && selectionPopover(pending)}
      {find.query !== null && <FindPanel query={find.query} onQuery={find.edit} onPick={find.pick} onClose={find.close} />}
      <Hint id="drag-cut" when={Boolean(pending && !pending.section && pending.mode === "text") && view.view === "both"} />
      {markOpen && openMark && (
        <MarkPopover highlight={markOpen} at={openMark.at} addTag={openMark.addTag} onClose={() => setOpenMark(null)}
                     onConnect={() => { connect.start(openMark.id); setOpenMark(null); }} />
      )}
      {menuMark && markMenu && (
        <ContextMenu at={markMenu.at} label="Mark" onClose={closeMarkMenu}>
          <MarkMenu highlight={menuMark}
                    onAddTag={() => { setMarkMenu(null); setOpenMark({ id: menuMark.id, at: markMenu.at, addTag: true }); }}
                    onConnect={() => { setMarkMenu(null); connect.start(menuMark.id); }}
                    onAddNote={() => { setMarkMenu(null); addNoteOn(menuMark); }} />
        </ContextMenu>
      )}
      {connect.connectingFrom && (
        <p className="connect-hint" role="status">Click another mark or a section heading to connect. <button className="quiet" onClick={connect.cancel}>Cancel</button></p>
      )}
      {error && <p className="selection-error" role="alert" onClick={() => setError(null)}>{error}</p>}
    </>
  );
}
