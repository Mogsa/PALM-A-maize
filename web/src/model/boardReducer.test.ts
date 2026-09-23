import { describe, expect, it } from "vitest";
import { boardReducer, initialBoardState } from "./boardReducer";
import { emptyBoard, type BoardNode, type Highlight } from "./types";

const q = { exact: "x", prefix: "", suffix: "" };
const highlight: Highlight = { id: "h-1", tags: [], note: null, anchor: { page: 0, rect: [0, 0, 1, 1], quote: q, position: 0, state: "anchored" } };
const note: BoardNode = { id: "n-1", type: "note", position: { x: 0, y: 0 }, data: { tags: [], collapsed: false, note: "notes/n-1.md" } };

describe("boardReducer", () => {
  it("load replaces the board and is clean", () => {
    const s = boardReducer(initialBoardState, { type: "load", board: { ...emptyBoard("p"), version: 3 } });
    expect(s.board.version).toBe(3);
    expect(s.dirty).toBe(false);
  });
  it("adding a highlight or node marks dirty", () => {
    let s = boardReducer(initialBoardState, { type: "load", board: emptyBoard("p") });
    s = boardReducer(s, { type: "addHighlight", highlight });
    s = boardReducer(s, { type: "addNode", node: note });
    expect(s.board.highlights).toHaveLength(1);
    expect(s.board.nodes).toHaveLength(1);
    expect(s.dirty).toBe(true);
  });
  it("a position change marks dirty but a select change does not", () => {
    let s = boardReducer(initialBoardState, { type: "load", board: { ...emptyBoard("p"), nodes: [note] } });
    s = boardReducer(s, { type: "nodes", changes: [{ type: "select", id: "n-1", selected: true }] });
    expect(s.dirty).toBe(false);
    s = boardReducer(s, { type: "nodes", changes: [{ type: "position", id: "n-1", position: { x: 5, y: 5 } }] });
    expect(s.dirty).toBe(true);
    expect(s.board.nodes[0].position).toEqual({ x: 5, y: 5 });
  });
  it("saved records the version and clears dirty", () => {
    let s = boardReducer(initialBoardState, { type: "load", board: emptyBoard("p") });
    s = boardReducer(s, { type: "addHighlight", highlight });
    s = boardReducer(s, { type: "saved", version: 1 });
    expect(s.board.version).toBe(1);
    expect(s.dirty).toBe(false);
  });
  it("removeNode drops the node and its edges", () => {
    const board = { ...emptyBoard("p"), nodes: [note, { ...note, id: "n-2" }], edges: [{ id: "e-1", source: "n-1", target: "n-2", data: { tags: [] } }] };
    let s = boardReducer(initialBoardState, { type: "load", board });
    s = boardReducer(s, { type: "removeNode", id: "n-2" });
    expect(s.board.nodes.map((n) => n.id)).toEqual(["n-1"]);
    expect(s.board.edges).toEqual([]);
  });
  it("removeNode on a group lifts its children in place, keeps nested groups and surviving edges", () => {
    const group = (id: string, x: number, y: number, parentId?: string): BoardNode =>
      ({ id, type: "group", position: { x, y }, width: 400, height: 300, data: { tags: [], name: null }, ...(parentId ? { parentId } : {}) });
    const child = (id: string, x: number, y: number, parentId: string): BoardNode => ({ ...note, id, position: { x, y }, parentId });
    const nodes = [group("n-G", 100, 100), group("n-H", 10, 20, "n-G"), child("n-C", 5, 7, "n-H"), child("n-D", 30, 40, "n-G"), { ...note, id: "n-O" }];
    const edges = [{ id: "e-1", source: "n-D", target: "n-O" }, { id: "e-2", source: "n-G", target: "n-O" }];
    let s = boardReducer(initialBoardState, { type: "load", board: { ...emptyBoard("p"), nodes, edges } });
    s = boardReducer(s, { type: "removeNode", id: "n-G" });
    const byId = new Map(s.board.nodes.map((n) => [n.id, n]));
    expect([...byId.keys()].sort()).toEqual(["n-C", "n-D", "n-H", "n-O"]);
    expect(byId.get("n-H")).toMatchObject({ position: { x: 110, y: 120 } });
    expect(byId.get("n-H")!.parentId).toBeUndefined();
    expect(byId.get("n-C")).toMatchObject({ parentId: "n-H", position: { x: 5, y: 7 } });
    expect(byId.get("n-D")!.parentId).toBeUndefined();
    expect(byId.get("n-D")!.position).toEqual({ x: 130, y: 140 });
    expect(s.board.edges.map((e) => e.id)).toEqual(["e-1"]);
  });
  it("removeNode on a nested group lifts its children into the surviving parent", () => {
    const nodes: BoardNode[] = [
      { id: "n-G", type: "group", position: { x: 100, y: 100 }, data: { tags: [], name: null } },
      { id: "n-H", type: "group", position: { x: 10, y: 20 }, parentId: "n-G", data: { tags: [], name: null } },
      { ...note, id: "n-C", position: { x: 5, y: 7 }, parentId: "n-H" },
    ];
    let s = boardReducer(initialBoardState, { type: "load", board: { ...emptyBoard("p"), nodes } });
    s = boardReducer(s, { type: "removeNode", id: "n-H" });
    expect(s.board.nodes.find((n) => n.id === "n-C")).toMatchObject({ parentId: "n-G", position: { x: 15, y: 27 } });
  });
  it("removeNode clears a highlight's note when that note is removed", () => {
    const board = { ...emptyBoard("p"), nodes: [note], highlights: [{ ...highlight, note: "n-1" }, { ...highlight, id: "h-2", note: "n-9" }] };
    let s = boardReducer(initialBoardState, { type: "load", board });
    s = boardReducer(s, { type: "removeNode", id: "n-1" });
    expect(s.board.highlights.map((h) => h.note)).toEqual([null, "n-9"]);
  });
});

describe("boardReducer, ruling 7", () => {
  it("(c) saved leaves the board dirty when it changed after the saved snapshot", () => {
    let s = boardReducer(initialBoardState, { type: "load", board: emptyBoard("p") });
    s = boardReducer(s, { type: "addHighlight", highlight });
    const snapshot = s.revision;
    s = boardReducer(s, { type: "addNode", node: note });
    s = boardReducer(s, { type: "saved", version: 1, revision: snapshot });
    expect(s.board.version).toBe(1);
    expect(s.dirty).toBe(true);
    s = boardReducer(s, { type: "saved", version: 2, revision: s.revision });
    expect(s.dirty).toBe(false);
  });
  it("(c) a select change after the snapshot does not keep the board dirty", () => {
    let s = boardReducer(initialBoardState, { type: "load", board: { ...emptyBoard("p"), nodes: [note] } });
    s = boardReducer(s, { type: "addHighlight", highlight });
    const snapshot = s.revision;
    s = boardReducer(s, { type: "nodes", changes: [{ type: "select", id: "n-1", selected: true }] });
    s = boardReducer(s, { type: "saved", version: 1, revision: snapshot });
    expect(s.dirty).toBe(false);
  });
  it("(d) a measured dimensions change does not dirty; a mid-resize change does not; the resize end does", () => {
    let s = boardReducer(initialBoardState, { type: "load", board: { ...emptyBoard("p"), nodes: [note] } });
    // React Flow's measurement (updateNodeInternals): no setAttributes, no resizing.
    s = boardReducer(s, { type: "nodes", changes: [{ type: "dimensions", id: "n-1", dimensions: { width: 200, height: 80 } }] });
    expect(s.dirty).toBe(false);
    // NodeResizer while dragging a handle.
    s = boardReducer(s, { type: "nodes", changes: [{ type: "dimensions", id: "n-1", resizing: true, setAttributes: true, dimensions: { width: 250, height: 90 } }] });
    expect(s.dirty).toBe(false);
    expect(s.board.nodes[0].width).toBe(250);
    // NodeResizer's onEnd: resizing false, no setAttributes.
    s = boardReducer(s, { type: "nodes", changes: [{ type: "dimensions", id: "n-1", resizing: false, dimensions: { width: 250, height: 90 } }] });
    expect(s.dirty).toBe(true);
  });
  it("(d) an expand-parent dimensions change (setAttributes, not resizing) dirties", () => {
    let s = boardReducer(initialBoardState, { type: "load", board: { ...emptyBoard("p"), nodes: [note] } });
    s = boardReducer(s, { type: "nodes", changes: [{ type: "dimensions", id: "n-1", setAttributes: true, dimensions: { width: 400, height: 300 } }] });
    expect(s.dirty).toBe(true);
    expect(s.board.nodes[0].height).toBe(300);
  });
});


it("saves changed viewport but ignores identical restore events", () => {
  const loaded = boardReducer(initialBoardState, { type: "load", board: emptyBoard("p") });
  expect(boardReducer(loaded, {type: "viewport", viewport: loaded.board.viewport})).toBe(loaded);
  const moved = boardReducer(loaded, {type: "viewport", viewport: {x: 120, y: 50, zoom: 1.4}});
  expect(moved.dirty).toBe(true);
  expect(moved.revision).toBe(loaded.revision + 1);
});
