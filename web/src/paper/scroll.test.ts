import { describe, expect, it } from "vitest";
import { fromPaperScroll, samePaperScroll, toPaperScroll } from "./scroll";

const pages = [{ page: 0, top: 24, scale: 1.25 }, { page: 1, top: 1034, scale: 1.25 }, { page: 2, top: 2044, scale: 1.25 }];

describe("paper_scroll (addendum 4)", () => {
  it("is the page at the top of the view and how far down it the view starts, in points", () => {
    expect(toPaperScroll(1034 + 250, pages)).toEqual({ page: 1, y: 200 });
    expect(toPaperScroll(0, pages)).toEqual({ page: 0, y: 0 });
  });
  it("round-trips through a scrollTop", () => {
    expect(fromPaperScroll({ page: 2, y: 100 }, pages)).toBe(2044 + 125);
    expect(fromPaperScroll(toPaperScroll(1500, pages)!, pages)).toBeCloseTo(1500, 6);
    expect(fromPaperScroll({ page: 9, y: 0 }, pages)).toBeNull();
    expect(toPaperScroll(10, [])).toBeNull();
  });
  it("treats positions within half a point as the same, so a restore does not save again", () => {
    expect(samePaperScroll({ page: 1, y: 200.2 }, { page: 1, y: 200 })).toBe(true);
    expect(samePaperScroll({ page: 1, y: 200 }, null)).toBe(false);
  });
});
