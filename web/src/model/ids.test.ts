import { describe, expect, it } from "vitest";
import { newId } from "./ids";

describe("newId", () => {
  it("prefixes by kind and is unique and sortable by time", () => {
    const a = newId("n");
    const b = newId("n");
    expect(a.startsWith("n-")).toBe(true);
    expect(newId("h").startsWith("h-")).toBe(true);
    expect(newId("e").startsWith("e-")).toBe(true);
    expect(newId("t").startsWith("t-")).toBe(true);
    expect(a).not.toBe(b);
    expect(a < b || a.slice(0, 12) === b.slice(0, 12)).toBe(true);
  });
});
