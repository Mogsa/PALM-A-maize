import type { LayoutRegion, PageInfo, Rect } from "../model/types";
import { destinationTop } from "./links";

/** Citation cards (D24): hovering one of the paper's own internal links shows the words at its destination. The
 *  words are read by `POST /text` from a band below the destination: about CARD_LINES lines of CARD_LINE_PT each. */
export const CARD_LINES = 5;
export const CARD_LINE_PT = 12;
export const CARD_DEPTH_PT = CARD_LINES * CARD_LINE_PT;
/** A layout region further than this, sideways, from the destination's left is another column's. */
export const COLUMN_REACH_PT = 24;

/** The destination's left edge in page space (x is the same in PDF user space), or null when it names none. */
function destinationLeft(dest: unknown[]): number | null {
  const kind = (dest[1] as { name?: string } | null)?.name;
  const left = kind === "XYZ" || kind === "FitR" ? dest[2] : null;
  return typeof left === "number" ? left : null;
}

const sideways = (region: LayoutRegion, x: number) => Math.max(region.rect[0] - x, x - region.rect[2], 0);

/** The column a band starts in: the region the band crosses nearest the destination's left, widened to that left;
 *  else the half of the page holding it. */
function column(left: number, top: number, bottom: number, page: PageInfo, regions: LayoutRegion[]): [number, number] {
  const near = regions
    .filter((r) => r.page === page.index && r.rect[1] < bottom && r.rect[3] > top && sideways(r, left) <= COLUMN_REACH_PT)
    .sort((a, b) => sideways(a, left) - sideways(b, left))[0];
  if (near) return [Math.min(near.rect[0], left), near.rect[2]];
  const half = page.width / 2;
  return left < half ? [0, half] : [half, page.width];
}

/** Where to read the words at an explicit destination ([page ref, {name}, ...args], PDF user space): from its top
 *  down CARD_DEPTH_PT, across its column, in page space. Null for a named destination not yet resolved. */
export function cardRect(dest: unknown, page: PageInfo, regions: LayoutRegion[]): Rect | null {
  if (!Array.isArray(dest) || dest.length < 2) return null;
  const top = destinationTop(dest, page.height) ?? 0;
  const bottom = Math.min(top + CARD_DEPTH_PT, page.height);
  const [x0, x1] = column(destinationLeft(dest) ?? 0, top, bottom, page, regions);
  return [x0, top, x1, bottom];
}

/** What resolveLink needs of pdf.js's document: its pages' annotations and its destinations. */
export type LinkDocument = {
  getPage: (pageNumber: number) => Promise<{ getAnnotations: () => Promise<{ id: string; dest?: unknown }[]> }>;
  getDestination: (name: string) => Promise<unknown[] | null>;
  getPageIndex: (ref: never) => Promise<number>;
};
/** A link's destination: the page it lands on and the explicit destination array. */
export type LinkTarget = { pageIndex: number; dest: unknown[] };

/** The destination of the internal link with this annotation id on this page (1-based, as react-pdf numbers pages),
 *  resolved as pdf.js follows it: a named destination is looked up, a page reference turned into its index. Null for a
 *  link that is not internal or does not resolve. */
export async function resolveLink(pdf: LinkDocument, pageNumber: number, annotationId: string): Promise<LinkTarget | null> {
  const annotation = (await (await pdf.getPage(pageNumber)).getAnnotations()).find((a) => a.id === annotationId);
  const named = annotation?.dest;
  const dest = typeof named === "string" ? await pdf.getDestination(named) : named;
  if (!Array.isArray(dest) || dest.length < 2) return null;
  const pageIndex = typeof dest[0] === "number" ? dest[0] : await pdf.getPageIndex(dest[0] as never);
  return pageIndex >= 0 ? { pageIndex, dest } : null;
}

/** A numbered reference: "[12] ...". */
const NUMBERED = /^\[\d+\]/;
/** An author-year reference: a surname and a comma, "Duchi, John," or "Hinton, G.E.". */
const SURNAME = /^\p{Lu}[\p{L}'’-]+,\s/u;
/** A page number on a line of its own. */
const PAGE_NUMBER = /^\d{1,4}$/;

/** Whether `line` starts another reference after `previous`: a numbered entry, or a surname and comma after a line
 *  that ended in a full stop (a line ending in a comma is an author list running on). A blank line or a page number
 *  ends the entry too. */
function startsAnother(line: string, previous: string): boolean {
  return !line || PAGE_NUMBER.test(line) || NUMBERED.test(line) || (SURNAME.test(line) && /\.$/.test(previous));
}

/** The first reference in the words read at a destination, its lines joined: a line ending in a hyphen joins the next
 *  with no space, keeping the hyphen ("hand-written"). Text that is not a bibliography is kept whole. */
export function firstEntry(text: string): string {
  const lines = text.split("\n").map((l) => l.trim());
  while (lines.length && !lines[0]) lines.shift();
  let out = lines[0] ?? "";
  for (let i = 1; i < lines.length && !startsAnother(lines[i], lines[i - 1]); i++) {
    out += out.endsWith("-") ? lines[i] : ` ${lines[i]}`;
  }
  return out;
}
