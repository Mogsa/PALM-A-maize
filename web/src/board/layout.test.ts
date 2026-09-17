import { describe, expect, it } from "vitest";
import { DEFAULT_CHUNK_HEIGHT, GAP, nextChunkPosition } from "./layout";
import type { BoardNode } from "../model/types";

const q = { exact: "x", prefix: "", suffix: "" };
const chunk = (id: string, y: number, height?: number): BoardNode => ({
  id, type: "chunk", position: { x: 40, y }, width: 320, ...(height === undefined ? {} : { height }),
  data: { tags: [], collapsed: false, region: { rects: [{ page: 0, rect: [0, 0, 1, 1] }], start: q, end: q, position: 0, state: "anchored" }, text: "", user_sized: false, source_id: null },
});

describe("nextChunkPosition", () => {
  it("starts at the top-left of an empty board", () => {
    expect(nextChunkPosition([])).toEqual({ x: 40, y: 40 });
  });
  it("stacks below the lowest top-level node with a gap", () => {
    expect(nextChunkPosition([chunk("n-1", 40, 120), chunk("n-2", 200, 90)])).toEqual({ x: 40, y: 200 + 90 + 24 });
  });
  it("uses a chunk's measured height when it has no stored one (a new chunk is never sized by the tool)", () => {
    const measured = { ...chunk("n-1", 40), measured: { width: 320, height: 212 } };
    expect(nextChunkPosition([measured])).toEqual({ x: 40, y: 40 + 212 + GAP });
  });
  it("before a chunk is measured, assumes the height of a full chunk so the next never overlaps it", () => {
    expect(DEFAULT_CHUNK_HEIGHT).toBeGreaterThanOrEqual(360);   // head plus the body's 320 px max-height and padding
    expect(nextChunkPosition([chunk("n-1", 40)])).toEqual({ x: 40, y: 40 + DEFAULT_CHUNK_HEIGHT + GAP });
  });
});
