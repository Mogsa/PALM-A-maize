import { useEffect } from "react";
import { popoverPlace } from "./place";

type Props = {
  at: DOMRect;                 // the hovered link
  text: string | null;         // the words at its destination; null while they are read
  failed: boolean;
  onGo: () => void; onClose: () => void; onEnter: () => void; onLeave: () => void;
};

const CARD_WIDTH = 340;
const CARD_HEIGHT = 150;   // a reference of three or four lines and the action row, at the default zoom

/** The words at an internal link's destination (D24): the paper's own text, read from the page, nothing generated.
 *  Fixed over the paper, so nothing under it moves. */
export function CitationCard({ at, text, failed, onGo, onClose, onEnter, onLeave }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const { left, top } = popoverPlace(at, CARD_WIDTH, CARD_HEIGHT);
  return (
    <div className="popover citation-card" role="dialog" aria-label="In this paper" style={{ left, top }}
         onMouseEnter={onEnter} onMouseLeave={onLeave} onFocus={onEnter} onMouseDown={(e) => e.stopPropagation()}>
      <div className="citation-label">In this paper</div>
      <p className="citation-text">{text ?? (failed ? "Could not read the words there." : "Reading…")}</p>
      <div className="popover-actions">
        <button className="action" onClick={onGo} title="Jump to this place in the paper">Go there</button>
      </div>
    </div>
  );
}
