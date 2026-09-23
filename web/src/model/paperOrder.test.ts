import { describe, expect, it } from "vitest";
import { compareKeys, orderKey, trayOrder } from "./paperOrder";
import type { Rect, Source } from "./types";

const pr = (page: number, rect: Rect) => ({ page, rect });
// A two-column page: the left column's region is listed before the right column's, which is reading order.
const source = {
  regions: [
    { page: 0, rect: [50, 50, 300, 700], label: "text" },
    { page: 0, rect: [320, 50, 560, 700], label: "text" },
    { page: 1, rect: [50, 50, 560, 700], label: "text" },
  ],
  sections: [
    { id: "sec-2", number: "2", depth: 1, title: "Two", heading_rect: pr(1, [50, 60, 200, 70]), extent: [pr(1, [50, 60, 560, 700])], text: "" },
    { id: "sec-1", number: "1", depth: 1, title: "One", heading_rect: pr(0, [50, 600, 200, 610]), extent: [pr(0, [50, 600, 300, 700])], text: "" },
  ],
  figures: [{ id: "fig-1", kind: "figure", label: "Figure 1", caption: "Figure 1: x", caption_rect: null, rect: pr(0, [320, 60, 560, 200]), confidence: "region" }],
} as unknown as Source;

describe("paper order (addendum 6.1)", () => {
  it("reads the left column before the right, whatever the y", () => {
    expect(compareKeys(orderKey(source, pr(0, [50, 600, 300, 700])), orderKey(source, pr(0, [320, 60, 560, 200])))).toBeLessThan(0);
  });
  it("puts a rect that starts in no region after the page's regions", () => {
    expect(orderKey(source, pr(0, [5, 5, 10, 10]))[1]).toBe(Number.MAX_SAFE_INTEGER);
  });
  it("orders sections and figures together", () => {
    expect(trayOrder(source)).toEqual(["sec-1", "fig-1", "sec-2"]);
  });
});
