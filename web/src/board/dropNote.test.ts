import { afterEach, describe, expect, it } from "vitest";
import { emptyPaneAt, noteAtDrop, onEmptyBoard } from "./dropNote";

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

describe("emptyPaneAt (double-click and drop, spec A3)", () => {
  const inPane = (className: string) => {
    const pane = document.createElement("div"); pane.className = "react-flow__pane";
    const child = document.createElement("div"); child.className = className;
    pane.appendChild(child);
    return child;
  };
  it("is the empty board, not a card, an edge or anything outside the board", () => {
    expect(emptyPaneAt(inPane("react-flow__viewport"))).toBe(true);
    expect(emptyPaneAt(inPane("react-flow__node"))).toBe(false);
    expect(emptyPaneAt(inPane("react-flow__edge"))).toBe(false);
    expect(emptyPaneAt(document.createElement("div"))).toBe(false);
    expect(emptyPaneAt(null)).toBe(false);
  });
});
