import { describe, expect, it } from "vitest";
import { previewText } from "./preview";

describe("previewText", () => {
  it("collapses whitespace and line breaks to single spaces", () => {
    expect(previewText("a  b\nc\n\nd")).toBe("a b c d");
  });
  it("cuts at a word boundary and adds an ellipsis when too long", () => {
    const out = previewText("the quick brown fox jumps over the lazy dog", 20);
    expect(out.length).toBeLessThanOrEqual(21);
    expect(out.endsWith("…")).toBe(true);
    expect(out).not.toContain("jum");
  });
  it("returns short text unchanged", () => {
    expect(previewText("short", 20)).toBe("short");
  });
});
