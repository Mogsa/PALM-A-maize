import type { Board, Rect, Source } from "../model/types";
import { CutRuler } from "./CutRuler";
import { Margin } from "./PageMargin";
import type { JumpTarget } from "./margin";

type Props = {
  page: number; scale: number; board: Board; source: Source;
  onOutlineClick: (nodeId: string) => void; onJump: (target: JumpTarget) => void; onOpenNote: (noteId: string) => void;
};

const px = (rect: Rect, scale: number) => ({
  left: rect[0] * scale, top: rect[1] * scale, width: (rect[2] - rect[0]) * scale, height: (rect[3] - rect[1]) * scale,
});

/** Marks and the cut ruler for one page. The overlay is pointer-events: none, so a drag anywhere over a page still
 *  selects the text underneath (fix round 1, finding 2); the ruler sits in the margin, off the text. */
export function PageOverlay({ page, scale, board, source, onOutlineClick, onJump, onOpenNote }: Props) {
  return (
    <div className="overlay">
      <CutRuler page={page} scale={scale} board={board} source={source} onOpen={onOutlineClick} />
      {/* A highlight is painted line by line, each of its rects on this page (addendum 5.1). */}
      {board.highlights.flatMap((h) => h.anchor.rects.filter((r) => r.page === page).map((r, i) => (
        <div key={`${h.id}-${i}`} className={`mark ${h.anchor.state}`} style={px(r.rect, scale)} data-highlight-id={h.id}
             title={h.anchor.quote.exact.slice(0, 80)} />
      )))}
      <Margin page={page} scale={scale} board={board} source={source} onJump={onJump} onOpenNote={onOpenNote} />
    </div>
  );
}
