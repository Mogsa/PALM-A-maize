import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyBoard, type Board, type Highlight } from "../model/types";

const h: Highlight = {
  id: "h-1", tags: ["t-term"], anchor: { rects: [{ page: 0, rect: [0, 0, 10, 10] }], quote: { exact: "residual nets", prefix: "", suffix: "" }, position: 0, state: "anchored" },
};
let board: Board;
const notes: Record<string, string> = { "n-mine": "Nets that learn **what to add** to their input." };
const source = { sections: [], figures: [], pages: [], regions: [], page_text: [{ page: 4, text: "We evaluate 18-layer residual nets (ResNets). Then more." }] };
vi.mock("../state/BoardProvider", () => ({ useBoard: () => ({ state: { board }, dispatch: vi.fn(), source }), useNote: (id: string) => ({ text: notes[id] }) }));
vi.mock("../state/TagsProvider", () => ({ useTags: () => ({ tags: [{ id: "t-term", name: "term", colour: "#0F766E" }] }) }));
import { TermBody } from "./TermBody";

afterEach(cleanup);

describe("TermBody (D27): a term's card", () => {
  it("shows the reader's definition, then the paper's likely definition with Go there, and no Look up elsewhere", () => {
    board = { ...emptyBoard("p"), highlights: [h], nodes: [{ id: "n-mine", type: "note", position: { x: 0, y: 0 }, data: { tags: [], collapsed: false, note: "notes/n-mine.md", origin: "reader" } }],
      edges: [{ id: "e-1", from: "h-1", to: "n-mine", data: { tags: [] } }] };
    const onGo = vi.fn();
    const onOpenNote = vi.fn();
    const { container, getByRole } = render(<TermBody highlight={h} onGo={onGo} onOpenNote={onOpenNote} />);
    const text = container.textContent!;
    const order = ["Your definition", "what to add", "In this paper", "residual nets (ResNets)"].map((s) => text.indexOf(s));
    expect(text).not.toContain("Look up elsewhere");
    expect(order.every((at) => at >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(container.querySelector("strong")?.textContent).toBe("what to add");   // rendered as Markdown
    fireEvent.click(getByRole("button", { name: "Go there" }));
    expect(onGo).toHaveBeenCalledWith({ page: 4, rect: [0, 0, 0, 0] });
    fireEvent.click(getByRole("button", { name: "Open your note" }));
    expect(onOpenNote).toHaveBeenCalledWith("n-mine");
  });
  it("shows nothing when there is neither", () => {
    board = { ...emptyBoard("p"), highlights: [{ ...h, anchor: { ...h.anchor, quote: { ...h.anchor.quote, exact: "Then" } } }] };
    const { container } = render(<TermBody highlight={board.highlights[0]} onGo={vi.fn()} onOpenNote={vi.fn()} />);
    expect(container.textContent).not.toContain("Your definition");
    expect(container.textContent).not.toContain("In this paper");
    expect(container.textContent).toBe("");
  });
});
