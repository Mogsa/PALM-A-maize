import { describe, expect, it } from "vitest";
import { GAP, nextChunkPosition } from "../board/layout";
import { spotBeside, spotForNoteOn } from "./placement";
import { emptyBoard, type BoardNode, type Highlight, type Rect } from "./types";

const q = { exact: "x", prefix: "", suffix: "" };
const region = { rects: [{ page: 0, rect: [0, 0, 100, 100] as Rect }], start: q, end: q, position: 0, state: "anchored" as const };
const chunk: BoardNode = { id: "n-c", type: "chunk", position: { x: 20, y: 48 }, parentId: "n-g", width: 320, data: { tags: [], collapsed: false, region, blocks: [], user_sized: false } };
const group: BoardNode = { id: "n-g", type: "group", position: { x: 100, y: 100 }, width: 360, height: 900, data: { tags: [] } };
const mark = (page: number): Highlight => ({ id: "h-1", tags: [], anchor: { rects: [{ page, rect: [10, 10, 50, 20] }], quote: q, position: 0, state: "anchored" } });

describe("placement", () => {
  it("a spot beside a node is to its right, at the top level, in absolute coordinates", () => {
    expect(spotBeside([group, chunk], "n-c")).toEqual({ position: { x: 100 + 20 + 320 + GAP, y: 148 } });
    expect(spotBeside([group], "n-missing")).toBeNull();
  });
  it("a note on a mark goes beside the chunk that holds it, else under everything", () => {
    const board = { ...emptyBoard("p"), nodes: [group, chunk], highlights: [mark(0)] };
    expect(spotForNoteOn(board, "h-1")).toEqual(spotBeside(board.nodes, "n-c"));
    const loose = { ...board, highlights: [mark(5)] };
    expect(spotForNoteOn(loose, "h-1")).toEqual({ position: nextChunkPosition(board.nodes) });
  });
  it("a note on a mark goes beside the chunk that draws its lines: the reader's, not the tray's (contract 3)", () => {
    const tray: BoardNode = { ...group, data: { tags: [], tray: true } };
    const reader: BoardNode = { ...chunk, id: "n-reader", parentId: undefined, position: { x: 900, y: 40 } };
    const board = { ...emptyBoard("p"), nodes: [tray, chunk, reader], highlights: [mark(0)] };
    expect(spotForNoteOn(board, "h-1")).toEqual(spotBeside(board.nodes, "n-reader"));
  });
  it("a figure holds no mark: a note on a mark only a figure covers goes under everything", () => {
    const figure: BoardNode = { id: "n-f", type: "figure", position: { x: 0, y: 0 }, data: { tags: [], collapsed: false, caption: "Figure 1", region } };
    const board = { ...emptyBoard("p"), nodes: [figure], highlights: [mark(0)] };
    expect(spotForNoteOn(board, "h-1")).toEqual({ position: nextChunkPosition(board.nodes) });
  });
});
