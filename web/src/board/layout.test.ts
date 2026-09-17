import { describe, expect, it } from "vitest";
import { nextChunkPosition } from "./layout";
import type { BoardNode } from "../model/types";

const q = { exact: "x", prefix: "", suffix: "" };
const chunk = (id: string, y: number, height = 120): BoardNode => ({
  id, type: "chunk", position: { x: 40, y }, width: 320, height,
  data: { tags: [], collapsed: false, region: { rects: [{ page: 0, rect: [0, 0, 1, 1] }], start: q, end: q, position: 0, state: "anchored" }, text: "", user_sized: false, source_id: null },
});

describe("nextChunkPosition", () => {
  it("starts at the top-left of an empty board", () => {
    expect(nextChunkPosition([])).toEqual({ x: 40, y: 40 });
  });
  it("stacks below the lowest top-level node with a gap", () => {
    expect(nextChunkPosition([chunk("n-1", 40), chunk("n-2", 200, 90)])).toEqual({ x: 40, y: 200 + 90 + 24 });
  });
});
