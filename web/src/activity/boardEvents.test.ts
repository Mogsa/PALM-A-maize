import { describe, expect, it, vi } from "vitest";
import { boardReducer, initialBoardState, type BoardAction, type BoardState } from "../model/boardReducer";
import { emptyBoard, type Board, type BoardEdge, type BoardNode, type ChunkNode, type Highlight } from "../model/types";
import { boardEvents, loggedDispatch } from "./boardEvents";

const q = (exact: string) => ({ exact, prefix: "", suffix: "" });
const highlight = (id: string, text = "regret", tags: string[] = []): Highlight =>
  ({ id, tags, anchor: { rects: [{ page: 0, rect: [0, 0, 1, 1] }], quote: q(text), position: 0, state: "anchored" } });
const region = { rects: [], start: q("a"), end: q("b"), position: 0, state: "anchored" as const };
const chunk = (id: string, text: string, parentId?: string): ChunkNode => ({
  id, type: "chunk", position: { x: 0, y: 0 }, ...(parentId ? { parentId } : {}),
  data: { tags: [], collapsed: false, region, user_sized: false, blocks: [{ kind: "text", page: 0, rect: [0, 0, 1, 1], text }] },
});
const figure = (id: string, caption: string): BoardNode =>
  ({ id, type: "figure", position: { x: 0, y: 0 }, data: { tags: [], collapsed: false, region, caption } });
const note = (id: string, parentId?: string): BoardNode =>
  ({ id, type: "note", position: { x: 0, y: 0 }, ...(parentId ? { parentId } : {}), data: { tags: [], collapsed: false, note: `notes/${id}.md` } });
const group = (id: string, name: string | null = null): BoardNode => ({ id, type: "group", position: { x: 0, y: 0 }, data: { tags: [], name } });
const edge = (id: string, from: string, to: string, tags: string[] = []): BoardEdge => ({ id, from, to, data: { tags } });

const board = (b: Partial<Board> = {}): Board => ({ ...emptyBoard("p"), ...b });
const loaded = (b: Board): BoardState => boardReducer(initialBoardState, { type: "load", board: b });
/** What `action` logs when dispatched on `b`. */
const events = (b: Board, action: BoardAction) => boardEvents(b, boardReducer(loaded(b), action).board, action);

describe("board events from the reducer's actions", () => {
  it("addHighlight: highlight, with its words and tags", () => {
    expect(events(board(), { type: "addHighlight", highlight: highlight("h-1", "the learner drives", ["t-a"]) }))
      .toEqual([{ kind: "build", action: "highlight", detail: { id: "h-1", text: "the learner drives", tags: ["t-a"] } }]);
  });

  it("addNode of a chunk or a figure: cut, with the first 200 characters of its text, or the caption", () => {
    const long = "word ".repeat(100);
    expect(events(board(), { type: "addNode", node: chunk("n-c", long) }))
      .toEqual([{ kind: "build", action: "cut", detail: { id: "n-c", text: long.slice(0, 200) } }]);
    expect(events(board(), { type: "addNode", node: figure("n-f", "Figure 2: results") }))
      .toEqual([{ kind: "build", action: "cut", detail: { id: "n-f", text: "Figure 2: results" } }]);
  });

  it("a new note is not logged: its text is, when its editing ends", () => {
    expect(events(board(), { type: "addNode", node: note("n-1") })).toEqual([]);
  });

  it("add with a note on a mark: the connection is logged, from and to, with its tags", () => {
    const b = board({ highlights: [highlight("h-1")] });
    expect(events(b, { type: "add", nodes: [note("n-1")], edges: [edge("e-1", "h-1", "n-1")] }))
      .toEqual([{ kind: "build", action: "connect", detail: { id: "e-1", from: "h-1", to: "n-1", tags: [] } }]);
  });

  it("a connection the reducer refuses (a repeat) logs nothing", () => {
    const b = board({ nodes: [note("n-1"), note("n-2")], edges: [edge("e-1", "n-1", "n-2")] });
    expect(events(b, { type: "add", edges: [edge("e-2", "n-1", "n-2")] })).toEqual([]);
  });

  it("upsertNodes making a group around pieces: group, with its name and members", () => {
    const b = board({ nodes: [note("n-1"), note("n-2")] });
    const nodes = [group("n-G", "Method"), note("n-1", "n-G"), note("n-2", "n-G")];
    expect(events(b, { type: "upsertNodes", nodes }))
      .toEqual([{ kind: "build", action: "group", detail: { id: "n-G", name: "Method", members: ["n-1", "n-2"] } }]);
  });

  it("upsertNodes moving a piece into an existing group: group, with all its members", () => {
    const b = board({ nodes: [group("n-G"), note("n-1", "n-G"), note("n-2")] });
    expect(events(b, { type: "upsertNodes", nodes: [note("n-2", "n-G")], merge: true }))
      .toEqual([{ kind: "build", action: "group", detail: { id: "n-G", name: null, members: ["n-1", "n-2"] } }]);
  });

  it("upsertNodes moving a piece out of a group, or a collapse, logs nothing", () => {
    const b = board({ nodes: [group("n-G"), note("n-1", "n-G")] });
    expect(events(b, { type: "upsertNodes", nodes: [note("n-1")], merge: true })).toEqual([]);
    const collapsed = { ...note("n-1", "n-G"), data: { ...note("n-1").data, collapsed: true } } as BoardNode;
    expect(events(b, { type: "replaceNode", node: collapsed })).toEqual([]);
  });

  it("setTags on a piece, a mark or an edge, and setNodeTags on several: tag, per thing", () => {
    const b = board({ nodes: [note("n-1"), note("n-2")], highlights: [highlight("h-1")], edges: [edge("e-1", "n-1", "n-2")] });
    expect(events(b, { type: "setTags", target: "node", id: "n-1", tags: ["t-a"] }))
      .toEqual([{ kind: "build", action: "tag", detail: { id: "n-1", tags: ["t-a"] } }]);
    expect(events(b, { type: "setTags", target: "highlight", id: "h-1", tags: ["t-b"] }))
      .toEqual([{ kind: "build", action: "tag", detail: { id: "h-1", tags: ["t-b"] } }]);
    expect(events(b, { type: "setTags", target: "edge", id: "e-1", tags: [] })).toEqual([]);   // unchanged
    expect(events(b, { type: "setNodeTags", tags: { "n-1": ["t-a"], "n-2": ["t-a"] } }).map((e) => e.detail))
      .toEqual([{ id: "n-1", tags: ["t-a"] }, { id: "n-2", tags: ["t-a"] }]);
  });

  it("remove and removeNode: remove, with everything that went (a node's edges too)", () => {
    const b = board({ nodes: [note("n-1"), note("n-2")], highlights: [highlight("h-1")], edges: [edge("e-1", "n-1", "n-2")] });
    expect(events(b, { type: "remove", highlightIds: ["h-1"] })).toEqual([{ kind: "build", action: "remove", detail: { ids: ["h-1"] } }]);
    expect(events(b, { type: "removeNode", id: "n-2" })).toEqual([{ kind: "build", action: "remove", detail: { ids: ["n-2", "e-1"] } }]);
  });

  it("reshape: split, cutout or join, by its op, else join when chunks go and split when they come", () => {
    const b = board({ nodes: [chunk("n-a", "one"), chunk("n-b", "two")] });
    const keep = chunk("n-a", "on");
    expect(events(b, { type: "reshape", keep, add: [chunk("n-c", "e")] }))
      .toEqual([{ kind: "build", action: "split", detail: { ids: ["n-a", "n-c"] } }]);
    expect(events(b, { type: "reshape", keep, add: [chunk("n-c", "e")], op: "cutout" })[0].action).toBe("cutout");
    expect(events(b, { type: "reshape", keep: chunk("n-a", "one two"), removeIds: ["n-b"] }))
      .toEqual([{ kind: "build", action: "join", detail: { ids: ["n-a", "n-b"] } }]);
  });

  it("undo and redo: logged when they undo or redo something", () => {
    let s = loaded(board());
    expect(boardEvents(s.board, boardReducer(s, { type: "undo" }).board, { type: "undo" })).toEqual([]);   // nothing to undo
    s = boardReducer(s, { type: "addHighlight", highlight: highlight("h-1") });
    const undone = boardReducer(s, { type: "undo" });
    expect(boardEvents(s.board, undone.board, { type: "undo" })).toEqual([{ kind: "build", action: "undo", detail: {} }]);
    expect(boardEvents(undone.board, boardReducer(undone, { type: "redo" }).board, { type: "redo" })[0].action).toBe("redo");
  });

  it("moves, resizes, loads, saves, a figure's clip and the goal are not logged", () => {
    const b = board({ nodes: [note("n-1"), figure("n-f", "c")] });
    expect(events(b, { type: "nodes", changes: [{ type: "position", id: "n-1", position: { x: 5, y: 5 } }] })).toEqual([]);
    expect(events(b, { type: "load", board: board({ highlights: [highlight("h-9")] }) })).toEqual([]);
    expect(events(b, { type: "saved", version: 2 })).toEqual([]);
    expect(events(b, { type: "setFigureClip", id: "n-f", clip: "clips/n-f.png", clip_size: { width: 1, height: 1 } })).toEqual([]);
    expect(events(b, { type: "setGoal", goal: "why" })).toEqual([]);
  });
});

describe("loggedDispatch", () => {
  it("logs the action's events and dispatches it", () => {
    const state = loaded(board());
    const dispatch = vi.fn();
    const log = vi.fn();
    const action: BoardAction = { type: "addHighlight", highlight: highlight("h-1") };
    loggedDispatch(dispatch, () => state, log)(action);
    expect(dispatch).toHaveBeenCalledWith(action);
    expect(log).toHaveBeenCalledWith("build", "highlight", { id: "h-1", text: "regret", tags: [] });
  });

  it("sees an earlier dispatch of the same tick, before React has rendered it", () => {
    const state = loaded(board());
    const log = vi.fn();
    const logged = loggedDispatch(vi.fn(), () => state, log);
    logged({ type: "addHighlight", highlight: highlight("h-1") });
    logged({ type: "setTags", target: "highlight", id: "h-1", tags: ["t-a"] });
    expect(log.mock.calls.map((c) => c[1])).toEqual(["highlight", "tag"]);
  });

  it("still dispatches when working out the events fails", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const dispatch = vi.fn();
    loggedDispatch(dispatch, () => { throw new Error("no state"); }, vi.fn())({ type: "undo" });
    expect(dispatch).toHaveBeenCalledWith({ type: "undo" });
    error.mockRestore();
  });
});
