import { containsPoint } from "./geometry";
import type { PageRect, Source } from "./types";

/** Addendum 6.1's paper order: page, then the index in `regions` of the region the first rect starts in, then (y0, x0).
 *  Never (page, y0) alone, which puts the right column before the left. */
export type OrderKey = [page: number, region: number, y0: number, x0: number];

export function orderKey(source: Source, first: PageRect): OrderKey {
  const [x0, y0] = first.rect;
  const index = source.regions.findIndex((r) => r.page === first.page && containsPoint(r.rect, x0, y0));
  return [first.page, index === -1 ? Number.MAX_SAFE_INTEGER : index, y0, x0];
}

export function compareKeys(a: OrderKey, b: OrderKey): number {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

/** Every section and figure id in paper order: the rows of the tray (addendum 4.9). */
export function trayOrder(source: Source): string[] {
  const items = [
    ...source.sections.map((s) => ({ id: s.id, key: orderKey(source, s.extent[0] ?? s.heading_rect) })),
    ...source.figures.map((f) => ({ id: f.id, key: orderKey(source, f.rect) })),
  ];
  return items.sort((a, b) => compareKeys(a.key, b.key)).map((item) => item.id);
}
