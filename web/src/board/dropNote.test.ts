import { afterEach, describe, expect, it } from "vitest";
import { noteAtDrop, onEmptyBoard } from "./dropNote";

describe("a note from a line let go on empty board (addendum 4.10)", () => {
  afterEach(() => { document.body.innerHTML = ""; });

  it("a line from a mark's handle connects the highlight; from a card's own handle, the card", () => {
    const fromMark = noteAtDrop("n-chunk", "h-1", { x: 40, y: 60 });
    expect(fromMark.note).toMatchObject({ type: "note", position: { x: 40, y: 60 }, data: { origin: "reader" } });
    expect(fromMark.note.parentId).toBeUndefined();
    expect(fromMark.edge).toMatchObject({ from: "h-1", to: fromMark.note.id });
    expect(noteAtDrop("n-chunk", "n-chunk-out", { x: 0, y: 0 }).edge.from).toBe("n-chunk");
  });

  it("makes a note on the board's pane, and not on a card or a group, or outside the board", () => {
    document.body.innerHTML = `<div class="react-flow"><div class="react-flow__pane" id="pane"></div>
      <div class="react-flow__node" data-id="n-g"><div id="in-group"></div></div></div><div id="outside"></div>`;
    expect(onEmptyBoard(document.getElementById("pane"))).toBe(true);
    expect(onEmptyBoard(document.getElementById("in-group"))).toBe(false);
    expect(onEmptyBoard(document.getElementById("outside"))).toBe(false);
    expect(onEmptyBoard(null)).toBe(false);
  });
});
