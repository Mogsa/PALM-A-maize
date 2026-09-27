import { describe, expect, it } from "vitest";
import { defaultPaperView, withView } from "./paperView";

describe("the paper's view state (kept apart from the board)", () => {
  it("defaults to the paper, no scroll, no filter, no viewport and a 0.4 split", () => {
    expect(defaultPaperView).toEqual({ view: "paper", paper_scroll: null, active_tags: [], viewport: null, split: 0.4 });
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
