import { useRef } from "react";
import { useDismiss } from "../ui/useDismiss";
import { popoverPlace } from "./place";

type Props = {
  at: DOMRect; preview: string; busy: boolean; canHighlight: boolean;
  onHighlight: () => void; onCut: () => void; onDismiss: () => void; onOpen?: () => void; onFind?: () => void;
};

const POPOVER_WIDTH = 300;
const POPOVER_HEIGHT = 92;   // preview line plus the action row, measured at the default zoom

/** One selection, then a choice. No modes (SPEC.md section 4). A selection that crosses a column or a page is
 *  several rects; a highlight holds them all and is painted line by line (D1). */
export function SelectionPopover({ at, preview, busy, canHighlight, onHighlight, onCut, onDismiss, onOpen, onFind }: Props) {
  const box = useRef<HTMLDivElement>(null);
  useDismiss(box, onDismiss);
  const { left, top } = popoverPlace(at, POPOVER_WIDTH, POPOVER_HEIGHT);
  return (
    <div ref={box} className="popover" role="dialog" aria-label="Selection" style={{ left, top }} onMouseDown={(e) => e.stopPropagation()}>
      <div className="popover-preview" title={preview}>{preview}</div>
      <div className="popover-actions">
        <button className="action highlight" disabled={busy || !canHighlight} title="Mark this on the paper" onClick={onHighlight}>
          <span className="swatch" aria-hidden="true" />Highlight
        </button>
        <button className="action cut" disabled={busy} title="Cut this out as a piece on the board" onClick={onCut}>
          <span className="glyph" aria-hidden="true">✂</span>Cut
        </button>
        {onOpen && <button className="action" onClick={onOpen} title="This section is already a piece">Open on board</button>}
        {onFind && <button className="quiet" onClick={onFind} title="Every place these words appear in the paper">Find</button>}
      </div>
    </div>
  );
}
