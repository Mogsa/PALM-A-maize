import { describe, expect, it } from "vitest";
import type { Rect, Source } from "../model/types";
import { pairedFigure } from "./figures";

const pr = (page: number, rect: Rect) => ({ page, rect });
const source = { figures: [
  { id: "fig-1", kind: "figure", label: "Figure 1", caption: "Figure 1: The Transformer.", caption_rect: pr(2, [108, 400, 504, 420]), rect: pr(2, [197, 72, 415, 394]), confidence: "region" },
  { id: "tab-1", kind: "table", label: "Table 1", caption: "Table 1: x", caption_rect: null, rect: pr(5, [108, 100, 504, 300]), confidence: "region" },
] } as unknown as Source;

describe("pairedFigure", () => {
  it("is the figure whose picture and caption the snapped rect holds", () => {
    expect(pairedFigure(source, pr(2, [108, 72, 504, 420]))?.id).toBe("fig-1");
  });
  it("is nothing when the rect left the caption out, or holds no figure", () => {
    expect(pairedFigure(source, pr(2, [190, 70, 420, 396]))).toBeNull();
    expect(pairedFigure(source, pr(3, [0, 0, 600, 800]))).toBeNull();
  });
  it("takes a figure with no caption on its picture alone", () => {
    expect(pairedFigure(source, pr(5, [100, 90, 510, 310]))?.id).toBe("tab-1");
  });
});
