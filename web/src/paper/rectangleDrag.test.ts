import { describe, expect, it } from "vitest";
import { rectangleFromDrag } from "./rectangleDrag";

const frame = { page: 1, box: { left: 100, top: 1000, right: 800, bottom: 1906 }, widthPt: 612 };
const scale = 700 / 612;

describe("rectangleFromDrag", () => {
  it("orders the corners and converts to points", () => {
    const rect = rectangleFromDrag({ x: 500, y: 1400 }, { x: 300, y: 1200 }, frame)!;
    expect(rect.page).toBe(1);
    expect(rect.rect.map((v) => Math.round(v))).toEqual([200, 200, 400, 400].map((v) => Math.round(v / scale)));
  });
  it("clamps to the page", () => {
    const rect = rectangleFromDrag({ x: 50, y: 950 }, { x: 300, y: 1200 }, frame)!;
    expect(rect.rect[0]).toBe(0);
    expect(rect.rect[1]).toBe(0);
  });
  it("rejects a drag too small to mean anything", () => {
    expect(rectangleFromDrag({ x: 300, y: 1200 }, { x: 304, y: 1203 }, frame)).toBeNull();
  });
});
