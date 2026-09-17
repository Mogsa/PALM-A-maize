import type { Board, ChunkNode, FigureNode, Rect } from "../model/types";

type Props = { page: number; scale: number; board: Board; onOutlineClick: (nodeId: string) => void };

const px = (rect: Rect, scale: number) => ({
  left: rect[0] * scale, top: rect[1] * scale, width: (rect[2] - rect[0]) * scale, height: (rect[3] - rect[1]) * scale,
});

/** Marks and outlines for one page, drawn over the text layer. Pointer events stay off
 *  so the reader can still select text underneath; outlines take clicks on their border only. */
export function PageOverlay({ page, scale, board, onOutlineClick }: Props) {
  const chunks = board.nodes.filter((n): n is ChunkNode | FigureNode => n.type === "chunk" || n.type === "figure");
  return (
    <div className="overlay">
      {chunks.flatMap((node) => node.data.region.rects.filter((r) => r.page === page).map((r, i) => (
        <div key={`${node.id}-${i}`} className={`outline ${node.data.region.state}`} style={px(r.rect, scale)}
             title={node.data.region.start.exact.slice(0, 60)} onClick={() => onOutlineClick(node.id)} />
      )))}
      {board.highlights.filter((h) => h.anchor.page === page).map((h) => (
        <div key={h.id} className={`mark ${h.anchor.state}`} style={px(h.anchor.rect, scale)} title={h.anchor.quote.exact.slice(0, 80)} />
      ))}
    </div>
  );
}
