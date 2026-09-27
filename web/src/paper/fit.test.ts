import { describe, expect, it } from "vitest";
import { fitPageWidth, FULL_PAGE_WIDTH_PX, MIN_PAGE_WIDTH_PX, RULER_GUTTER_PX, RIGHT_PAD_PX } from "./fit";

describe("fitting the page to the paper pane", () => {
  it("keeps the full width when not fitting", () => {
    expect(fitPageWidth(300, false)).toBe(FULL_PAGE_WIDTH_PX);
  });
  it("shrinks the page to the pane less the ruler's gutter and a little room on the right", () => {
    expect(fitPageWidth(600, true)).toBe(600 - RULER_GUTTER_PX - RIGHT_PAD_PX);
  });
  it("never grows past the full width, nor shrinks to nothing", () => {
    expect(fitPageWidth(3000, true)).toBe(FULL_PAGE_WIDTH_PX);
    expect(fitPageWidth(50, true)).toBe(MIN_PAGE_WIDTH_PX);
  });
  it("rounds to whole pixels so a sub-pixel resize never re-renders the page", () => {
    expect(Number.isInteger(fitPageWidth(600.4, true))).toBe(true);
  });
});
