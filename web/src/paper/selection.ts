import type { PageRect, Rect, Source } from "../model/types";

export type LineRect = { left: number; top: number; right: number; bottom: number };
export type PageFrame = { page: number; box: LineRect; widthPt: number };

const MIN_LINE_PX = 1;
/** A span more than this far sideways from the current run's hull is in another column. Word
 *  gaps are about 3 pt; the narrowest two-column gutter in common CS templates is about 14 pt. */
export const COLUMN_GAP_PT = 8;
/** A span's text box sits up to 1.75 pt above its element box (spike finding 4), and equation
 *  tags/superscripts sit higher still, so a rect this far above the run's top or below its
 *  bottom still counts as "not a jump" (fix round 1, finding 1a). */
export const LINE_SLACK_PT = 3;

/** One client rect in page points, on the page whose canvas holds its centre; null for an empty rect or one on no page.
 *  Conversion: subtract the page canvas's screen origin, divide by scale = canvas width / page width in points.
 *  Origin is top-left, so no flip. This is the one place the conversion lives. */
function toPageRect(line: LineRect, frames: PageFrame[]): PageRect | null {
  if (line.bottom - line.top < MIN_LINE_PX || line.right - line.left < MIN_LINE_PX) return null;
  const cy = (line.top + line.bottom) / 2;
  const frame = frames.find((f) => f.box.top <= cy && cy <= f.box.bottom);
  if (!frame) return null;
  const scale = (frame.box.right - frame.box.left) / frame.widthPt;
  const rect: Rect = [
    (line.left - frame.box.left) / scale, (line.top - frame.box.top) / scale,
    (line.right - frame.box.left) / scale, (line.bottom - frame.box.top) / scale,
  ];
  return { page: frame.page, rect };
}

const hull = (a: Rect, b: Rect): Rect => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];

/** CSS pixels to PyMuPDF points (toPageRect), merged into one rect per column run.
 *  Runs: rects arrive in content-stream order, which is reading order. A rect continues the
 *  current run iff it is on the same page, it does not start above the run (its bottom edge is
 *  not at or above the run's top, within LINE_SLACK_PT), AND either it overlaps the run's
 *  accumulated hull sideways within COLUMN_GAP_PT, or it starts below the run's bottom (within
 *  LINE_SLACK_PT). The "starts below" branch is what lets an ordinary paragraph keep merging
 *  after a mid-line selection start (whose hull is narrower than a full-width line) or a span
 *  that rises inside the column (equation tags, superscripts) -- fix round 1, finding 1: the
 *  old rule compared only against the previous line's top, so either case started a spurious
 *  new run. A genuine column jump still starts a new run because it neither overlaps the run's
 *  hull nor sits below it. */
export function selectionToPageRects(lines: LineRect[], frames: PageFrame[]): PageRect[] {
  const runs: PageRect[] = [];
  for (const line of lines) {
    const at = toPageRect(line, frames);
    if (!at) continue;
    const { page, rect } = at;
    const run = runs[runs.length - 1];
    const samePage = run !== undefined && run.page === page;
    const notAboveRun = samePage && !(rect[3] <= run.rect[1] + LINE_SLACK_PT);
    const overlapsHull = samePage && rect[0] <= run.rect[2] + COLUMN_GAP_PT && run.rect[0] <= rect[2] + COLUMN_GAP_PT;
    const startsBelowRun = samePage && rect[1] >= run.rect[3] - LINE_SLACK_PT;
    if (run && notAboveRun && (overlapsHull || startsBelowRun)) {
      run.rect = hull(run.rect, rect);
    } else {
      runs.push({ page, rect });
    }
  }
  return runs;
}

/** Two rects are on one printed line when they overlap vertically by at least half the shorter one's height and
 *  lie within COLUMN_GAP_PT sideways: a word gap, never a gutter. A superscript overlaps its line's top half. */
function onOneLine(a: PageRect, b: PageRect): boolean {
  if (a.page !== b.page) return false;
  const [ax0, ay0, ax1, ay1] = a.rect;
  const [bx0, by0, bx1, by1] = b.rect;
  const overlap = Math.min(ay1, by1) - Math.max(ay0, by0);
  const shorter = Math.min(ay1 - ay0, by1 - by0);
  return overlap >= shorter / 2 && bx0 <= ax1 + COLUMN_GAP_PT && ax0 <= bx1 + COLUMN_GAP_PT;
}

/** CSS pixels to PyMuPDF points, one rect per printed line (contract 1): the selection's own extent on each line, so
 *  the server paints only what was selected of the first and last line. Lines stay in the order they first appear,
 *  which is reading order; a rect joins the latest line it shares a printed line with. */
export function selectionToLineRects(lines: LineRect[], frames: PageFrame[]): PageRect[] {
  const out: PageRect[] = [];
  for (const line of lines) {
    const at = toPageRect(line, frames);
    if (!at) continue;
    let same = out.length - 1;
    while (same >= 0 && !onOneLine(out[same], at)) same--;
    if (same === -1) out.push(at);
    else out[same] = { page: at.page, rect: hull(out[same].rect, at.rect) };
  }
  return out;
}

export function pageFrames(container: HTMLElement, source: Source): PageFrame[] {
  return Array.from(container.querySelectorAll<HTMLElement>(".react-pdf__Page")).map((el) => {
    const page = Number(el.dataset.pageNumber) - 1;   // react-pdf numbers pages from 1
    // The page element fills its container; only the canvas is the page (spike finding 1).
    const canvas = el.querySelector<HTMLElement>(".react-pdf__Page__canvas") ?? el;
    const box = canvas.getBoundingClientRect();
    return { page, box: { left: box.left, top: box.top, right: box.right, bottom: box.bottom }, widthPt: source.pages[page].width };
  });
}

/** A text selection in page space: `rects` one per column run (what snapping and the chunk read), `lines` one per
 *  printed line (what the highlight paints, contract 1). */
export type PaperSelection = { rects: PageRect[]; lines: PageRect[] };

/** The current DOM selection in page space, or null if there is none inside `container`. */
export function readSelection(container: HTMLElement, source: Source): PaperSelection | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!container.contains(range.commonAncestorContainer)) return null;
  const boxes = Array.from(range.getClientRects()).map((r) => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom }));
  const frames = pageFrames(container, source);
  const rects = selectionToPageRects(boxes, frames);
  return rects.length ? { rects, lines: selectionToLineRects(boxes, frames) } : null;
}
