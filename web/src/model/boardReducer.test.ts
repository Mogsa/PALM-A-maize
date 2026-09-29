import { describe, expect, it } from "vitest";
import { boardReducer, initialBoardState, type BoardAction, type BoardState } from "./boardReducer";
import { UNDO_LIMIT } from "./history";
import { emptyBoard, type Board, type BoardEdge, type BoardNode, type Highlight, type NoteNode, type Rect } from "./types";

const q = { exact: "x", prefix: "", suffix: "" };
const highlight: Highlight = { id: "h-1", tags: [], anchor: { rects: [{ page: 0, rect: [0, 0, 1, 1] }], quote: q, position: 0, state: "anchored" } };
const edge = (id: string, from: string, to: string) => ({ id, from, to, data: { tags: [] } });
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
    const board = { ...emptyBoard("p"), nodes: [note, { ...note, id: "n-2" }], edges: [edge("e-1", "n-1", "n-2")] };
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
    const edges = [edge("e-1", "n-D", "n-O"), edge("e-2", "n-G", "n-O")];
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
  it("removeNode drops every edge with an end on the node, either end, and leaves highlights alone", () => {
    const board = { ...emptyBoard("p"), nodes: [note, { ...note, id: "n-2" }], highlights: [highlight],
      edges: [edge("e-from", "n-1", "h-1"), edge("e-to", "h-1", "n-1"), edge("e-other", "h-1", "n-2")] };
    let s = boardReducer(initialBoardState, { type: "load", board });
    s = boardReducer(s, { type: "removeNode", id: "n-1" });
    expect(s.board.edges.map((e) => e.id)).toEqual(["e-other"]);
    expect(s.board.highlights).toEqual([highlight]);
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
  it("(d) a resize by the reader marks a chunk user_sized; a measurement does not", () => {
    const region = { rects: [{ page: 0, rect: [0, 0, 1, 1] as [number, number, number, number] }], start: q, end: q, position: 0, state: "anchored" as const };
    const chunk: BoardNode = { id: "n-c", type: "chunk", position: { x: 0, y: 0 }, data: { tags: [], collapsed: false, region, blocks: [], user_sized: false } };
    const sized = (s: ReturnType<typeof boardReducer>) => (s.board.nodes[0].data as { user_sized: boolean }).user_sized;
    let s = boardReducer(initialBoardState, { type: "load", board: { ...emptyBoard("p"), nodes: [chunk] } });
    s = boardReducer(s, { type: "nodes", changes: [{ type: "dimensions", id: "n-c", dimensions: { width: 200, height: 80 } }] });
    expect(sized(s)).toBe(false);
    s = boardReducer(s, { type: "nodes", changes: [{ type: "dimensions", id: "n-c", resizing: true, setAttributes: true, dimensions: { width: 250, height: 90 } }] });
    s = boardReducer(s, { type: "nodes", changes: [{ type: "dimensions", id: "n-c", resizing: false, dimensions: { width: 250, height: 90 } }] });
    expect(sized(s)).toBe(true);
    expect(s.dirty).toBe(true);
  });
  it("(d) an expand-parent dimensions change (setAttributes, not resizing) dirties", () => {
    let s = boardReducer(initialBoardState, { type: "load", board: { ...emptyBoard("p"), nodes: [note] } });
    s = boardReducer(s, { type: "nodes", changes: [{ type: "dimensions", id: "n-1", setAttributes: true, dimensions: { width: 400, height: 300 } }] });
    expect(s.dirty).toBe(true);
    expect(s.board.nodes[0].height).toBe(300);
  });
});



const qq = { exact: "x", prefix: "", suffix: "" };
const area = { rects: [{ page: 0, rect: [0, 0, 100, 100] as Rect }], start: qq, end: qq, position: 0, state: "anchored" as const };
const aNote = (id: string, extra: Partial<NoteNode> = {}): BoardNode =>
  ({ id, type: "note", position: { x: 0, y: 0 }, data: { tags: [], collapsed: false, note: `notes/${id}.md`, origin: "reader" }, ...extra } as BoardNode);
const aChunk = (id: string): BoardNode => ({ id, type: "chunk", position: { x: 0, y: 0 }, width: 320, data: { tags: [], collapsed: false, region: area, blocks: [], user_sized: false } });
const aGroup = (id: string, x: number, y: number): BoardNode => ({ id, type: "group", position: { x, y }, width: 400, height: 300, data: { tags: [] } });
const aMark = (id: string): Highlight => ({ id, tags: [], anchor: { rects: [{ page: 0, rect: [10, 10, 50, 20] }], quote: qq, position: 0, state: "anchored" } });
const anEdge = (id: string, from: string, to: string): BoardEdge => ({ id, from, to, data: { tags: [] } });
const opened = (parts: Partial<Board> = {}) => boardReducer(initialBoardState, { type: "load", board: { ...emptyBoard("p"), version: 1, ...parts } });
const run = (state: BoardState, ...actions: BoardAction[]) => actions.reduce(boardReducer, state);

describe("undo and redo (addendum 4.7)", () => {
  it("an edit is one step: undo takes it back and saves, redo puts it again", () => {
    const added = run(opened(), { type: "add", nodes: [aNote("n-1")] });
    const undone = run(added, { type: "undo" });
    expect(undone.board.nodes).toEqual([]);
    expect(undone.dirty).toBe(true);
    expect(undone.revision).toBe(added.revision + 1);
    expect(run(undone, { type: "redo" }).board.nodes.map((n) => n.id)).toEqual(["n-1"]);
  });

  it("a drag is one step, recorded when it stops", () => {
    const s = run(opened({ nodes: [aNote("n-1")] }),
      { type: "nodes", changes: [{ type: "position", id: "n-1", position: { x: 5, y: 5 }, dragging: true }] },
      { type: "nodes", changes: [{ type: "position", id: "n-1", position: { x: 9, y: 9 }, dragging: true }] },
      { type: "nodes", changes: [{ type: "position", id: "n-1", position: { x: 10, y: 10 }, dragging: false }] });
    expect(s.history.past).toHaveLength(1);
    expect(run(s, { type: "undo" }).board.nodes[0].position).toEqual({ x: 0, y: 0 });
  });

  it("a re-parent merged into the drag undoes with it, whichever arrives first", () => {
    const s = run(opened({ nodes: [aGroup("n-g", 100, 100), aNote("n-1")] }),
      { type: "nodes", changes: [{ type: "position", id: "n-1", position: { x: 150, y: 150 }, dragging: true }] },
      { type: "replaceNode", node: aNote("n-1", { parentId: "n-g", position: { x: 50, y: 50 } }), merge: true },
      { type: "nodes", changes: [{ type: "position", id: "n-1", position: { x: 50, y: 50 }, dragging: false }] });
    expect(s.history.past).toHaveLength(1);
    const back = run(s, { type: "undo" }).board.nodes.find((n) => n.id === "n-1")!;
    expect(back.parentId).toBeUndefined();
    expect(back.position).toEqual({ x: 0, y: 0 });
  });

  it("a resize is one step, recorded when it ends", () => {
    const s = run(opened({ nodes: [aNote("n-1")] }),
      { type: "nodes", changes: [{ type: "dimensions", id: "n-1", resizing: true, setAttributes: true, dimensions: { width: 300, height: 90 } }] },
      { type: "nodes", changes: [{ type: "dimensions", id: "n-1", resizing: false, dimensions: { width: 300, height: 90 } }] });
    expect(s.history.past).toHaveLength(1);
    expect(run(s, { type: "undo" }).board.nodes[0].width).toBeUndefined();
  });

  it("a resize from the left or top edge is one step too, though each frame also moves the node", () => {
    const frame = (x: number) => ({ type: "nodes" as const, changes: [
      { type: "position" as const, id: "n-1", position: { x, y: 0 } },
      { type: "dimensions" as const, id: "n-1", resizing: true, setAttributes: true, dimensions: { width: 300 - x, height: 90 } },
    ] });
    const start = opened({ nodes: [aNote("n-1")] });
    const s = run(start, frame(-5), frame(-10), frame(-15),
      { type: "nodes", changes: [{ type: "dimensions", id: "n-1", resizing: false, dimensions: { width: 315, height: 90 } }] });
    expect(s.history.past).toHaveLength(1);
    expect(run(s, { type: "undo" }).board.nodes[0].position).toEqual({ x: 0, y: 0 });
  });

  it("selecting and measuring are neither saved nor recorded", () => {
    const start = opened({ nodes: [aNote("n-1")] });
    const s = run(start,
      { type: "nodes", changes: [{ type: "select", id: "n-1", selected: true }] },
      { type: "nodes", changes: [{ type: "dimensions", id: "n-1", dimensions: { width: 200, height: 80 } }] });
    expect(s.history.past).toHaveLength(0);
    expect(s.revision).toBe(start.revision);
  });

  it("the goal is saved but never undone (view state is not the board's at all)", () => {
    let s = run(opened(), { type: "add", nodes: [aNote("n-1")] }, { type: "setGoal", goal: "why" });
    expect(s.history.past).toHaveLength(1);
    s = run(s, { type: "undo" });
    expect(s.board.nodes).toEqual([]);
    expect(s.board.goal).toBe("why");
    expect(s.board).not.toHaveProperty("view");
  });

  it("a new edit clears what could be redone", () => {
    const s = run(opened(), { type: "add", nodes: [aNote("n-1")] }, { type: "undo" }, { type: "add", nodes: [aNote("n-2")] });
    expect(s.history.future).toEqual([]);
    expect(run(s, { type: "redo" })).toBe(s);
  });

  it("keeps the last 100 steps, and undo with nothing left changes nothing", () => {
    let s = opened();
    for (let i = 0; i < UNDO_LIMIT + 5; i++) s = run(s, { type: "add", nodes: [aNote(`n-${i}`)] });
    expect(s.history.past).toHaveLength(UNDO_LIMIT);
    for (let i = 0; i < UNDO_LIMIT; i++) s = run(s, { type: "undo" });
    expect(s.board.nodes).toHaveLength(5);
    expect(run(s, { type: "undo" })).toBe(s);
  });

  it("load clears the history, so undo never reaches past a conflict reload", () => {
    const s = run(opened(), { type: "add", nodes: [aNote("n-1")] }, { type: "load", board: { ...emptyBoard("p"), version: 7 } });
    expect(s.history).toEqual({ past: [], future: [], pending: null });
  });

  it("an edit that changes nothing records nothing and saves nothing", () => {
    const start = opened({ nodes: [aNote("n-1")] });
    expect(run(start, { type: "replaceNode", node: aNote("n-missing") })).toBe(start);
    expect(run(start, { type: "add" })).toBe(start);
    expect(run(start, { type: "remove", nodeIds: ["n-missing"] })).toBe(start);
  });
});

describe("add, remove, tags", () => {
  it("add puts nodes, highlights and edges in together, as one step", () => {
    const s = run(opened(), { type: "add", nodes: [aNote("n-1")], highlights: [aMark("h-1")], edges: [anEdge("e-1", "h-1", "n-1")] });
    expect(s.board.edges).toHaveLength(1);
    expect(s.history.past).toHaveLength(1);
  });

  it("add skips a line to itself and a second line between the same two things", () => {
    const s = run(opened({ nodes: [aNote("n-1"), aNote("n-2")], edges: [anEdge("e-1", "n-1", "n-2")] }),
      { type: "add", edges: [anEdge("e-2", "n-2", "n-1"), anEdge("e-3", "n-1", "n-1")] });
    expect(s.board.edges.map((e) => e.id)).toEqual(["e-1"]);
  });

  it("remove dissolves a group in place, drops edges on what it removed, and undoes in one step", () => {
    const child = aNote("n-C", { parentId: "n-G", position: { x: 5, y: 7 } });
    const start = opened({
      nodes: [aGroup("n-G", 100, 100), child, aNote("n-O")], highlights: [aMark("h-1")],
      edges: [anEdge("e-1", "n-C", "n-O"), anEdge("e-2", "n-G", "n-O"), anEdge("e-3", "h-1", "n-O")],
    });
    const s = run(start, { type: "remove", nodeIds: ["n-G"] });
    const lifted = s.board.nodes.find((n) => n.id === "n-C")!;
    expect(lifted.parentId).toBeUndefined();
    expect(lifted.position).toEqual({ x: 105, y: 107 });
    expect(s.board.edges.map((e) => e.id)).toEqual(["e-1", "e-3"]);
    expect(s.board.highlights).toHaveLength(1);
    expect(run(s, { type: "undo" }).board).toEqual(start.board);
  });

  it("removing a highlight drops its edges; removing a chunk keeps the highlights on the paper", () => {
    const start = opened({ nodes: [aChunk("n-c"), aNote("n-1")], highlights: [aMark("h-1")], edges: [anEdge("e-1", "h-1", "n-1")] });
    expect(run(start, { type: "remove", highlightIds: ["h-1"] }).board).toMatchObject({ highlights: [], edges: [] });
    const cut = run(start, { type: "remove", nodeIds: ["n-c"] }).board;
    expect(cut.highlights).toHaveLength(1);
    expect(cut.edges).toHaveLength(1);   // the edge ends on the highlight, not on the chunk that held it (D12)
  });

  it("a node removed by React Flow's delete key takes its edges with it, so the next save is valid", () => {
    const start = opened({ nodes: [aNote("n-1"), aNote("n-2"), aNote("n-3")], highlights: [aMark("h-1")],
      edges: [anEdge("e-1", "h-1", "n-1"), anEdge("e-2", "n-2", "n-1"), anEdge("e-3", "n-2", "n-3")] });
    const s = run(start, { type: "nodes", changes: [{ type: "remove", id: "n-1" }] });
    expect(s.board.edges.map((e) => e.id)).toEqual(["e-3"]);
    expect(run(s, { type: "undo" }).board.edges).toHaveLength(3);
  });

  it("removes selected edges by id", () => {
    const s = run(opened({ nodes: [aNote("n-1"), aNote("n-2")], edges: [anEdge("e-1", "n-1", "n-2")] }), { type: "remove", edgeIds: ["e-1"] });
    expect(s.board.edges).toEqual([]);
  });

  it("setTags tags a node, a highlight or an edge", () => {
    const s = run(opened({ nodes: [aNote("n-1"), aNote("n-2")], highlights: [aMark("h-1")], edges: [anEdge("e-1", "n-1", "n-2")] }),
      { type: "setTags", target: "node", id: "n-1", tags: ["t-a"] },
      { type: "setTags", target: "highlight", id: "h-1", tags: ["t-b"] },
      { type: "setTags", target: "edge", id: "e-1", tags: ["t-c"] });
    expect(s.board.nodes[0].data.tags).toEqual(["t-a"]);
    expect(s.board.highlights[0].tags).toEqual(["t-b"]);
    expect(s.board.edges[0].data.tags).toEqual(["t-c"]);
    expect(s.history.past).toHaveLength(3);
  });

  it("upsertNodes replaces what exists and appends the rest, as one step", () => {
    const s = run(opened({ nodes: [aGroup("n-t", 0, 0)] }),
      { type: "upsertNodes", nodes: [{ ...aGroup("n-t", 0, 0), height: 900 }, aNote("n-1", { parentId: "n-t" })] });
    expect(s.board.nodes.map((n) => n.id)).toEqual(["n-t", "n-1"]);
    expect(s.board.nodes[0].height).toBe(900);
    expect(s.history.past).toHaveLength(1);
  });

  it("a resize by the reader marks notes and figures user_sized too", () => {
    const s = run(opened({ nodes: [aNote("n-1")] }),
      { type: "nodes", changes: [{ type: "dimensions", id: "n-1", resizing: false, dimensions: { width: 300, height: 90 } }] });
    expect((s.board.nodes[0].data as { user_sized?: boolean }).user_sized).toBe(true);
  });
});

describe("figure clips are outside undo", () => {
  it("setFigureClip fills the clip on the board and in every snapshot, and records nothing", () => {
    const figure: BoardNode = { id: "n-f", type: "figure", position: { x: 0, y: 0 }, width: 320, data: { tags: [], collapsed: true, region: area, caption: "Figure 1", clip: null, clip_size: null } };
    let s = run(opened({ nodes: [figure] }), { type: "add", nodes: [aNote("n-1")] });
    s = run(s, { type: "setFigureClip", id: "n-f", clip: "clips/n-f.png", clip_size: { width: 600, height: 400 } });
    expect(s.history.past).toHaveLength(1);
    expect(s.dirty).toBe(true);
    const inPast = s.history.past[0].nodes.find((n) => n.id === "n-f")!;
    expect(inPast.data).toMatchObject({ clip: "clips/n-f.png" });
    expect(run(s, { type: "undo" }).board.nodes[0].data).toMatchObject({ clip: "clips/n-f.png" });
  });
});

describe("setNodeTags (spec A3)", () => {
  it("setNodeTags retags several nodes as one undo step (spec A3, ● on a multi-selection)", () => {
    const other: BoardNode = { ...note, id: "n-2" };
    let s = boardReducer(initialBoardState, { type: "load", board: { ...emptyBoard("p"), nodes: [note, other] } });
    s = boardReducer(s, { type: "setNodeTags", tags: { "n-1": ["t-q"], "n-2": ["t-q", "t-s"] } });
    expect(s.board.nodes.map((n) => n.data.tags)).toEqual([["t-q"], ["t-q", "t-s"]]);
    s = boardReducer(s, { type: "undo" });
    expect(s.board.nodes.map((n) => n.data.tags)).toEqual([[], []]);
  });
});
