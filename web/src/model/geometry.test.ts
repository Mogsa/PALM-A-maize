import { describe, expect, it } from "vitest";
import { containsPoint, highlightsIn, midpoint, unionRects } from "./geometry";
import type { ChunkAnchor, Highlight, PageRect, Rect } from "./types";

const q = { exact: "x", prefix: "", suffix: "" };
const line = (page: number, rect: Rect): PageRect => ({ page, rect });
const mark = (id: string, ...rects: PageRect[]): Highlight =>
  ({ id, tags: [], anchor: { rects, quote: q, position: 0, state: "anchored" } });
const region: ChunkAnchor = { rects: [{ page: 2, rect: [50, 100, 286, 400] }, { page: 3, rect: [50, 72, 286, 200] }], start: q, end: q, position: 0, state: "anchored" };

describe("geometry", () => {
  it("containsPoint is inclusive", () => {
    expect(containsPoint([0, 0, 10, 10], 10, 5)).toBe(true);
    expect(containsPoint([0, 0, 10, 10], 10.1, 5)).toBe(false);
  });
  it("midpoint and union", () => {
    expect(midpoint([0, 0, 10, 4])).toEqual([5, 2]);
    expect(unionRects([[5, 5, 6, 6], [0, 0, 1, 1]])).toEqual([0, 0, 6, 6]);
  });
  it("highlightsIn keeps marks with a line whose midpoint lies in any rect of the region, on that page", () => {
    const inside = mark("h-in", line(2, [60, 200, 200, 212]));
    const otherPage = mark("h-page", line(1, [60, 200, 200, 212]));
    const secondRect = mark("h-two", line(3, [60, 100, 200, 112]));
    const outside = mark("h-out", line(2, [309, 200, 500, 212]));
    expect(highlightsIn([inside, otherPage, secondRect, outside], region).map((h) => h.id)).toEqual(["h-in", "h-two"]);
  });
  it("a highlight is in a chunk when any one of its lines is (addendum 4.0)", () => {
    const acrossColumns = mark("h-cross", line(2, [309, 380, 500, 392]), line(2, [60, 390, 200, 398]));
    const noLineInside = mark("h-none", line(2, [309, 380, 500, 392]), line(4, [60, 100, 200, 112]));
    expect(highlightsIn([acrossColumns, noLineInside], region).map((h) => h.id)).toEqual(["h-cross"]);
  });
});
