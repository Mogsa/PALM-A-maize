import { useRef } from "react";
import type { MenuItem } from "../commands/registry";
import { TagDots } from "../tags/TagDots";
import { ActionMenu } from "../ui/ActionMenu";
import { useDismiss } from "../ui/useDismiss";
import { popoverPlace } from "./place";

type Props = {
  at: DOMRect; preview: string; busy: boolean; canHighlight: boolean;
  onHighlight: (tagId: string | null) => void; onCut: () => void; onDismiss: () => void; onOpen?: () => void; onFind?: () => void;
  menu: MenuItem[];
};

const POPOVER_WIDTH = 300;
const POPOVER_HEIGHT = 92;   // preview line plus the action row, measured at the default zoom

/** One selection, then one bar (spec A2): a colour highlights with that main tag, ✂ cuts, 🔍 finds, › holds the rest.
 *  A selection that crosses a column or a page is several rects; a highlight holds them all (D1). */
export function SelectionPopover({ at, preview, busy, canHighlight, onHighlight, onCut, onDismiss, onOpen, onFind, menu }: Props) {
  const box = useRef<HTMLDivElement>(null);
  useDismiss(box, onDismiss);
  const { left, top } = popoverPlace(at, POPOVER_WIDTH, POPOVER_HEIGHT);
  return (
    <div ref={box} className="popover selection-popover" role="dialog" aria-label="Selection" style={{ left, top }} onMouseDown={(e) => e.stopPropagation()}>
      <div className="popover-preview" title={preview}>{preview}</div>
      <div className="popover-actions">
        <TagDots onPick={onHighlight} disabled={busy || !canHighlight} plainLabel="Highlight" />
        <span className="bar-sep" aria-hidden="true" />
        <button className="quiet glyph" aria-label="Cut" title="Cut this out as a piece on the board" disabled={busy} onClick={onCut}>✂</button>
        {onFind && <button className="quiet glyph" aria-label="Find" title="Every place these words appear in the paper" onClick={onFind}>🔍</button>}
        {onOpen && <button className="action" onClick={onOpen} title="This section is already a piece">Open on board</button>}
        <ActionMenu items={menu} />
      </div>
    </div>
  );
}
