import { afterEach, describe, expect, it } from "vitest";
import { popoverPlace } from "./place";

const at = (left: number, top: number, right: number, bottom: number) => ({ left, top, right, bottom, x: left, y: top, width: right - left, height: bottom - top, toJSON: () => null }) as DOMRect;
const size = { innerWidth: window.innerWidth, innerHeight: window.innerHeight };
afterEach(() => Object.assign(window, size));

describe("popoverPlace", () => {
  it("sits right of and below the anchor", () => {
    Object.assign(window, { innerWidth: 1400, innerHeight: 1000 });
    expect(popoverPlace(at(100, 100, 200, 120), 300, 90)).toEqual({ left: 208, top: 126 });
  });
  it("flips above near the bottom and stays inside the right edge", () => {
    Object.assign(window, { innerWidth: 1400, innerHeight: 1000 });
    expect(popoverPlace(at(1300, 950, 1350, 970), 300, 90)).toEqual({ left: 1092, top: 854 });
  });
});
