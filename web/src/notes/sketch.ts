import { getStroke } from "perfect-freehand";
import type { Stroke } from "../model/types";

/** A sketch's drawing surface, in its own units (D23). The image scales to the note it sits in. */
export const SKETCH_WIDTH = 600;
export const SKETCH_HEIGHT = 400;
export const PEN_SIZE = 4;
/** How far from a stroke's points, beyond its own half-width, the eraser still touches it. */
export const ERASER_REACH = 8;
/** The pressure recorded for a mouse or a finger, which have none of their own: perfect-freehand's default. */
export const NO_PRESSURE = 0.5;
const DECIMALS = 2;

export type Point = [number, number, number];

/** A stroke drawn without a pen's pressure has its pressure simulated from speed instead. */
export function isSimulated(stroke: Stroke): boolean {
  return stroke.points.every(([, , pressure]) => pressure === NO_PRESSURE);
}

const fixed = (n: number) => n.toFixed(DECIMALS);
const mid = (a: number, b: number) => (a + b) / 2;

/** perfect-freehand's outline polygon as SVG path data: a quadratic curve through the midpoints, closed. Only command
 *  letters, numbers, commas and spaces, which is all the server accepts. */
export function strokePath(stroke: Stroke): string {
  const outline = getStroke(stroke.points, { size: stroke.size, simulatePressure: isSimulated(stroke), last: true })
    .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (outline.length < 3) return "";
  const [a, b] = outline;
  const parts = [`M${fixed(a[0])},${fixed(a[1])}`, `Q${fixed(b[0])},${fixed(b[1])}`];
  for (let i = 1; i < outline.length; i++) {
    const [p, q] = [outline[i], outline[(i + 1) % outline.length]];
    parts.push(`${fixed(mid(p[0], q[0]))},${fixed(mid(p[1], q[1]))}`);
    if (i === 1) parts.push("T");
  }
  return `${parts.join(" ")} Z`;
}

type PointerLike = { clientX: number; clientY: number; pressure: number; pointerType: string };
type Box = { left: number; top: number; width: number; height: number };

/** A pointer's place on the drawn surface, in the sketch's units. Only a pen's pressure is its own (D23). */
export function pointFrom(event: PointerLike, box: Box, width: number, height: number): Point {
  const scaleX = box.width ? width / box.width : 1;
  const scaleY = box.height ? height / box.height : 1;
  const round = (n: number) => Number(n.toFixed(DECIMALS));
  const pressure = event.pointerType === "pen" ? round(event.pressure) : NO_PRESSURE;   // a browser's pressure is a float32
  return [round((event.clientX - box.left) * scaleX), round((event.clientY - box.top) * scaleY), pressure];
}

/** The eraser touches a stroke when it comes within the stroke's half-width and ERASER_REACH of one of its points. */
export function strokeTouches(stroke: Stroke, [x, y]: [number, number]): boolean {
  const reach = stroke.size / 2 + ERASER_REACH;
  return stroke.points.some(([px, py]) => Math.hypot(px - x, py - y) <= reach);
}

/** The strokes on the surface, what each change replaced (for Undo), what Undo took back (for Redo), and the stroke
 *  being drawn. */
export type Ink = { strokes: Stroke[]; past: Stroke[][]; future: Stroke[][]; drawing: Stroke | null };
export type InkAction =
  | { type: "load"; strokes: Stroke[] }
  | { type: "start"; point: Point; size: number }
  | { type: "extend"; point: Point }
  | { type: "end" }
  | { type: "erase"; point: [number, number] }
  | { type: "undo" }
  | { type: "redo" };

export const initialInk: Ink = { strokes: [], past: [], future: [], drawing: null };

const changed = (ink: Ink, strokes: Stroke[]): Ink => ({ strokes, past: [...ink.past, ink.strokes], future: [], drawing: null });

export function inkReducer(ink: Ink, action: InkAction): Ink {
  switch (action.type) {
    case "load": return { strokes: action.strokes, past: [], future: [], drawing: null };
    case "start": return { ...ink, drawing: { points: [action.point], size: action.size } };
    case "extend": return ink.drawing ? { ...ink, drawing: { ...ink.drawing, points: [...ink.drawing.points, action.point] } } : ink;
    case "end": return ink.drawing ? changed(ink, [...ink.strokes, ink.drawing]) : ink;
    case "erase": {
      const kept = ink.strokes.filter((s) => !strokeTouches(s, action.point));
      return kept.length === ink.strokes.length ? ink : changed(ink, kept);
    }
    case "undo": return ink.past.length
      ? { strokes: ink.past[ink.past.length - 1], past: ink.past.slice(0, -1), future: [ink.strokes, ...ink.future], drawing: null } : ink;
    case "redo": return ink.future.length
      ? { strokes: ink.future[0], past: [...ink.past, ink.strokes], future: ink.future.slice(1), drawing: null } : ink;
  }
}
