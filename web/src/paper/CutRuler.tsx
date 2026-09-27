import { useState } from "react";
import type { Board, Source } from "../model/types";
import { pageRuler } from "./ruler";

type Props = { page: number; scale: number; board: Board; source: Source; onOpen: (nodeId: string) => void };

/** Where the paper has been cut, from where to where: one thin line in the page's left margin, faint along a piece
 *  still in the tray, solid along one out of it, with a short tick wherever a piece starts or ends. No labels: hovering
 *  or focusing a stretch shows the piece's name and tints its lines on this page; a click opens it on the board. */
export function CutRuler({ page, scale, board, source, onOpen }: Props) {
  const [hovered, setHovered] = useState<string | null>(null);
  const { stretches, ticks } = pageRuler(board, source, page);
  if (!stretches.length) return null;
  const tinted = hovered ? board.nodes.find((n) => n.id === hovered) : undefined;
  const tintRects = tinted && (tinted.type === "chunk" || tinted.type === "figure") ? tinted.data.region.rects.filter((r) => r.page === page) : [];
  return (
    <>
      {tintRects.map((r, i) => (
        <div key={i} className="cut-tint" style={{ left: r.rect[0] * scale, top: r.rect[1] * scale, width: (r.rect[2] - r.rect[0]) * scale, height: (r.rect[3] - r.rect[1]) * scale }} />
      ))}
      <div className="cut-ruler">
        {stretches.map((s) => (
          <button key={s.nodeId} type="button" data-node-id={s.nodeId} className={`cut-stretch ${s.tray ? "tray" : "placed"} ${s.state}`}
                  style={{ top: s.top * scale, height: Math.max(1, (s.bottom - s.top) * scale) }} aria-label={`Open this piece: ${s.name}`}
                  onClick={() => onOpen(s.nodeId)} onMouseEnter={() => setHovered(s.nodeId)} onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered(s.nodeId)} onBlur={() => setHovered(null)}>
            {hovered === s.nodeId && <span className="cut-tip" role="tooltip">{s.name}</span>}
          </button>
        ))}
        {ticks.map((y) => <span key={y} className="cut-tick" style={{ top: y * scale }} />)}
      </div>
    </>
  );
}
