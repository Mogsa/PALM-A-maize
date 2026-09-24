import { describe, expect, it } from "vitest";
import type { Highlight, Rect, Section } from "../model/types";
import { headingAt, isClick, markAt, pagePoint } from "./hit";

const frames = [
  { page: 0, box: { left: 100, top: 0, right: 712, bottom: 792 }, widthPt: 612 },
  { page: 1, box: { left: 100, top: 800, right: 712, bottom: 1592 }, widthPt: 612 },
];
const q = { exact: "x", prefix: "", suffix: "" };
const mark = (id: string, page: number, rect: Rect): Highlight => ({ id, tags: [], anchor: { rects: [{ page, rect }], quote: q, position: 0, state: "anchored" } });
const heading = { id: "sec-3", number: "3", depth: 1, title: "Model", heading_rect: { page: 1, rect: [108, 280, 303, 290] }, extent: [], text: "" } as unknown as Section;

describe("hit testing a click on the paper", () => {
  it("converts a client point to page space", () => {
    expect(pagePoint(400, 900, frames)).toEqual({ page: 1, x: 300, y: 100 });
    expect(pagePoint(50, 50, frames)).toBeNull();
  });
  it("finds the mark under the point, the last drawn winning, on its own page only", () => {
    const under = mark("h-1", 1, [250, 90, 350, 110]);
    const over = mark("h-2", 1, [290, 95, 320, 105]);
    expect(markAt({ page: 1, x: 300, y: 100 }, [under, over])?.id).toBe("h-2");
    expect(markAt({ page: 0, x: 300, y: 100 }, [under])).toBeNull();
  });
  it("finds a heading by its rect", () => {
    expect(headingAt({ page: 1, x: 150, y: 285 }, [heading])?.id).toBe("sec-3");
    expect(headingAt({ page: 1, x: 150, y: 300 }, [heading])).toBeNull();
  });
  it("a click moved at most a few pixels", () => {
    expect(isClick({ x: 10, y: 10 }, { x: 12, y: 13 })).toBe(true);
    expect(isClick({ x: 10, y: 10 }, { x: 30, y: 10 })).toBe(false);
    expect(isClick(null, { x: 10, y: 10 })).toBe(false);
  });
});
