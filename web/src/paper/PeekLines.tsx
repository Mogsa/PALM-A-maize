import { useEffect, useState } from "react";
import { reflow } from "../board/marks";
import type { PageRect } from "../model/types";
import { useBoard } from "../state/BoardProvider";
import { peekRects } from "./peek";
import { useWordsUnder } from "./useWordsUnder";

export const PEEK_FAILED_MESSAGE = "Could not read the lines around it.";

type Lines = { before: string; after: string };

/** Peek before/after (D28): the paper's own lines either side of a piece, read on demand by the existing `POST /text`
 *  and shown in place. Local to the view: it never changes the piece's region or the board. Escape collapses it. */
export function usePeek(rects: PageRect[]) {
  const { source, paperId, words } = useBoard();
  const read = useWordsUnder(paperId);
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<Lines | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open) return;
    let live = true;
    const { before, after } = peekRects(rects, source);
    const wordsIn = (at: PageRect | null) => (at ? read(at).then((text) => reflow(text, words)) : Promise.resolve(""));
    Promise.all([wordsIn(before), wordsIn(after)]).then(
      ([b, a]) => { if (live) { setLines({ before: b, after: a }); setFailed(false); } },
      (failure: unknown) => { console.error(PEEK_FAILED_MESSAGE, failure); if (live) setFailed(true); });
    return () => { live = false; };
  }, [open, rects, source, read, words]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return { open, lines, failed, toggle: () => setOpen((o) => !o) };
}

export type Peek = ReturnType<typeof usePeek>;

/** The small control that shows or hides the lines around a piece. */
export function PeekButton({ peek }: { peek: Peek }) {
  return (
    <button type="button" className="quiet peek-toggle nodrag" aria-expanded={peek.open} aria-label={peek.open ? "Less context" : "More context"}
            title="The paper's own lines just before and after this" onClick={peek.toggle} onMouseDown={(e) => e.stopPropagation()}>
      {peek.open ? "less context" : "more context"}
    </button>
  );
}

/** The lines on one side, dimmed, while the peek is open. */
export function PeekText({ peek, side }: { peek: Peek; side: keyof Lines }) {
  if (!peek.open) return null;
  const text = peek.failed ? PEEK_FAILED_MESSAGE : peek.lines ? peek.lines[side] : "Reading…";
  if (!text) return null;
  return <p className={`peek ${side}`}>{text}</p>;
}
