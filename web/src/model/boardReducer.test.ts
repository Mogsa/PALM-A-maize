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
