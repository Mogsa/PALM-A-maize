import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

/** The page's width when the paper has the window to itself. */
export const FULL_PAGE_WIDTH_PX = 760;
/** Room left of a page for the cut ruler (as `--ruler-gutter`). */
export const RULER_GUTTER_PX = 24;
/** Room right of a fitted page, so it never touches the divider. */
export const RIGHT_PAD_PX = 16;
/** A fitted page is never narrower than this. */
export const MIN_PAGE_WIDTH_PX = 160;
/** Fired on the window when a drag of the split divider ends: the paper fits itself to its pane then. */
export const REFIT_EVENT = "paperboard:refit";
/** While the divider is dragged the views carry this class, and the paper waits for the release to refit. */
export const DRAGGING_CLASS = "dragging";

/** The page width for a pane `paneWidth` px wide: the full width, or, when fitting, as much as the pane allows. */
export function fitPageWidth(paneWidth: number, fit: boolean): number {
  if (!fit) return FULL_PAGE_WIDTH_PX;
  return Math.max(MIN_PAGE_WIDTH_PX, Math.min(FULL_PAGE_WIDTH_PX, Math.floor(paneWidth - RULER_GUTTER_PX - RIGHT_PAD_PX)));
}

/** The page width for the paper in `container`: refitted when the pane is resized (the window, the side panel) and when
 *  a divider drag is released, but never while the divider is being dragged, so the pages do not redraw on every move. */
export function usePageWidth(container: RefObject<HTMLElement | null>, fit: boolean): number {
  const [width, setWidth] = useState(FULL_PAGE_WIDTH_PX);
  const place = useRef<number | null>(null);   // how far down the paper the view was, as a share, before a refit
  useLayoutEffect(() => {
    const el = container.current;
    if (!el || place.current === null) return;
    el.scrollTop = place.current * el.scrollHeight;
    place.current = null;
  }, [container, width]);
  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const measure = () => setWidth((current) => {
      const next = fitPageWidth(el.clientWidth, fit);
      if (next !== current && el.scrollHeight > 0) place.current = el.scrollTop / el.scrollHeight;
      return next;
    });
    measure();
    if (!fit) return;
    const observer = new ResizeObserver(() => { if (!el.closest(`.${DRAGGING_CLASS}`)) measure(); });
    observer.observe(el);
    window.addEventListener(REFIT_EVENT, measure);
    return () => { observer.disconnect(); window.removeEventListener(REFIT_EVENT, measure); };
  }, [container, fit]);
  return width;
}
