import { describe, expect, it, vi } from "vitest";
import { defineAction } from "./defineAction";

const at = { page: 0, rect: [0, 0, 10, 10] as [number, number, number, number] };

describe("defineAction", () => {
  it("is offered for a word or short phrase when AI is on", () => {
    const open = vi.fn();
    const action = defineAction({ on: true, text: " residual  block ", at, open });
    expect(action?.label).toBe("Define");
    action!.run();
    expect(open).toHaveBeenCalledWith("residual block", at);
  });
  it("is not offered when AI is off, for a long selection, or with no rect", () => {
    expect(defineAction({ on: false, text: "word", at, open: vi.fn() })).toBeNull();
    expect(defineAction({ on: true, text: "one two three four five", at, open: vi.fn() })).toBeNull();
    expect(defineAction({ on: true, text: "word", at: null, open: vi.fn() })).toBeNull();
  });
});
