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

/** CSS pixels to PyMuPDF points, merged into one rect per column run.
 *  Conversion: subtract the page canvas's screen origin, divide by scale = canvas width / page width
 *  in points. Origin is top-left, so no flip. This is the one place the conversion lives.
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
    if (line.bottom - line.top < MIN_LINE_PX || line.right - line.left < MIN_LINE_PX) continue;
    const cy = (line.top + line.bottom) / 2;
    const frame = frames.find((f) => f.box.top <= cy && cy <= f.box.bottom);
    if (!frame) continue;
    const scale = (frame.box.right - frame.box.left) / frame.widthPt;
    const rect: Rect = [
      (line.left - frame.box.left) / scale, (line.top - frame.box.top) / scale,
      (line.right - frame.box.left) / scale, (line.bottom - frame.box.top) / scale,
    ];
    const run = runs[runs.length - 1];
    const samePage = run !== undefined && run.page === frame.page;
    const notAboveRun = samePage && !(rect[3] <= run.rect[1] + LINE_SLACK_PT);
    const overlapsHull = samePage && rect[0] <= run.rect[2] + COLUMN_GAP_PT && run.rect[0] <= rect[2] + COLUMN_GAP_PT;
    const startsBelowRun = samePage && rect[1] >= run.rect[3] - LINE_SLACK_PT;
    if (run && notAboveRun && (overlapsHull || startsBelowRun)) {
      run.rect = [Math.min(run.rect[0], rect[0]), Math.min(run.rect[1], rect[1]), Math.max(run.rect[2], rect[2]), Math.max(run.rect[3], rect[3])];
    } else {
      runs.push({ page: frame.page, rect });
    }
  }
  return runs;
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

/** The current DOM selection as page rects, or null if there is none inside `container`. */
export function readSelection(container: HTMLElement, source: Source): PageRect[] | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!container.contains(range.commonAncestorContainer)) return null;
  const lines = Array.from(range.getClientRects()).map((r) => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom }));
  const rects = selectionToPageRects(lines, pageFrames(container, source));
  return rects.length ? rects : null;
}
