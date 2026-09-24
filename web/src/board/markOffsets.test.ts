import { describe, expect, it } from "vitest";
import { markOffsets } from "./markOffsets";

function element(tag: string, layout: Record<string, number>, highlightId?: string): HTMLElement {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(layout)) Object.defineProperty(el, key, { value, configurable: true });
  if (highlightId) el.dataset.highlightId = highlightId;
  return el;
}

describe("markOffsets (addendum 4.0: a handle at the mark's first line)", () => {
  it("is the middle of each mark's first painted line, from the card's top, clamped into the visible body", () => {
    const body = element("div", { offsetTop: 30, clientHeight: 200, scrollTop: 0 });
    body.append(
      element("mark", { offsetTop: 40, offsetHeight: 18 }, "h-1"),
      element("mark", { offsetTop: 90, offsetHeight: 18 }, "h-1"),
      element("mark", { offsetTop: 500, offsetHeight: 18 }, "h-2"),
    );
    expect(markOffsets(body)).toEqual(new Map([["h-1", 30 + 40 + 9], ["h-2", 30 + 200]]));
  });
  it("follows the body's scroll", () => {
    const body = element("div", { offsetTop: 30, clientHeight: 200, scrollTop: 100 });
    body.append(element("mark", { offsetTop: 150, offsetHeight: 18 }, "h-1"));
    expect(markOffsets(body).get("h-1")).toBe(30 + 150 - 100 + 9);
  });
});
