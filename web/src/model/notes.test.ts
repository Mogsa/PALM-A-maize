import { describe, expect, it } from "vitest";
import { firstLine, NOTE_WIDTH, newNote } from "./notes";

describe("notes", () => {
  it("a new note is empty, sized to its content, and keeps its origin", () => {
    const note = newNote({ position: { x: 10, y: 20 }, origin: "ai" });
    expect(note).toMatchObject({ type: "note", position: { x: 10, y: 20 }, initialWidth: NOTE_WIDTH, data: { tags: [], collapsed: false, origin: "ai" } });
    expect(note.data.note).toBe(`notes/${note.id}.md`);
    expect(note.parentId).toBeUndefined();
  });
  it("a note made inside a group is its child", () => {
    expect(newNote({ position: { x: 0, y: 0 }, parentId: "n-g", origin: "reader" }).parentId).toBe("n-g");
  });
  it("firstLine is the first non-empty line without Markdown heading marks, cut at max", () => {
    expect(firstLine("\n\n  ## Multi-head attention  \nmore")).toBe("Multi-head attention");
    expect(firstLine("abcdefghij", 5)).toBe("abcd…");
    expect(firstLine("")).toBe("");
  });
});
