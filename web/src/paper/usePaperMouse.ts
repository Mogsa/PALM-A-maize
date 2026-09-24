import { useCallback, useRef, type RefObject } from "react";
import type { XY } from "../model/reparent";
import type { Board, PageRect, SelectionMode, Source } from "../model/types";
import { headingAt, isClick, markAt, pagePoint, type PaperHit } from "./hit";
import { useRectangleDrag } from "./rectangleDrag";
import { pageFrames, readSelection } from "./selection";

/** Clicks on these are theirs, not a click on the paper. */
export const OWN_CLICK_TARGETS = "a, button, input, textarea, select, .margin, .annotationLayer, .popover";

type Handlers = {
  onSelect: (rects: PageRect[], anchorEl: DOMRect, exact: boolean, mode: SelectionMode, lines?: PageRect[]) => void;
  onClickPaper: (hit: PaperHit) => void;
};

/** The selection's anchor: its last rect with real extent. The spike measured zero-width `<br>` rects at the end
 *  of the range with unrelated y values, so the last rect alone is unusable. */
function selectionAnchor(): DOMRect | undefined {
  const lines = Array.from(window.getSelection()!.getRangeAt(0).getClientRects());
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].width >= 1 && lines[i].height >= 1) return lines[i];
  }
  return undefined;
}

/** What the mouse does on the paper: a text drag selects, a Shift-drag draws a rectangle, and a click with no
 *  selection is hit-tested against marks and headings (they take no pointer events themselves). */
export function usePaperMouse(container: RefObject<HTMLElement | null>, source: Source, board: Board, { onSelect, onClickPaper }: Handlers) {
  const down = useRef<XY | null>(null);
  const onRect = useCallback((rect: PageRect, at: DOMRect, exact: boolean) => onSelect([rect], at, exact, "area"), [onSelect]);
  const rectangle = useRectangleDrag(container, source, onRect);

  const clickAt = (event: React.MouseEvent) => {
    if (!container.current || !isClick(down.current, { x: event.clientX, y: event.clientY })) return;
    if ((event.target as HTMLElement).closest(OWN_CLICK_TARGETS)) return;
    const point = pagePoint(event.clientX, event.clientY, pageFrames(container.current, source));
    if (!point) return;
    const mark = markAt(point, board.highlights);
    const heading = mark ? null : headingAt(point, source.sections);
    if (mark || heading) onClickPaper({ mark, heading, at: new DOMRect(event.clientX, event.clientY, 0, 0) });
  };
  const onMouseDown = (event: React.MouseEvent) => {
    down.current = null;
    if (rectangle.begin(event)) return;
    down.current = { x: event.clientX, y: event.clientY };
  };
  const onMouseUp = (event: React.MouseEvent) => {
    if (!container.current || rectangle.band) return;   // the rectangle's own mouse-up handles it
    const selection = readSelection(container.current, source);
    const anchor = selection && selectionAnchor();
    if (selection) { if (anchor) onSelect(selection.rects, anchor, event.altKey, "text", selection.lines); }
    else clickAt(event);
  };
  return { onMouseDown, onMouseUp, band: rectangle.band };
}
