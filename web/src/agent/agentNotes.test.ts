import { describe, expect, it } from "vitest";
import { nextChunkPosition } from "../board/layout";
import { spotBeside, spotForNoteOn } from "../model/placement";
import { emptyBoard, type Board, type BoardNode, type Highlight } from "../model/types";
import { agentCommands, agentNoteMarkdown, placedAgentNote, targetOf, type AgentNote } from "./agentNotes";

const q = { exact: "the degradation problem appears when deeper nets start to converge", prefix: "", suffix: "" };
const mark: Highlight = { id: "h-1", tags: [], anchor: { rects: [{ page: 1, rect: [10, 10, 50, 20] }], quote: q, position: 0, state: "anchored" } };
const region = { rects: [{ page: 0, rect: [0, 0, 100, 100] as [number, number, number, number] }], start: { ...q, exact: "3.1. Residual Learning\nLet us" }, end: q, position: 0, state: "anchored" as const };
const chunk: BoardNode = { id: "n-c", type: "chunk", position: { x: 0, y: 0 }, width: 320, data: { tags: [], collapsed: false, region, blocks: [], user_sized: false } };
const note: BoardNode = { id: "n-n", type: "note", position: { x: 0, y: 400 }, data: { tags: [], collapsed: false, note: "notes/n-n.md", origin: "reader" } };
const board: Board = { ...emptyBoard("p"), nodes: [chunk, note], highlights: [mark] };
const agentNote = (over: Partial<AgentNote> = {}): AgentNote =>
  ({ file: "why.md", title: "Why it degrades", on: null, text: "Not overfitting (p. 1, §1).\n", modified: "2026-09-30T10:00:00Z", ...over });

describe("agent notes", () => {
  it("finds what a note is on: a highlight with its first line, a piece or a note; nothing when it is not on the board", () => {
    expect(targetOf(board, "h-1")).toEqual({ kind: "highlight", id: "h-1", label: "the degradation problem appears when deeper…", at: mark.anchor.rects[0] });
    expect(targetOf(board, "n-c")).toEqual({ kind: "node", id: "n-c", label: "3.1. Residual Learning" });
    expect(targetOf(board, "n-n")).toEqual({ kind: "node", id: "n-n", label: "Note" });
    expect(targetOf(board, "h-gone")).toBeNull();
    expect(targetOf(board, null)).toBeNull();
  });
  it("its text on the board keeps the title as a heading, then the agent's words", () => {
    expect(agentNoteMarkdown(agentNote())).toBe("# Why it degrades\n\nNot overfitting (p. 1, §1).\n");
    expect(agentNoteMarkdown(agentNote({ title: null }))).toBe("Not overfitting (p. 1, §1).\n");
  });
  it("placed on a highlight: one AI note beside the chunk that holds it, connected to the highlight", () => {
    const { note: placed, edges } = placedAgentNote(board, agentNote({ on: "h-1" }));
    expect(placed.type).toBe("note");
    expect(placed.data.origin).toBe("ai");
    expect(placed.position).toEqual(spotForNoteOn(board, "h-1").position);
    expect(edges).toEqual([expect.objectContaining({ from: "h-1", to: placed.id })]);
  });
  it("placed on a node: beside it and connected; on nothing, or on something gone: under everything, unconnected", () => {
    const onNode = placedAgentNote(board, agentNote({ on: "n-c" }));
    expect(onNode.note.position).toEqual(spotBeside(board.nodes, "n-c")!.position);
    expect(onNode.edges).toEqual([expect.objectContaining({ from: "n-c", to: onNode.note.id })]);
    for (const on of [null, "h-gone"]) {
      const loose = placedAgentNote(board, agentNote({ on }));
      expect(loose.note.position).toEqual(nextChunkPosition(board.nodes));
      expect(loose.edges).toEqual([]);
    }
  });
  it("⌘K opens the panel", () => {
    const open = (() => {}) as () => void;
    expect(agentCommands({ open })).toEqual([expect.objectContaining({ id: "agent-notes", label: "Agent notes", run: open })]);
  });
});
