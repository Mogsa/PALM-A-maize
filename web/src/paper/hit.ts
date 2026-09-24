import { containsPoint } from "../model/geometry";
import type { XY } from "../model/reparent";
import type { Highlight, Section } from "../model/types";
import type { PageFrame } from "./selection";

export type PagePoint = { page: number; x: number; y: number };
/** What a click on the paper landed on. Marks and headings take no pointer events, so a drag that starts on them
 *  still selects text; a click is resolved here instead. */
export type PaperHit = { mark: Highlight | null; heading: Section | null; at: DOMRect };

export const CLICK_SLOP_PX = 4;

export function pagePoint(clientX: number, clientY: number, frames: PageFrame[]): PagePoint | null {
  const frame = frames.find((f) => f.box.left <= clientX && clientX <= f.box.right && f.box.top <= clientY && clientY <= f.box.bottom);
  if (!frame) return null;
  const scale = (frame.box.right - frame.box.left) / frame.widthPt;
  return { page: frame.page, x: (clientX - frame.box.left) / scale, y: (clientY - frame.box.top) / scale };
}

export function markAt(point: PagePoint, highlights: Highlight[]): Highlight | null {
  for (let i = highlights.length - 1; i >= 0; i--) {
    if (highlights[i].anchor.rects.some((r) => r.page === point.page && containsPoint(r.rect, point.x, point.y))) return highlights[i];
  }
  return null;
}

export function headingAt(point: PagePoint, sections: Section[]): Section | null {
  return sections.find((s) => s.heading_rect.page === point.page && containsPoint(s.heading_rect.rect, point.x, point.y)) ?? null;
}

export function isClick(down: XY | null, up: XY): boolean {
  return down !== null && Math.hypot(up.x - down.x, up.y - down.y) <= CLICK_SLOP_PX;
}
