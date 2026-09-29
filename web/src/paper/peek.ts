import type { PageRect, Source } from "../model/types";
import { CARD_LINE_PT, column } from "./citation";

/** Peek before/after (D28): how many of the paper's own lines are shown either side of a piece. */
export const PEEK_LINES = 3;
const PEEK_DEPTH_PT = PEEK_LINES * CARD_LINE_PT;
/** Thinner than this, a band holds no line. */
const MIN_BAND_PT = 1;

/** A band of the page from `top` to `bottom`, across the column `left` is in (Tier 1's column rule), or null when the
 *  page's edge leaves no room. */
function band(at: PageRect, top: number, bottom: number, source: Pick<Source, "pages" | "regions">): PageRect | null {
  const page = source.pages[at.page];
  const y0 = Math.max(top, 0);
  const y1 = Math.min(bottom, page.height);
  if (y1 - y0 < MIN_BAND_PT) return null;
  const [x0, x1] = column(at.rect[0], y0, y1, page, source.regions);
  return { page: at.page, rect: [x0, y0, x1, y1] };
}

/** Where the lines just before a piece's first rect and just after its last are read: PEEK_LINES lines, within the
 *  column, never past the page's edge. A piece is its rects in reading order: a chunk's region or a mark's lines. */
export function peekRects(rects: PageRect[], source: Pick<Source, "pages" | "regions">): { before: PageRect | null; after: PageRect | null } {
  if (!rects.length) return { before: null, after: null };
  const first = rects[0];
  const last = rects[rects.length - 1];
  return {
    before: band(first, first.rect[1] - PEEK_DEPTH_PT, first.rect[1], source),
    after: band(last, last.rect[3], last.rect[3] + PEEK_DEPTH_PT, source),
  };
}
