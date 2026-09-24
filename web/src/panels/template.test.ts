import { describe, expect, it } from "vitest";
import { cleanTemplate, moveSlot, setSlot, withoutSlot } from "./template";

const slots = [{ name: "A", prompt: "a?" }, { name: "B", prompt: "b?" }, { name: "C", prompt: "c?" }];

describe("editing the template", () => {
  it("moves a slot up or down, and not past either end", () => {
    expect(moveSlot(slots, 1, -1).map((s) => s.name)).toEqual(["B", "A", "C"]);
    expect(moveSlot(slots, 2, 1)).toBe(slots);
  });
  it("edits and deletes one slot without touching the others", () => {
    expect(setSlot(slots, 0, { prompt: "new?" })[0]).toEqual({ name: "A", prompt: "new?" });
    expect(withoutSlot(slots, 1).map((s) => s.name)).toEqual(["A", "C"]);
  });
  it("saves trimmed slots and drops one with no name", () => {
    expect(cleanTemplate([{ name: "  Main point ", prompt: " What? " }, { name: " ", prompt: "lost?" }])).toEqual({ schema: 1, slots: [{ name: "Main point", prompt: "What?" }] });
  });
});
