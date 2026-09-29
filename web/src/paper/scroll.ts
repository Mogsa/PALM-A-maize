import { useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import type { PaperScroll, Source } from "../model/types";

export const SCROLL_SAVE_DELAY_MS = 300;
export const SAME_SCROLL_PT = 0.5;

/** A page in the scrolling paper: its top in px from the container's content top, and px per point. */
export type PageBox = { page: number; top: number; scale: number };

/** The page at the top of the view and how far down it the view starts, in points, so it survives a zoom (addendum 4). */
export function toPaperScroll(scrollTop: number, pages: PageBox[]): PaperScroll | null {
  if (!pages.length) return null;
  let current = pages[0];
  for (const p of pages) if (p.top <= scrollTop) current = p;
  return { page: current.page, y: Math.max(0, (scrollTop - current.top) / current.scale) };
}

export function fromPaperScroll(scroll: PaperScroll, pages: PageBox[]): number | null {
  const box = pages.find((p) => p.page === scroll.page);
  return box ? box.top + scroll.y * box.scale : null;
}

export function samePaperScroll(a: PaperScroll | null | undefined, b: PaperScroll | null | undefined): boolean {
  if (!a || !b) return a === b;
  return a.page === b.page && Math.abs(a.y - b.y) < SAME_SCROLL_PT;
}

export function pageBoxes(container: HTMLElement, widths: number[], pageWidthPx: number): PageBox[] {
  return Array.from(container.querySelectorAll<HTMLElement>(".page-wrap")).map((el, i) => ({ page: i, top: el.offsetTop, scale: pageWidthPx / widths[i] }));
}

type Options = { ready: boolean; source: Source; pageWidthPx: number; paperScroll: PaperScroll | null | undefined; onScrollSettled: (scroll: PaperScroll | null) => void };

/** The paper opens where it was left (D5): restores `paper_scroll` once when the paper has loaded, then reports the
 *  position SCROLL_SAVE_DELAY_MS after scrolling stops. Returns the container's onScroll handler. */
export function usePaperScroll(container: RefObject<HTMLElement | null>, { ready, source, pageWidthPx, paperScroll, onScrollSettled }: Options) {
  const restored = useRef(false);
  const widths = useMemo(() => source.pages.map((p) => p.width), [source]);
  useLayoutEffect(() => {
    if (!ready || restored.current || !container.current) return;
    restored.current = true;
    const top = paperScroll ? fromPaperScroll(paperScroll, pageBoxes(container.current, widths, pageWidthPx)) : null;
    if (top !== null) container.current.scrollTop = top;
  }, [container, ready, paperScroll, widths, pageWidthPx]);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (settle.current) clearTimeout(settle.current); }, []);
  return () => {
    if (!restored.current) return;
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      const el = container.current;
      if (el) onScrollSettled(toPaperScroll(el.scrollTop, pageBoxes(el, widths, pageWidthPx)));
    }, SCROLL_SAVE_DELAY_MS);
  };
}
