import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyBoard, type Rect, type Selection, type Source } from "../model/types";

vi.mock("../api/client", () => ({ CLIP_DPI: 216, api: { putClip: vi.fn(async () => ({ clip: "clips/x.png", clip_size: { width: 900, height: 600 } })) } }));
import { api } from "../api/client";
import { makeCut } from "./cut";

const q = { exact: "x", prefix: "", suffix: "" };
const at = { page: 2, rect: [108, 72, 504, 420] as Rect };
const selection: Selection = {
  text: "t", rects: [at], region_label: "picture",
  highlight: { rects: [at], quote: q, position: 0, state: "anchored" },
  chunk: { rects: [at], start: q, end: q, position: 0, state: "anchored" },
  blocks: [{ kind: "clip", page: 2, rect: at.rect, label: "picture" }],
};
const source = { figures: [{ id: "fig-1", kind: "figure", label: "Figure 1", caption: "Figure 1: The Transformer.", caption_rect: { page: 2, rect: [108, 400, 504, 420] }, rect: { page: 2, rect: [197, 72, 415, 394] }, confidence: "region" }] } as unknown as Source;

beforeEach(() => vi.clearAllMocks());

describe("makeCut", () => {
  it("a text cut is a chunk that shows its blocks and remembers its section", async () => {
    const node = await makeCut("p", source, emptyBoard("p"), selection, { mode: "text", sectionId: "sec-3" });
    expect(node).toMatchObject({ type: "chunk", data: { region: selection.chunk, blocks: selection.blocks, source_id: "sec-3", collapsed: false } });
    expect(api.putClip).not.toHaveBeenCalled();
  });
  it("an area cut is a figure with its clip stored at 216 dpi under its own id, and the paired figure's caption", async () => {
    const node = await makeCut("p", source, emptyBoard("p"), selection, { mode: "area" });
    expect(api.putClip).toHaveBeenCalledWith("p", node.id, at, 216);
    expect(node).toMatchObject({ type: "figure", data: { clip: "clips/x.png", clip_size: { width: 900, height: 600 }, caption: "Figure 1: The Transformer.", source_id: "fig-1" } });
  });
  it("an area cut that snapped to nothing has no caption and no source", async () => {
    const loose = { ...selection, rects: [{ page: 7, rect: [0, 0, 50, 50] as Rect }] };
    expect(await makeCut("p", source, emptyBoard("p"), loose, { mode: "area" })).toMatchObject({ data: { caption: "", source_id: null } });
  });
  it("a cut dropped on the board is placed where it was dropped", async () => {
    const node = await makeCut("p", source, emptyBoard("p"), selection, { mode: "text", at: { x: 700, y: 20 } });
    expect(node.position).toEqual({ x: 700, y: 20 });
  });
});
