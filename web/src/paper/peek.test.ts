import { describe, expect, it } from "vitest";
import type { LayoutRegion, PageInfo } from "../model/types";
import { CARD_LINE_PT } from "./citation";
import { PEEK_LINES, peekRects } from "./peek";

const DEPTH = PEEK_LINES * CARD_LINE_PT;
const pages: PageInfo[] = [0, 1, 2].map((index) => ({ index, width: 612, height: 792, rotation: 0 }));
// ResNet p3 (index 2): §3.1's text region in the left column, the next column's text on the right.
const regions: LayoutRegion[] = [
  { page: 2, rect: [50.1, 147.7, 286.4, 312.8], label: "text" },
  { page: 2, rect: [308.9, 75.2, 545.1, 203.9], label: "text" },
];
const source = { pages, regions };

describe("peekRects (D28): where the lines just before and after a piece are read", () => {
  it("takes PEEK_LINES lines above the first rect and below the last, across the piece's own column", () => {
    const chunk = [{ page: 2, rect: [50.1, 200, 286.4, 250] as [number, number, number, number] }];
    expect(peekRects(chunk, source)).toEqual({
      before: { page: 2, rect: [50.1, 200 - DEPTH, 286.4, 200] },
      after: { page: 2, rect: [50.1, 250, 286.4, 250 + DEPTH] },
    });
  });
  it("widens a highlight's partial first and last lines to their column", () => {
    const mark = [{ page: 2, rect: [180, 220, 286.4, 230] as [number, number, number, number] }, { page: 2, rect: [50.1, 231, 120, 241] as [number, number, number, number] }];
    expect(peekRects(mark, source)).toEqual({
      before: { page: 2, rect: [50.1, 220 - DEPTH, 286.4, 220] },
      after: { page: 2, rect: [50.1, 241, 286.4, 241 + DEPTH] },
    });
  });
  it("reads the right column for a piece there", () => {
    const right = [{ page: 2, rect: [308.9, 100, 545.1, 150] as [number, number, number, number] }];
    expect(peekRects(right, source).before).toEqual({ page: 2, rect: [308.9, 100 - DEPTH, 545.1, 100] });
  });
  it("stops at the page's edges, and has nothing before a piece at the very top", () => {
    const top = [{ page: 0, rect: [60, 0, 280, 20] as [number, number, number, number] }];
    expect(peekRects(top, source).before).toBeNull();
    const low = [{ page: 0, rect: [60, 770, 280, 780] as [number, number, number, number] }];
    expect(peekRects(low, source).after).toEqual({ page: 0, rect: [0, 780, 306, 792] });   // no region there: the page's half
    const nearTop = [{ page: 0, rect: [60, 10, 280, 20] as [number, number, number, number] }];
    expect(peekRects(nearTop, source).before).toEqual({ page: 0, rect: [0, 0, 306, 10] });
  });
  it("is nothing for a piece with no rects", () => {
    expect(peekRects([], source)).toEqual({ before: null, after: null });
  });
});
