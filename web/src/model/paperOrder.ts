import { containsPoint, midpoint } from "./geometry";
import type { PageRect, Source } from "./types";

/** How far below a rect's top edge its "top-centre" point sits, as the server's split and export use it. */
const TOP_INSET_POINTS = 1;

/** Addendum 6.1's paper order: page, then the index in `regions` of the region the first rect starts in, then (y0, x0).
 *  Never (page, y0) alone, which puts the right column before the left. */
export type OrderKey = [page: number, region: number, y0: number, x0: number];

/** The region a rect starts in, found as the server finds it (split.py `_paper_key`): the one holding the rect's
 *  top-centre point, else the first whose midpoint the rect holds. The top-left corner alone falls in no region for a
 *  centred heading's extent or a padded figure rect, which put ResNet's Abstract after section 1. */
export function orderKey(source: Source, first: PageRect): OrderKey {
  const [x0, y0, x1] = first.rect;
  const onPage = source.regions.map((r, i) => ({ i, r })).filter(({ r }) => r.page === first.page);
  const holding = onPage.find(({ r }) => containsPoint(r.rect, (x0 + x1) / 2, y0 + TOP_INSET_POINTS))
    ?? onPage.find(({ r }) => containsPoint(first.rect, ...midpoint(r.rect)));
  return [first.page, holding?.i ?? Number.MAX_SAFE_INTEGER, y0, x0];
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
