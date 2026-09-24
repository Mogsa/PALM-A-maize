import { useState } from "react";
import { api } from "./api/client";
import { newId } from "./model/ids";
import { sectionLabel } from "./model/sections";
import type { ChunkNode, PageRect, Section } from "./model/types";
import type { PaperHit } from "./paper/hit";
import { MarkPopover } from "./paper/MarkPopover";
import { PaperView } from "./paper/PaperView";
import { SelectionPopover } from "./paper/SelectionPopover";
import { previewText } from "./paper/preview";
import { nextChunkPosition, CHUNK_WIDTH } from "./board/layout";
import { useBoard } from "./state/BoardProvider";

/** A selection waiting for a choice. `section` is set when it came from a click on a heading. */
type Pending = { rects: PageRect[]; at: DOMRect; exact: boolean; preview: string; section?: Section };
type OpenMark = { id: string; at: DOMRect };

export const SELECTION_FAILED_MESSAGE = "Could not read that selection from the paper. Nothing was added.";

type Props = { focus: PageRect | null; onFocusHandled: () => void; onOpenOnBoard: (nodeId: string) => void };

export function PaperScreen({ focus, onFocusHandled, onOpenOnBoard }: Props) {
  const { state, dispatch, source, paperId } = useBoard();
  const [pending, setPending] = useState<Pending | null>(null);
  const [openMark, setOpenMark] = useState<OpenMark | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const choose = async (kind: "highlight" | "cut") => {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      const selection = await api.postText(paperId, pending.rects, !pending.exact);
      if (kind === "highlight") {
        dispatch({ type: "addHighlight", highlight: { id: newId("h"), tags: [], anchor: selection.highlight } });
      } else {
        const node: ChunkNode = {
          id: newId("n"), type: "chunk", position: nextChunkPosition(state.board.nodes), width: CHUNK_WIDTH,
          data: { tags: [], collapsed: false, region: selection.chunk, blocks: selection.blocks, user_sized: false, source_id: pending.section?.id ?? null },
        };
        dispatch({ type: "addNode", node });
      }
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
    if (hit.mark) { setPending(null); setOpenMark({ id: hit.mark.id, at: hit.at }); return; }
    if (hit.heading) {
      setOpenMark(null);
      setPending({ rects: hit.heading.extent, at: hit.at, exact: true, preview: sectionLabel(hit.heading), section: hit.heading });
    }
  };
  const existingPiece = (section: Section | undefined) =>
    section ? state.board.nodes.find((n) => n.type === "chunk" && n.data.source_id === section.id) : undefined;
  const markOpen = openMark && state.board.highlights.find((h) => h.id === openMark.id);

  const selectionPopover = (p: Pending) => {
    const piece = existingPiece(p.section);
    return <SelectionPopover at={p.at} preview={p.preview} busy={busy} canHighlight={!p.section}
                             onHighlight={() => choose("highlight")} onCut={() => choose("cut")} onDismiss={() => setPending(null)}
                             onOpen={piece ? () => { setPending(null); onOpenOnBoard(piece.id); } : undefined} />;
  };

  return (
    <>
      <PaperView paperId={paperId} source={source} board={state.board} focus={focus} onFocusHandled={onFocusHandled}
                 onSelect={(rects, at, exact) => {
                   setError(null);
                   setOpenMark(null);
                   setPending({ rects, at, exact, preview: previewText(window.getSelection()?.toString() ?? "") });
                 }}
                 onClickPaper={onClickPaper} onOutlineClick={onOpenOnBoard} />
      {pending && selectionPopover(pending)}
      {markOpen && openMark && <MarkPopover highlight={markOpen} at={openMark.at} onClose={() => setOpenMark(null)} onConnect={() => setOpenMark(null)} />}
      {error && <p className="selection-error" role="alert" onClick={() => setError(null)}>{error}</p>}
    </>
  );
}
