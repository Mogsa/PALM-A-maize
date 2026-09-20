import { describe, expect, it } from "vitest";
import { isOverflowing, OVERFLOW_SLACK_PX } from "./overflow";

describe("isOverflowing", () => {
  it("is false when content fits, with a little slack for rounding", () => {
    expect(isOverflowing(100, 100)).toBe(false);
    expect(isOverflowing(100 + OVERFLOW_SLACK_PX, 100)).toBe(false);
  });
  it("is true when content is taller than the box", () => {
    expect(isOverflowing(320, 200)).toBe(true);
  });
});
