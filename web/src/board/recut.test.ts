import { describe, expect, it } from "vitest";
import type { ChunkAnchor, ChunkNode, Piece, Rect } from "../model/types";
import { GAP } from "./layout";
import { joinPlan, pieceIndexOf, placePiece, recutPlan } from "./recut";

const q = (exact: string) => ({ exact, prefix: "", suffix: "" });
const region = (y: number): ChunkAnchor => ({ rects: [{ page: 2, rect: [50, y, 286, y + 50] as Rect }], start: q(`at ${y}`), end: q("end"), position: y, state: "anchored" });
const piece = (y: number): Piece => ({ type: "chunk", data: { tags: [], collapsed: false, user_sized: false, source_id: null, region: region(y),
  blocks: [{ kind: "text", page: 2, rect: [50, y, 286, y + 50], text: `text ${y}` }] } });
const chunk = (id: string, extra: Partial<ChunkNode> = {}, data: Partial<ChunkNode["data"]> = {}): ChunkNode => ({
  id, type: "chunk", position: { x: 100, y: 40 }, width: 300, height: 500, parentId: "n-g", ...extra,
  data: { tags: ["t-claim"], collapsed: false, user_sized: true, source_id: "sec-6", region: region(0), blocks: [], ...data },
});

describe("recutPlan (addendum 4.10)", () => {
  it("keeps the chunk as the first piece, with its id, place, tags and source_id, sized to its text again", () => {
    const plan = recutPlan(chunk("n-a"), [piece(0), piece(100), piece(200)])!;
    expect(plan.keep).toMatchObject({ id: "n-a", position: { x: 100, y: 40 }, parentId: "n-g", width: 300,
      data: { tags: ["t-claim"], source_id: "sec-6", user_sized: false, region: region(0) } });
    expect(plan.keep.height).toBeUndefined();
  });
  it("puts each later piece to the right of the one before, in the same group, without the source_id", () => {
    const { add = [] } = recutPlan(chunk("n-a"), [piece(0), piece(100), piece(200)])!;
    expect(add.map((n) => n.position)).toEqual([{ x: 100 + 300 + GAP, y: 40 }, { x: 100 + 2 * (300 + GAP), y: 40 }]);
    expect(add.every((n) => n.parentId === "n-g" && n.id.startsWith("n-") && n.id !== "n-a")).toBe(true);
    expect(add.map((n) => n.data.region)).toEqual([region(100), region(200)]);
    expect(add[0].data.source_id).toBeUndefined();
    expect(add[0].data.tags).toEqual(["t-claim"]);
  });
  it("is null when there is nothing to divide (Review Focus 4)", () => {
    expect(recutPlan(chunk("n-a"), [piece(0)])).toBeNull();
  });
});

describe("joinPlan (addendum 4.10)", () => {
  it("keeps the chunk first in paper order, takes every tag, and removes the others", () => {
    const a = chunk("n-a", {}, { tags: ["t-claim"], source_id: null });
    const b = chunk("n-b", { position: { x: 900, y: 0 } }, { tags: ["t-method", "t-claim"], source_id: "sec-6" });
    const plan = joinPlan([a, b], { node: piece(0), order: [1, 0] });
    expect(plan.keep).toMatchObject({ id: "n-b", position: { x: 900, y: 0 }, data: { tags: ["t-method", "t-claim"], source_id: "sec-6", region: region(0) } });
    expect(plan.removeIds).toEqual(["n-a"]);
  });
  it("carries the first source_id in paper order when the kept chunk has none", () => {
    const plan = joinPlan([chunk("n-a", {}, { source_id: null }), chunk("n-b", {}, { source_id: "sec-7" })], { node: piece(0), order: [0, 1] });
    expect(plan.keep.data.source_id).toBe("sec-7");
  });
});

const pieceWith = (text: string): Piece => ({ type: "chunk", data: { ...chunk("n-a").data, blocks: [{ kind: "text", page: 0, rect: [0, 0, 1, 1], text }] } });

describe("a piece cut out by a drag lands where it is dropped (spec A2)", () => {
  const pieces = [pieceWith("Before it."), pieceWith("The chosen\nwords here."), pieceWith("After it.")];
  it("finds the piece holding the selected words, whitespace aside", () => {
    expect(pieceIndexOf(pieces, { exact: "chosen words", prefix: "", suffix: "" })).toBe(1);
  });
  it("falls back to the middle of three, else the first", () => {
    expect(pieceIndexOf(pieces, { exact: "not there", prefix: "", suffix: "" })).toBe(1);
    expect(pieceIndexOf(pieces.slice(0, 2), { exact: "not there", prefix: "", suffix: "" })).toBe(0);
  });
  it("moves only that piece, out of any group, to the drop point", () => {
    const plan = recutPlan({ ...chunk("n-a"), parentId: "n-g" }, pieces)!;
    const placed = placePiece(plan, 1, { x: 900, y: 40 });
    expect(placed.add![0].position).toEqual({ x: 900, y: 40 });
    expect(placed.add![0].parentId).toBeUndefined();
    expect(placed.keep).toEqual(plan.keep);
    expect(placePiece(plan, 0, { x: 5, y: 6 }).keep.position).toEqual({ x: 5, y: 6 });
  });
});
