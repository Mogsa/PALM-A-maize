import { useEffect } from "react";

type Props = { at: DOMRect; preview: string; busy: boolean; canHighlight: boolean; onHighlight: () => void; onCut: () => void; onDismiss: () => void };

export const ONE_COLUMN_HINT = "A highlight covers one column on one page. Cut this, or highlight each column.";

const POPOVER_WIDTH = 300;

/** One selection, then a choice. No modes (SPEC.md section 4). A selection that crosses a column
 *  or a page is several rects, and a highlight anchor holds one, so Highlight is not offered. */
export function SelectionPopover({ at, preview, busy, canHighlight, onHighlight, onCut, onDismiss }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onDismiss(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss]);
  // Keep the popover on screen: below the selection's last line, never past the right edge.
  const left = Math.max(8, Math.min(at.right + 8, window.innerWidth - POPOVER_WIDTH - 8));
  return (
    <div className="popover" role="dialog" aria-label="Selection" style={{ left, top: at.bottom + 6 }} onMouseDown={(e) => e.stopPropagation()}>
      <div className="popover-preview" title={preview}>{preview}</div>
      <div className="popover-actions">
        <button className="action highlight" disabled={busy || !canHighlight} title={canHighlight ? "Mark this on the paper" : ONE_COLUMN_HINT} onClick={onHighlight}>
          <span className="swatch" aria-hidden="true" />Highlight
        </button>
        <button className="action cut" disabled={busy} title="Cut this out as a piece on the board" onClick={onCut}>
          <span className="glyph" aria-hidden="true">✂</span>Cut
        </button>
        <button className="quiet close" aria-label="Dismiss" onClick={onDismiss}>×</button>
      </div>
    </div>
  );
}
