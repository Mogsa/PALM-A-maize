import { useEffect, type ReactNode } from "react";
import { popoverPlace } from "./place";

type Props = {
  at: DOMRect;                 // the hovered link, reference or mark
  label?: string;              // "In this paper" unless the card is a term's (D27)
  text?: string | null;        // the words at its destination; null while they are read; "" for a clip alone
  failed?: boolean;
  clip?: string | null;        // an image of the figure, table or formula pointed at (D26)
  onGo?: () => void; onClose: () => void; onEnter: () => void; onLeave: () => void;
  children?: ReactNode;
};

const CARD_WIDTH = 340;
const CARD_HEIGHT = 150;        // a reference of three or four lines and the action row, at the default zoom
const CLIP_CARD_HEIGHT = 330;   // with a clip above the words

/** The paper's own words, in place (D24, D26, D27): what a link or reference points at, read from the page, or a term's
 *  definitions. Nothing generated. Fixed over the view, so nothing under it moves. */
export function CitationCard({ at, label = "In this paper", text, failed = false, clip, onGo, onClose, onEnter, onLeave, children }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const { left, top } = popoverPlace(at, CARD_WIDTH, clip ? CLIP_CARD_HEIGHT : CARD_HEIGHT);
  const words = text === null ? (failed ? "Could not read the words there." : "Reading…") : text;
  return (
    <div className="popover citation-card" role="dialog" aria-label={label} style={{ left, top }}
         onMouseEnter={onEnter} onMouseLeave={onLeave} onFocus={onEnter} onMouseDown={(e) => e.stopPropagation()}>
      <div className="citation-label">{label}</div>
      {clip && <img className="citation-clip" src={clip} alt="The part of the paper it points at" draggable={false} />}
      {words && <p className="citation-text">{words}</p>}
      {children}
      {onGo && (
        <div className="popover-actions">
          <button className="action" onClick={onGo} title="Jump to this place in the paper">Go there</button>
        </div>
      )}
    </div>
  );
}
