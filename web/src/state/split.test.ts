import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyBoard, type BoardNode, type Rect, type Source } from "../model/types";

vi.mock("../api/client", () => ({ CLIP_DPI: 216, api: { split: vi.fn(), getTemplate: vi.fn(), putClip: vi.fn() } }));
import { api } from "../api/client";
import { planFirstOpen, planSplit, storeFigureClips } from "./split";

const q = { exact: "x", prefix: "", suffix: "" };
const region = { rects: [{ page: 1, rect: [60, 250, 500, 350] as Rect }], start: q, end: q, position: 0, state: "anchored" as const };
const source = { regions: [], sections: [], figures: [] } as unknown as Source;
const figure = (id: string, clip: string | null = null): BoardNode => ({ id, type: "figure", position: { x: 0, y: 0 }, data: { tags: [], collapsed: true, region, caption: "c", clip, clip_size: null } });

beforeEach(() => { vi.clearAllMocks(); vi.spyOn(console, "error").mockImplementation(() => undefined); });

describe("first open and split", () => {
  it("planFirstOpen lays out only the template's slots: no tray, and split is not asked", async () => {
    vi.mocked(api.getTemplate).mockResolvedValue({ schema: 1, slots: [{ name: "A", prompt: "a?" }, { name: "B", prompt: "b?" }] });
    const nodes = await planFirstOpen("p", source);
    expect(nodes.map((n) => n.type === "group" && n.data.prompt)).toEqual(["a?", "b?"]);
    expect(api.split).not.toHaveBeenCalled();
  });
  it("planSplit saves pending changes before asking the server, and adds nothing when nothing is missing", async () => {
    const order: string[] = [];
    vi.mocked(api.split).mockImplementation(async () => { order.push("split"); return { nodes: [] }; });
    expect(await planSplit("p", source, () => emptyBoard("p"), async () => { order.push("flush"); })).toEqual([]);
    expect(order).toEqual(["flush", "split"]);
  });
  it("storeFigureClips stores each figure that has no clip at 216 dpi, and returns the ones that failed", async () => {
    vi.mocked(api.putClip)
      .mockResolvedValueOnce({ clip: "clips/n-f1.png", clip_size: { width: 3, height: 4 } })
      .mockRejectedValueOnce(new Error("render failed"));
    const dispatch = vi.fn();
    const failed = await storeFigureClips("p", [figure("n-f1"), figure("n-f2"), figure("n-f3", "clips/n-f3.png")], dispatch);
    expect(api.putClip).toHaveBeenCalledTimes(2);
    expect(api.putClip).toHaveBeenCalledWith("p", "n-f1", region.rects[0], 216);
    expect(dispatch).toHaveBeenCalledWith({ type: "setFigureClip", id: "n-f1", clip: "clips/n-f1.png", clip_size: { width: 3, height: 4 } });
    expect(failed).toEqual(["n-f2"]);
  });
});
