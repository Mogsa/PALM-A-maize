import { describe, expect, it } from "vitest";
import type { BoardNode } from "../model/types";
import { hasNote, slotPrompt } from "./slots";

const slot: BoardNode = { id: "n-s", type: "group", position: { x: 0, y: 0 }, data: { tags: [], name: "Main point", prompt: "What is the one thing?" } };
const pile: BoardNode = { id: "n-p", type: "group", position: { x: 0, y: 0 }, data: { tags: [] } };
const note = (parentId: string): BoardNode => ({ id: "n-1", type: "note", position: { x: 0, y: 0 }, parentId, data: { tags: [], collapsed: false, note: "notes/n-1.md", origin: "reader" } });

describe("slots (D17)", () => {
  it("a note's placeholder is its slot's question, and nothing elsewhere", () => {
    expect(slotPrompt([slot, pile], "n-s")).toBe("What is the one thing?");
    expect(slotPrompt([slot, pile], "n-p")).toBeNull();
    expect(slotPrompt([slot, pile], undefined)).toBeNull();
  });
  it("a slot shows its question until it holds a note", () => {
    expect(hasNote([slot], "n-s")).toBe(false);
    expect(hasNote([slot, note("n-s")], "n-s")).toBe(true);
  });
});
