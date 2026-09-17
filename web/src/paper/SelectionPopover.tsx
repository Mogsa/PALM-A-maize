type Props = { at: DOMRect; busy: boolean; canHighlight: boolean; onHighlight: () => void; onCut: () => void; onDismiss: () => void };

export const ONE_COLUMN_HINT = "A highlight covers one column on one page. Cut this, or highlight each column.";

/** One selection, then a choice. No modes (SPEC.md section 4). A selection that crosses a column
 *  or a page is several rects, and a highlight anchor holds one, so Highlight is not offered. */
export function SelectionPopover({ at, busy, canHighlight, onHighlight, onCut, onDismiss }: Props) {
  return (
    <div className="popover" style={{ left: at.right + 8, top: at.bottom + 4 }} onMouseDown={(e) => e.stopPropagation()}>
      <button disabled={busy || !canHighlight} title={canHighlight ? undefined : ONE_COLUMN_HINT} onClick={onHighlight}>Highlight</button>
      <button disabled={busy} onClick={onCut}>Cut</button>
      <button className="quiet" onClick={onDismiss}>×</button>
    </div>
  );
}
