import { describe, expect, it } from "vitest";
import { clampSplit, defaultPaperView, splitAt, withView } from "./paperView";

describe("the paper's view state (kept apart from the board)", () => {
  it("defaults to the paper, no scroll, no filter, no viewport and a 0.4 split", () => {
    expect(defaultPaperView).toEqual({ view: "paper", paper_scroll: null, active_tags: [], viewport: null, split: 0.4, ai: false });
  });
  it("returns the same object when nothing changes, so a restore event saves nothing", () => {
    const v = { ...defaultPaperView, viewport: { x: 1, y: 2, zoom: 1 }, paper_scroll: { page: 1, y: 10 } };
    expect(withView(v, { viewport: { x: 1, y: 2, zoom: 1 } })).toBe(v);
    expect(withView(v, { paper_scroll: { page: 1, y: 10.2 } })).toBe(v);
    expect(withView(v, { view: "paper" })).toBe(v);
    expect(withView(v, { active_tags: [] })).toBe(v);
  });
  it("merges a change, including the both view and a split", () => {
    expect(withView(defaultPaperView, { view: "both", split: 0.6 })).toMatchObject({ view: "both", split: 0.6 });
  });
});

describe("the split between the paper and the board", () => {
  it("clamps to 0.15..0.85", () => {
    expect(clampSplit(0.05)).toBe(0.15);
    expect(clampSplit(0.95)).toBe(0.85);
    expect(clampSplit(0.5)).toBe(0.5);
    expect(clampSplit(Number.NaN)).toBe(0.4);
  });
  it("is the pointer's share of the width, clamped", () => {
    expect(splitAt(300, { left: 100, width: 800 })).toBe(0.25);
    expect(splitAt(0, { left: 100, width: 800 })).toBe(0.15);
    expect(splitAt(5000, { left: 100, width: 800 })).toBe(0.85);
  });
});
