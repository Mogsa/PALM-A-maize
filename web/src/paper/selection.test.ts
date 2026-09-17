import { describe, expect, it } from "vitest";
import { selectionToPageRects } from "./selection";

const frames = [
  { page: 2, box: { left: 100, top: 1000, right: 800, bottom: 1906 }, widthPt: 612 },   // scale 700/612
  { page: 3, box: { left: 100, top: 1920, right: 800, bottom: 2826 }, widthPt: 612 },
];
const scale = 700 / 612;

describe("selectionToPageRects", () => {
  it("converts line rects to points relative to the page, top-left origin", () => {
    const lines = [{ left: 100 + 50 * scale, top: 1000 + 130 * scale, right: 100 + 156 * scale, bottom: 1000 + 139 * scale }];
    const [rect] = selectionToPageRects(lines, frames);
    expect(rect.page).toBe(2);
    expect(rect.rect.map((v) => Math.round(v))).toEqual([50, 130, 156, 139]);
  });

  it("merges the lines of one column into one rectangle and splits across pages", () => {
    const lines = [
      { left: 160, top: 1500, right: 400, bottom: 1512 },
      { left: 150, top: 1514, right: 420, bottom: 1526 },
      { left: 150, top: 2000, right: 300, bottom: 2012 },
    ];
    const rects = selectionToPageRects(lines, frames);
    expect(rects.map((r) => r.page)).toEqual([2, 3]);
    const [x0, y0, x1, y1] = rects[0].rect;
    expect(x0).toBeCloseTo((150 - 100) / scale, 3);
    expect(x1).toBeCloseTo((420 - 100) / scale, 3);
    expect(y0).toBeCloseTo((1500 - 1000) / scale, 3);
    expect(y1).toBeCloseTo((1526 - 1000) / scale, 3);
  });

  it("splits a two-column selection on one page into one rect per column", () => {
    // left column lines, then the right column starting higher up the page (spike finding 4)
    const lines = [
      { left: 160, top: 1700, right: 427, bottom: 1712 },
      { left: 157, top: 1714, right: 427, bottom: 1726 },
      { left: 453, top: 1082, right: 723, bottom: 1094 },
      { left: 453, top: 1096, right: 700, bottom: 1108 },
    ];
    const rects = selectionToPageRects(lines, frames);
    expect(rects.map((r) => r.page)).toEqual([2, 2]);
    expect(rects[0].rect[2]).toBeLessThan(rects[1].rect[0]);
  });

  it("keeps spans of one line together across a word gap, and a span's two boxes together", () => {
    const lines = [
      { left: 150, top: 1500, right: 300, bottom: 1512 },
      { left: 150, top: 1498, right: 300, bottom: 1512 },   // the same span's text box, 2 px taller
      { left: 303, top: 1500, right: 420, bottom: 1512 },   // next span on the line
    ];
    expect(selectionToPageRects(lines, frames)).toHaveLength(1);
  });

  it("ignores zero-height and zero-width rects browsers emit at range ends and <br>s", () => {
    const lines = [
      { left: 160, top: 1500, right: 400, bottom: 1512 },
      { left: 400, top: 1512, right: 400, bottom: 1512 },
      { left: 100, top: 1100, right: 100, bottom: 1116 },   // a <br> rect with an unrelated y
    ];
    expect(selectionToPageRects(lines, frames)).toHaveLength(1);
  });

  it("returns nothing when no line lies on a page", () => {
    expect(selectionToPageRects([{ left: 0, top: 0, right: 10, bottom: 10 }], frames)).toEqual([]);
  });

  // Fix round 1, finding 1: run splitting must use the run's accumulated hull, not just the
  // previous line's top, or an ordinary single-column selection breaks into many rects
  // whenever it starts mid-line or a span rises inside the column (equation tags, superscripts).

  it("keeps a run going when a mid-line start's hull misses the next line's short first span", () => {
    const lines = [
      { left: 400, top: 1500, right: 720, bottom: 1512 },   // mid-line start: hull ~[262, 542] pt
      { left: 150, top: 1514, right: 300, bottom: 1526 },   // next line's first span starts at the margin: ~[44, 175] pt
    ];
    expect(selectionToPageRects(lines, frames)).toHaveLength(1);
  });

  it("keeps a run going when a span rises more than LINE_SLACK_PT inside the column", () => {
    const lines = [
      { left: 150, top: 1500, right: 400, bottom: 1512 },
      { left: 150, top: 1514, right: 420, bottom: 1526 },
      { left: 380, top: 1505, right: 400, bottom: 1517 },   // an equation tag/superscript, rises well above line 2's top
    ];
    expect(selectionToPageRects(lines, frames)).toHaveLength(1);
  });

  it("still splits into two runs when a selection starts at the top of the left column and crosses into the right column", () => {
    const lines = [
      { left: 150, top: 1010, right: 400, bottom: 1022 },   // left column, top of page
      { left: 150, top: 1200, right: 420, bottom: 1212 },   // left column, further down
      { left: 453, top: 1010, right: 700, bottom: 1022 },   // right column, also at the top of the page
    ];
    const rects = selectionToPageRects(lines, frames);
    expect(rects).toHaveLength(2);
    expect(rects[0].rect[2]).toBeLessThan(rects[1].rect[0]);
  });
});
