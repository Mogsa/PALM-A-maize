import type { Board, ChunkNode, FigureNode, Rect, Source } from "../model/types";
import { Margin } from "./PageMargin";
import type { JumpTarget } from "./margin";

type Props = {
  page: number; scale: number; board: Board; source: Source;
  onOutlineClick: (nodeId: string) => void; onJump: (target: JumpTarget) => void; onOpenNote: (noteId: string) => void;
};

const px = (rect: Rect, scale: number) => ({
  left: rect[0] * scale, top: rect[1] * scale, width: (rect[2] - rect[0]) * scale, height: (rect[3] - rect[1]) * scale,
});

/** Marks and outlines for one page, drawn over the text layer. The overlay and each outline's
 *  box are pointer-events: none, so a drag anywhere over a page -- including inside a cut
 *  region -- still selects the text underneath (fix round 1, finding 2: an outline's whole box
 *  used to capture pointer events, so text inside a cut could never be selected). Only the
 *  small tab at an outline's top-left corner takes clicks, to open it. */
export function PageOverlay({ page, scale, board, source, onOutlineClick, onJump, onOpenNote }: Props) {
  const chunks = board.nodes.filter((n): n is ChunkNode | FigureNode => n.type === "chunk" || n.type === "figure");
  return (
    <div className="overlay">
      {chunks.flatMap((node) => node.data.region.rects.filter((r) => r.page === page).map((r, i) => (
        <div key={`${node.id}-${i}`} className={`outline ${node.data.region.state}`} style={px(r.rect, scale)} data-node-id={node.id}>
          {/* The title sits on the tab: the outline's box takes no pointer events, so a tooltip there never shows. */}
          <button type="button" className="outline-tab" onClick={() => onOutlineClick(node.id)}
                  title={`Open on the board: ${node.data.region.start.exact.slice(0, 60)}`} aria-label="Open this piece">
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 8l6-6M4 2h4v4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        </div>
      )))}
      {/* A highlight is painted line by line, each of its rects on this page (addendum 5.1). */}
      {board.highlights.flatMap((h) => h.anchor.rects.filter((r) => r.page === page).map((r, i) => (
        <div key={`${h.id}-${i}`} className={`mark ${h.anchor.state}`} style={px(r.rect, scale)} data-highlight-id={h.id}
             title={h.anchor.quote.exact.slice(0, 80)} />
      )))}
      <Margin page={page} scale={scale} board={board} source={source} onJump={onJump} onOpenNote={onOpenNote} />
    </div>
  );
}
