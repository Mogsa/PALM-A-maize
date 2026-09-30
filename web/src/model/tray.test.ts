import { describe, expect, it } from "vitest";
import {
  findTray, firstLayout, isTray, SLOT_GAP, SLOT_HEIGHT, SLOT_WIDTH, SLOTS_OFFSET, splitIntoTray,
  TRAY_NAME, TRAY_PIECE_WIDTH, TRAY_WIDTH, trayHeight, trayRow, TRAYS_ENABLED,
} from "./tray";
import { emptyBoard, type BoardNode, type GroupNode, type Rect, type Source, type SplitDraft, type TemplateFile } from "./types";

const q = { exact: "x", prefix: "", suffix: "" };
const pr = (page: number, rect: Rect) => ({ page, rect });
const section = (id: string, y: number) => ({ id, number: id.slice(4), depth: 1, title: id, heading_rect: pr(0, [60, y, 200, y + 10]), extent: [pr(0, [60, y, 500, y + 100])], text: "" });
const source = {
  regions: [{ page: 0, rect: [50, 50, 560, 700], label: "text" }],
  sections: [section("sec-1", 100), section("sec-2", 400)],
  figures: [{ id: "fig-1", kind: "figure", label: "Figure 1", caption: "Figure 1: x", caption_rect: null, rect: pr(0, [60, 250, 500, 350]), confidence: "region" }],
} as unknown as Source;
const region = (y: number) => ({ rects: [pr(0, [60, y, 500, y + 100])], start: q, end: q, position: 0, state: "anchored" as const });
const draft = (source_id: string, y: number, type: "chunk" | "figure" = "chunk"): SplitDraft => (type === "chunk"
  ? { type, position: { x: 0, y: 999 }, data: { tags: [], collapsed: true, region: region(y), blocks: [], user_sized: false, source_id } }
  : { type, position: { x: 0, y: 999 }, data: { tags: [], collapsed: true, region: region(y), caption: "Figure 1: x", clip: null, clip_size: null, source_id } });
const template: TemplateFile = { schema: 1, slots: Array.from({ length: 9 }, (_, i) => ({ name: `Slot ${i}`, prompt: `Question ${i}?` })) };
const sourceId = (n: BoardNode) => (n.data as { source_id?: string }).source_id;

describe("first layout (D15, addendum 4.9)", () => {
  it("is the tray, its pieces at their paper-order rows, then nine slots in three columns to its right", () => {
    const [tray, ...rest] = firstLayout([draft("sec-2", 400), draft("fig-1", 250, "figure"), draft("sec-1", 100)], template, source);
    expect(tray).toMatchObject({ type: "group", position: { x: 0, y: 0 }, width: TRAY_WIDTH, height: trayHeight(3), data: { name: TRAY_NAME, tray: true } });
    const pieces = rest.filter((n) => n.parentId === tray.id);
    expect(pieces.map(sourceId)).toEqual(["sec-2", "fig-1", "sec-1"]);
    expect(pieces.map((n) => n.position)).toEqual([trayRow(2), trayRow(1), trayRow(0)]);
    expect(pieces.every((n) => n.width === TRAY_PIECE_WIDTH && n.id.startsWith("n-"))).toBe(true);
    const slots = rest.filter((n): n is GroupNode => n.type === "group");
    expect(slots).toHaveLength(9);
    expect(slots[0]).toMatchObject({ position: { x: TRAY_WIDTH + SLOTS_OFFSET, y: 0 }, width: SLOT_WIDTH, height: SLOT_HEIGHT, data: { name: "Slot 0", prompt: "Question 0?" } });
    expect(slots[4].position).toEqual({ x: TRAY_WIDTH + SLOTS_OFFSET + SLOT_WIDTH + SLOT_GAP, y: SLOT_HEIGHT + SLOT_GAP });
    expect(slots.every((g) => !g.parentId && !g.data.tray)).toBe(true);
  });
});

describe("split into the tray (D16)", () => {
  const tray = (height: number): GroupNode => ({ id: "n-tray", type: "group", position: { x: 10, y: 10 }, width: TRAY_WIDTH, height, data: { tags: [], name: TRAY_NAME, tray: true } });

  it("grows the tray to hold every row and adds the pieces as its children", () => {
    const [grown, piece] = splitIntoTray({ ...emptyBoard("p"), nodes: [tray(50)] }, [draft("fig-1", 250, "figure")], source);
    expect(grown).toMatchObject({ id: "n-tray", height: trayHeight(3) });
    expect(piece).toMatchObject({ type: "figure", parentId: "n-tray", position: trayRow(1) });
  });
  it("never shrinks a tray the reader made bigger", () => {
    expect(splitIntoTray({ ...emptyBoard("p"), nodes: [tray(5000)] }, [draft("sec-1", 100)], source)[0].height).toBe(5000);
  });
  it("makes a new tray left of everything when the board has none", () => {
    const other: BoardNode = { id: "n-g", type: "group", position: { x: 500, y: 80 }, width: 400, height: 300, data: { tags: [] } };
    const [made] = splitIntoTray({ ...emptyBoard("p"), nodes: [other] }, [draft("sec-1", 100)], source);
    expect(made).toMatchObject({ position: { x: 500 - TRAY_WIDTH - SLOTS_OFFSET, y: 80 }, data: { tray: true, name: TRAY_NAME } });
    expect(made.id).not.toBe("n-g");
  });
  it("the tray is the first group marked tray", () => {
    expect(findTray([{ ...tray(50), id: "n-a", data: { tags: [] } }, tray(50)], true)?.id).toBe("n-tray");
    expect(findTray([], true)).toBeUndefined();
  });
  it("still grows the marked group when trays are off: split is the tray's own machinery", () => {
    expect(splitIntoTray({ ...emptyBoard("p"), nodes: [tray(50)] }, [draft("sec-1", 100)], source)[0].id).toBe("n-tray");
  });
});

describe("trays off (owner, 30 Sep 2026)", () => {
  const marked: GroupNode = { id: "n-tray", type: "group", position: { x: 0, y: 0 }, data: { tags: [], name: TRAY_NAME, tray: true } };
  it("are off everywhere", () => expect(TRAYS_ENABLED).toBe(false));
  it("with trays off a group marked tray is no tray, and keeps its mark", () => {
    expect(isTray(marked, false)).toBe(false);
    expect(findTray([marked], false)).toBeUndefined();
    expect(findTray([marked])).toBeUndefined();
    expect(marked.data.tray).toBe(true);
  });
  it("with trays on it is the tray", () => {
    expect(isTray(marked, true)).toBe(true);
    expect(isTray({ ...marked, data: { tags: [] } }, true)).toBe(false);
  });
});
