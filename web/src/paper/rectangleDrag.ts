import { useEffect, useState, type RefObject } from "react";
import type { XY } from "../model/reparent";
import type { PageRect, Source } from "../model/types";
import { pageFrames, type PageFrame } from "./selection";

export const MIN_DRAG_PX = 8;

type Band = { start: XY; end: XY; frame: PageFrame };

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/** A Shift-drag on a page as one page rect in points, corners in any order, clamped to the page. */
export function rectangleFromDrag(start: XY, end: XY, frame: PageFrame): PageRect | null {
  if (Math.abs(end.x - start.x) < MIN_DRAG_PX || Math.abs(end.y - start.y) < MIN_DRAG_PX) return null;
  const { left, top, right, bottom } = frame.box;
  const scale = (right - left) / frame.widthPt;
  const x = (px: number) => (clamp(px, left, right) - left) / scale;
  const y = (px: number) => (clamp(px, top, bottom) - top) / scale;
  return { page: frame.page, rect: [x(Math.min(start.x, end.x)), y(Math.min(start.y, end.y)), x(Math.max(start.x, end.x)), y(Math.max(start.y, end.y))] };
}

export function bandBox(start: XY, end: XY): DOMRect {
  return new DOMRect(Math.min(start.x, end.x), Math.min(start.y, end.y), Math.abs(end.x - start.x), Math.abs(end.y - start.y));
}

/** Shift-drag draws a rectangle instead of selecting text. `begin` returns true when it took the mouse-down. */
export function useRectangleDrag(container: RefObject<HTMLElement | null>, source: Source, onRect: (rect: PageRect, at: DOMRect, exact: boolean) => void) {
  const [band, setBand] = useState<Band | null>(null);
  const begin = (event: React.MouseEvent): boolean => {
    if (!event.shiftKey || !container.current) return false;
    const frame = pageFrames(container.current, source).find((f) =>
      f.box.left <= event.clientX && event.clientX <= f.box.right && f.box.top <= event.clientY && event.clientY <= f.box.bottom);
    if (!frame) return false;
    event.preventDefault();   // no text selection while the rectangle is drawn
    const at = { x: event.clientX, y: event.clientY };
    setBand({ start: at, end: at, frame });
    return true;
  };
  useEffect(() => {
    if (!band) return;
    const move = (e: MouseEvent) => setBand((b) => (b ? { ...b, end: { x: e.clientX, y: e.clientY } } : b));
    const up = (e: MouseEvent) => {
      const end = { x: e.clientX, y: e.clientY };
      setBand(null);
      const rect = rectangleFromDrag(band.start, end, band.frame);
      if (rect) onRect(rect, bandBox(band.start, end), e.altKey);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
  }, [band, onRect]);
  return { band, begin };
}
