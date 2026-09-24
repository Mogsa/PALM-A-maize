import { cleanup, fireEvent, render } from "@testing-library/react";
import type { NodeProps } from "@xyflow/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyBoard, type NoteNode as NoteNodeType } from "../../model/types";

const note = {
  text: undefined as string | undefined, error: null as string | null, loadFailed: false,
  edit: vi.fn(), commit: vi.fn(async () => undefined), retry: vi.fn(), hasSketch: false, sketchVersion: 0, sketchSaved: vi.fn(),
};
vi.mock("../../state/BoardProvider", () => ({ useBoard: () => ({ state: { board: emptyBoard("p") }, paperId: "p" }), useNote: () => note }));
const actions = { editing: "n-1" as string | null, setEditing: vi.fn() };
vi.mock("../BoardActions", () => ({ useBoardActions: () => actions }));
vi.mock("@xyflow/react", () => ({ Handle: () => null, NodeResizer: () => null, Position: { Left: "left", Right: "right" } }));
vi.mock("./NodeTags", () => ({ NodeTags: () => null }));
vi.mock("./CollapseToggle", () => ({ CollapseToggle: () => null }));
import { NoteNode } from "./NoteNode";

const props = { id: "n-1", data: { tags: [], collapsed: false, note: "notes/n-1.md" }, selected: false, width: 240, height: 120 } as unknown as NodeProps<NoteNodeType>;

beforeEach(() => {
  Object.assign(note, { text: undefined, error: null, loadFailed: false, hasSketch: false, sketchVersion: 0 });
  actions.editing = "n-1";
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("NoteNode (M3)", () => {
  it("cannot be typed into until the note's saved text has loaded", () => {
    const { getByRole, rerender } = render(<NoteNode {...props} />);
    expect((getByRole("textbox", { name: "Note" }) as HTMLTextAreaElement).readOnly).toBe(true);
    note.text = "saved";
    rerender(<NoteNode {...props} />);
    expect((getByRole("textbox", { name: "Note" }) as HTMLTextAreaElement).readOnly).toBe(false);
  });

  it("a note that failed to load shows the error and Retry, not an empty field to type over", () => {
    Object.assign(note, { error: "Could not load this note.", loadFailed: true });
    const { queryByRole, getByRole } = render(<NoteNode {...props} />);
    expect(queryByRole("textbox")).toBeNull();
    expect(getByRole("alert").textContent).toContain("Could not load this note.");
    fireEvent.click(getByRole("button", { name: "Retry" }));
    expect(note.retry).toHaveBeenCalledTimes(1);
  });
});

describe("NoteNode shows its text rendered (D22)", () => {
  it("renders Markdown and maths until it is edited", () => {
    Object.assign(note, { text: "The block learns *$F(x)$*." });
    actions.editing = null;
    const { container, queryByRole } = render(<NoteNode {...props} />);
    expect(queryByRole("textbox")).toBeNull();
    expect(container.querySelector(".note-body .katex")).not.toBeNull();
  });

  it("double-click opens the plain-text editor", () => {
    Object.assign(note, { text: "$x$" });
    actions.editing = null;
    const { container } = render(<NoteNode {...props} />);
    fireEvent.doubleClick(container.querySelector(".note-body")!);
    expect(actions.setEditing).toHaveBeenCalledWith("n-1");
  });

  it("Escape in the editor saves and goes back to the rendered note", () => {
    Object.assign(note, { text: "$x$" });
    const { getByRole } = render(<NoteNode {...props} />);
    fireEvent.keyDown(getByRole("textbox", { name: "Note" }), { key: "Escape" });
    expect(note.commit).toHaveBeenCalledTimes(1);
    expect(actions.setEditing).toHaveBeenCalledWith(null);
  });
});

describe("NoteNode, sketch (D23)", () => {
  it("shows the note's sketch above its text, fetched again after each save", () => {
    Object.assign(note, { text: "words", hasSketch: true, sketchVersion: 3 });
    actions.editing = null;
    const { getByRole, container } = render(<NoteNode {...props} />);
    const image = getByRole("img", { name: "Sketch" });
    expect(image.getAttribute("src")).toBe("/api/papers/p/notes/n-1/sketch.svg?v=3");
    expect(image.compareDocumentPosition(container.querySelector(".note-body")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
  it("a note without a sketch shows no image", () => {
    Object.assign(note, { text: "words" });
    actions.editing = null;
    const { queryByRole } = render(<NoteNode {...props} />);
    expect(queryByRole("img", { name: "Sketch" })).toBeNull();
  });
  it("Sketch opens the drawing surface", () => {
    Object.assign(note, { text: "words" });
    actions.editing = null;
    const { getByRole } = render(<NoteNode {...props} />);
    fireEvent.click(getByRole("button", { name: "Sketch" }));
    expect(getByRole("dialog", { name: "Sketch" })).not.toBeNull();
  });
});
