import { describe, expect, it } from "vitest";
import { destinationTop } from "./links";

const ref = { num: 12, gen: 0 };

describe("destinationTop (D10)", () => {
  it("turns an XYZ destination's top, in PDF user space, into a y from the page's top", () => {
    // Attention p.2 "section 3.2" links to subsection.3.2: XYZ top 117.119 on a 792 pt page.
    expect(destinationTop([ref, { name: "XYZ" }, 108, 117.119, 0], 792)).toBeCloseTo(674.881, 3);
  });
  it("reads FitH, FitBH and FitR tops too, and clamps to the page", () => {
    expect(destinationTop([ref, { name: "FitH" }, 700], 792)).toBeCloseTo(92, 3);
    expect(destinationTop([ref, { name: "FitR" }, 0, 100, 500, 900], 792)).toBe(0);
  });
  it("is null for a whole-page destination or a missing top", () => {
    expect(destinationTop([ref, { name: "Fit" }], 792)).toBeNull();
    expect(destinationTop([ref, { name: "XYZ" }, null, null, null], 792)).toBeNull();
    expect(destinationTop("named-dest", 792)).toBeNull();
  });
});
