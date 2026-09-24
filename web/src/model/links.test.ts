import { describe, expect, it } from "vitest";
import { isNewConnection, neighbours, newEdge, notesConnectedTo } from "./links";
import { emptyBoard, type BoardEdge, type BoardNode } from "./types";

const note = (id: string): BoardNode => ({ id, type: "note", position: { x: 0, y: 0 }, data: { tags: [], collapsed: false, note: `notes/${id}.md`, origin: "reader" } });
const edge = (id: string, from: string, to: string): BoardEdge => ({ id, from, to, data: { tags: [] } });
const edges = [edge("e-1", "h-1", "n-a"), edge("e-2", "n-b", "h-1"), edge("e-3", "n-c", "n-x")];

describe("links", () => {
  it("neighbours are the other ends of every edge touching a thing, either direction", () => {
    expect(neighbours(edges, "h-1")).toEqual(["n-a", "n-b"]);
    expect(neighbours(edges, "n-zzz")).toEqual([]);
  });
  it("notesConnectedTo lists each connected note once, in nodes order", () => {
    const board = { ...emptyBoard("p"), nodes: [note("n-b"), note("n-a"), note("n-c")], edges: [...edges, edge("e-4", "n-a", "h-2")] };
    expect(notesConnectedTo(board, ["h-1", "h-2"]).map((n) => n.id)).toEqual(["n-b", "n-a"]);
  });
  it("a connection to itself, or a second line between the same two things, is not new", () => {
    expect(isNewConnection(edges, edge("e-9", "h-1", "h-1"))).toBe(false);
    expect(isNewConnection(edges, edge("e-9", "n-a", "h-1"))).toBe(false);
    expect(isNewConnection(edges, edge("e-9", "n-a", "n-b"))).toBe(true);
  });
  it("newEdge mints an id and starts with no tags", () => {
    expect(newEdge("h-1", "n-a")).toMatchObject({ id: expect.stringMatching(/^e-/), from: "h-1", to: "n-a", data: { tags: [] } });
  });
});
