import { useState } from "react";
import type { Board, Source } from "../model/types";
import { pageBrackets } from "./brackets";

/** Brackets overlapping on a page stand this far apart, side by side. */
export const LANE_PX = 10;
/** A lane's name sits this much lower than the lane before it, so overlapping names stay readable. */
export const LABEL_STEP_PX = 14;

type Props = { page: number; scale: number; board: Board; source: Source; onOpen: (nodeId: string) => void };

/** Where the paper has been cut (from where to where): a thin bracket in the page's outer margin for every piece, grey
 *  while it is still in the tray, coloured once it is placed. Nothing covers the text; hovering or focusing a bracket
 *  tints its piece's lines on this page, and clicking it opens the piece on the board. */
export function CutBrackets({ page, scale, board, source, onOpen }: Props) {
  const [hovered, setHovered] = useState<string | null>(null);
  const brackets = pageBrackets(board, source, page);
  const tinted = hovered ? board.nodes.find((n) => n.id === hovered) : undefined;
  const tintRects = tinted && (tinted.type === "chunk" || tinted.type === "figure") ? tinted.data.region.rects.filter((r) => r.page === page) : [];
  return (
    <>
      {tintRects.map((r, i) => (
        <div key={i} className="cut-tint" style={{ left: r.rect[0] * scale, top: r.rect[1] * scale, width: (r.rect[2] - r.rect[0]) * scale, height: (r.rect[3] - r.rect[1]) * scale }} />
      ))}
      {brackets.map((b) => (
        <button key={b.nodeId} type="button" data-node-id={b.nodeId}
                className={`cut-bracket ${b.tray ? "tray" : "placed"} ${b.state}${b.label === null ? " continued" : ""}${b.continues ? " continues" : ""}`}
                style={{ top: b.top * scale, height: Math.max(1, (b.bottom - b.top) * scale), right: `calc(100% + 8px + ${b.lane * LANE_PX}px)` }}
                aria-label={`Open this piece${b.label ? `: ${b.label}` : ""}`} title={b.tray ? "In the tray: open on the board" : "Open on the board"}
                onClick={() => onOpen(b.nodeId)} onMouseEnter={() => setHovered(b.nodeId)} onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(b.nodeId)} onBlur={() => setHovered(null)}>
          {b.label !== null && <span className="cut-label" style={{ top: b.lane * LABEL_STEP_PX }}><span aria-hidden="true">✂</span> {b.label}</span>}
        </button>
      ))}
    </>
  );
}
