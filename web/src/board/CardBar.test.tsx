import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyBoard, type BoardNode } from "../model/types";

const dispatch = vi.fn();
const openInPaper = vi.fn();
const note: BoardNode = { id: "n-1", type: "note", position: { x: 0, y: 0 }, data: { tags: ["t-a", "t-b"], collapsed: false, note: "notes/n-1.md" } };
vi.mock("@xyflow/react", () => ({ NodeToolbar: ({ children }: { children: React.ReactNode }) => <div>{children}</div>, Position: { Top: "top" } }));
vi.mock("../state/BoardProvider", () => ({ useBoard: () => ({ state: { board: { ...emptyBoard("p"), nodes: [note] } }, dispatch }) }));
vi.mock("../state/TagsProvider", () => ({ useTags: () => ({ tags: [{ id: "t-q", name: "question", colour: "#7C3AED" }], byId: new Map() }) }));
vi.mock("./BoardActions", () => ({ useBoardActions: () => ({ openInPaper }) }));
vi.mock("../notes/SketchEditor", () => ({ SketchEditor: () => <div role="dialog" aria-label="Sketch" /> }));
vi.mock("../tags/TagPicker", () => ({ TagPicker: () => <input aria-label="New tag" /> }));
import { CardBar } from "./CardBar";

afterEach(() => { cleanup(); vi.clearAllMocks(); });
const rect = { page: 2, rect: [0, 0, 1, 1] as [number, number, number, number] };

describe("CardBar (spec A3)", () => {
  it("reads: colour dots | ↗ ⤢ › for a piece", () => {
    const { getByRole } = render(<CardBar id="n-1" tags={[]} collapsed={false} source={rect} />);
    const names = Array.from(getByRole("toolbar", { name: "Card" }).querySelectorAll("button")).map((b) => b.getAttribute("aria-label"));
    expect(names).toEqual(["No colour", "question", "Show in paper", "Collapse card", "More actions"]);
  });
  it("a colour sets the card's main tag, keeping its extras", () => {
    const { getByRole } = render(<CardBar id="n-1" tags={["t-a", "t-b"]} collapsed={false} />);
    fireEvent.click(getByRole("button", { name: "question" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "setTags", target: "node", id: "n-1", tags: ["t-q", "t-b"] });
  });
  it("↗ shows the source; ⤢ collapses", () => {
    const { getByRole } = render(<CardBar id="n-1" tags={[]} collapsed={false} source={rect} />);
    fireEvent.click(getByRole("button", { name: "Show in paper" }));
    expect(openInPaper).toHaveBeenCalledWith(rect);
    fireEvent.click(getByRole("button", { name: "Collapse card" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "replaceNode", node: { ...note, data: { ...note.data, collapsed: true } } });
  });
  it("› holds Add tag, Sketch (a note only) and Delete", () => {
    const { getByRole, getAllByRole } = render(<CardBar id="n-1" tags={[]} collapsed={false} sketch />);
    fireEvent.click(getByRole("button", { name: "More actions" }));
    expect(getAllByRole("menuitem").map((b) => b.textContent)).toEqual(["Add tag", "Sketch", "Delete"]);
    fireEvent.click(getByRole("menuitem", { name: "Delete" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "remove", nodeIds: ["n-1"] });
  });
});
