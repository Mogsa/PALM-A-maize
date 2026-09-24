import type { ChunkAnchor, Highlight, PageRect, Rect } from "./types";

export function containsPoint([x0, y0, x1, y1]: Rect, x: number, y: number): boolean {
  return x0 <= x && x <= x1 && y0 <= y && y <= y1;
}

export function midpoint([x0, y0, x1, y1]: Rect): [number, number] {
  return [(x0 + x1) / 2, (y0 + y1) / 2];
}

export function unionRects(rects: Rect[]): Rect {
  return rects.reduce((acc, r) => [Math.min(acc[0], r[0]), Math.min(acc[1], r[1]), Math.max(acc[2], r[2]), Math.max(acc[3], r[3])] as Rect);
}

/** A line is inside when its midpoint lies in one of `rects` on the same page (addendum 4.0). */
export function lineInside(line: PageRect, rects: PageRect[]): boolean {
  const [mx, my] = midpoint(line.rect);
  return rects.some((r) => r.page === line.page && containsPoint(r.rect, mx, my));
}

/** The lines of a highlight that lie inside `rects`, in the highlight's order: what a chunk or a section paints or counts. */
export function linesInside(highlight: Highlight, rects: PageRect[]): PageRect[] {
  return highlight.anchor.rects.filter((line) => lineInside(line, rects));
}

/** A line rect is inside a region when its midpoint lies in one of the region's rects on the same page. */
export function lineIn(line: PageRect, region: ChunkAnchor): boolean {
  return lineInside(line, region.rects);
}

/** Containment is geometry, never a stored list (addendum 4.0): a chunk contains a highlight when it
 *  contains at least one of its line rects. Same rule as the server's `highlights_in`. */
export function highlightsIn(highlights: Highlight[], region: ChunkAnchor): Highlight[] {
  return highlights.filter((h) => h.anchor.rects.some((line) => lineIn(line, region)));
}
