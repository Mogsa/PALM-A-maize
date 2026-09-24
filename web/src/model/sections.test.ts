import { describe, expect, it } from "vitest";
import { sectionAt, sectionLabel, sectionRef } from "./sections";
import type { Rect, Section, Source } from "./types";

const pr = (page: number, rect: Rect) => ({ page, rect });
const model: Section = { id: "sec-3", number: "3.", depth: 1, title: "Model Architecture", heading_rect: pr(2, [108, 280, 303, 290]), extent: [pr(2, [108, 280, 504, 720]), pr(3, [108, 72, 504, 410])], text: "" };
const abstract: Section = { ...model, id: "sec-0", number: null, title: "Abstract", extent: [pr(0, [108, 300, 504, 500])] };
const source = { sections: [abstract, model] } as unknown as Source;

describe("sections", () => {
  it("finds the section whose extent holds a line's midpoint, on any of its pages", () => {
    expect(sectionAt(source, pr(3, [120, 100, 300, 110]))?.id).toBe("sec-3");
    expect(sectionAt(source, pr(0, [120, 310, 300, 320]))?.id).toBe("sec-0");
    expect(sectionAt(source, pr(5, [0, 0, 1, 1]))).toBeNull();
  });
  it("names a section by its number, or by its title when it has none", () => {
    expect(sectionRef(model)).toBe("§3");
    expect(sectionRef(abstract)).toBe("Abstract");
    expect(sectionLabel(model)).toBe("§3 Model Architecture");
    expect(sectionLabel(abstract)).toBe("Abstract");
  });
});
