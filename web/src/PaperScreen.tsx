import { useState } from "react";
import { api } from "./api/client";
import { newId } from "./model/ids";
import type { ChunkNode, PageRect } from "./model/types";
import { PaperView } from "./paper/PaperView";
import { SelectionPopover } from "./paper/SelectionPopover";
import { previewText } from "./paper/preview";
import { nextChunkPosition, CHUNK_WIDTH } from "./board/layout";
import { useBoard } from "./state/BoardProvider";

type Pending = { rects: PageRect[]; at: DOMRect; exact: boolean; preview: string };

export const SELECTION_FAILED_MESSAGE = "Could not read that selection from the paper. Nothing was added.";

export function PaperScreen({ focus, onOpenOnBoard }: { focus: PageRect | null; onOpenOnBoard: (nodeId: string) => void }) {
  const { state, dispatch, source, paperId } = useBoard();
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const choose = async (kind: "highlight" | "cut") => {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      const selection = await api.postText(paperId, pending.rects, !pending.exact);
      if (kind === "highlight") {
        if (!selection.highlight) return;   // the server gives a highlight anchor only for one rect; never cut instead

        dispatch({ type: "addHighlight", highlight: { id: newId("h"), tags: [], note: null, anchor: selection.highlight } });
      } else {
        const node: ChunkNode = {
          id: newId("n"), type: "chunk", position: nextChunkPosition(state.board.nodes), width: CHUNK_WIDTH,
          data: { tags: [], collapsed: false, region: selection.chunk, text: selection.text, user_sized: false, source_id: null },
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

  return (
    <>
      <PaperView paperId={paperId} source={source} board={state.board} focus={focus}
                 onSelect={(rects, at, exact) => {
                   setError(null);
                   setPending({ rects, at, exact, preview: previewText(window.getSelection()?.toString() ?? "") });
                 }}
                 onOutlineClick={onOpenOnBoard} />
      {pending && <SelectionPopover at={pending.at} preview={pending.preview} busy={busy} canHighlight={pending.rects.length === 1} onHighlight={() => choose("highlight")} onCut={() => choose("cut")} onDismiss={() => setPending(null)} />}
      {error && <p className="selection-error" role="alert" onClick={() => setError(null)}>{error}</p>}
    </>
  );
}
