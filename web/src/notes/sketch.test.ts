import { describe, expect, it } from "vitest";
import type { Stroke } from "../model/types";
import { initialInk, inkReducer, isSimulated, PEN_SIZE, pointFrom, strokePath, strokeTouches } from "./sketch";

// What the server accepts as path data (src/paperboard/sketch.py).
const PATH_DATA = /^[MmLlHhVvCcSsQqTtAaZz0-9eE.,\- ]*$/;
const line = (x: number, pressure = 0.5): Stroke => ({ points: [[x, 10, pressure], [x + 20, 30, pressure], [x + 40, 50, pressure]], size: PEN_SIZE });

describe("strokePath", () => {
  it("turns a stroke into a closed outline of path data and nothing else", () => {
    const d = strokePath(line(10));
    expect(d.startsWith("M")).toBe(true);
    expect(d.endsWith("Z")).toBe(true);
    expect(d).toMatch(PATH_DATA);
  });
  it("draws a dot for a single point", () => {
    expect(strokePath({ points: [[5, 5, 0.5]], size: PEN_SIZE })).toMatch(/^M.*Z$/);
  });
  it("a pen's own pressure makes a different outline than a simulated one", () => {
    expect(strokePath(line(10, 0.9))).not.toBe(strokePath(line(10, 0.5)));
  });
});

describe("pointFrom", () => {
  const box = { left: 100, top: 50, width: 300, height: 200 };
  it("maps a pointer in the drawn box to the sketch's own units, with the pen's pressure", () => {
    expect(pointFrom({ clientX: 250, clientY: 150, pressure: 0.8, pointerType: "pen" }, box, 600, 400)).toEqual([300, 200, 0.8]);
  });
  it("a mouse or a finger has no pressure of its own", () => {
    const [, , mouse] = pointFrom({ clientX: 100, clientY: 50, pressure: 0.5, pointerType: "mouse" }, box, 600, 400);
    const [, , touch] = pointFrom({ clientX: 100, clientY: 50, pressure: 1, pointerType: "touch" }, box, 600, 400);
    expect(isSimulated({ points: [[0, 0, mouse], [1, 1, touch]], size: PEN_SIZE })).toBe(true);
  });
});

describe("strokeTouches (the eraser)", () => {
  it("touches a stroke near any of its points, and not one far away", () => {
    expect(strokeTouches(line(10), [31, 31])).toBe(true);
    expect(strokeTouches(line(10), [300, 300])).toBe(false);
  });
});

describe("inkReducer", () => {
  const drawn = (xs: number[]) => xs.reduce((ink, x) => {
    const [first, ...rest] = line(x).points;
    let next = inkReducer(ink, { type: "start", point: first, size: PEN_SIZE });
    for (const point of rest) next = inkReducer(next, { type: "extend", point });
    return inkReducer(next, { type: "end" });
  }, initialInk);

  it("a stroke is kept when the pointer lifts", () => {
    const ink = drawn([10, 100]);
    expect(ink.strokes).toHaveLength(2);
    expect(ink.strokes[1].points).toEqual(line(100).points);
    expect(ink.drawing).toBeNull();
  });
  it("Undo takes back the last stroke, then the one before", () => {
    let ink = drawn([10, 100]);
    ink = inkReducer(ink, { type: "undo" });
    expect(ink.strokes).toEqual([line(10)]);
    ink = inkReducer(ink, { type: "undo" });
    expect(ink.strokes).toEqual([]);
    expect(inkReducer(ink, { type: "undo" })).toBe(ink);
  });
  it("the eraser removes the whole stroke it touches, and Undo brings it back", () => {
    let ink = drawn([10, 300]);
    ink = inkReducer(ink, { type: "erase", point: [31, 31] });
    expect(ink.strokes).toEqual([line(300)]);
    expect(inkReducer(ink, { type: "erase", point: [590, 390] })).toBe(ink);   // touches nothing: no step
    expect(inkReducer(ink, { type: "undo" }).strokes).toEqual([line(10), line(300)]);
  });
  it("Clear removes every stroke in one step", () => {
    const ink = inkReducer(drawn([10, 300]), { type: "clear" });
    expect(ink.strokes).toEqual([]);
    expect(inkReducer(ink, { type: "undo" }).strokes).toHaveLength(2);
  });
  it("a loaded sketch is where Undo stops, and is not a change", () => {
    const ink = inkReducer(drawn([10]), { type: "load", strokes: [line(300)] });
    expect(ink.strokes).toEqual([line(300)]);
    expect(ink.past).toEqual([]);
  });
});
