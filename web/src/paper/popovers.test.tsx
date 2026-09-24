import { act, cleanup, fireEvent, render, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyBoard, type Board, type Highlight } from "../model/types";

const dispatch = vi.fn();
const note = { text: undefined as string | undefined, error: null as string | null, loadFailed: false, edit: vi.fn(), commit: vi.fn(async () => undefined), retry: vi.fn(),
  hasSketch: false, sketchVersion: 0, sketchSaved: vi.fn() };
let board: Board;
vi.mock("../state/BoardProvider", () => ({
  useBoard: () => ({ state: { board }, dispatch, paperId: "p", source: { sections: [], figures: [], page_text: [], pages: [] } }),
  useNote: () => note,
}));
vi.mock("../tags/TagPicker", () => ({ TagPicker: () => <input type="text" aria-label="New tag" /> }));
vi.mock("../api/client", async (actual) => ({ api: { ...(await actual<typeof import("../api/client")>()).api, postText: vi.fn() } }));
import { MarkPopover } from "./MarkPopover";
import { NoteEditor } from "./NoteEditor";
import { useConnect } from "./useConnect";

const q = { exact: "residual function", prefix: "", suffix: "" };
const mark = (id: string): Highlight => ({ id, tags: [], anchor: { rects: [{ page: 0, rect: [10, 10, 50, 20] }], quote: q, position: 0, state: "anchored" } });
const at = new DOMRect(100, 450, 0, 0);
const size = { innerWidth: window.innerWidth, innerHeight: window.innerHeight };

beforeEach(() => {
  board = { ...emptyBoard("p"), highlights: [mark("h-1"), mark("h-2")] };
  Object.assign(note, { text: undefined, hasSketch: false, sketchVersion: 0 });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.restoreAllMocks(); Object.assign(window, size); });

describe("MarkPopover", () => {
  it("Delete typed into a text field is the field's; Delete elsewhere removes the mark once", () => {
    const { getByLabelText } = render(<MarkPopover highlight={board.highlights[0]} at={at} onClose={() => undefined} onConnect={() => undefined} />);
    fireEvent.keyDown(getByLabelText("New tag"), { key: "Backspace" });
    expect(dispatch).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "Delete" });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({ type: "remove", highlightIds: ["h-1"] });
  });
  it("is placed by its real height, so its buttons stay on screen", () => {
    Object.assign(window, { innerWidth: 1400, innerHeight: 900 });
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(500);
    const { getByRole } = render(<MarkPopover highlight={board.highlights[0]} at={at} onClose={() => undefined} onConnect={() => undefined} />);
    const top = parseFloat(getByRole("dialog", { name: "Mark" }).style.top);
    expect(top + 500).toBeLessThanOrEqual(900);
  });
});

describe("NoteEditor", () => {
  it("cannot be typed into until the note's saved text has loaded", () => {
    const { getByRole, rerender } = render(<NoteEditor noteId="n-1" origin="reader" />);
    expect((getByRole("textbox") as HTMLTextAreaElement).readOnly).toBe(true);
    note.text = "saved";
    rerender(<NoteEditor noteId="n-1" origin="reader" />);
    fireEvent.click(getByRole("button", { name: "Edit note" }));
    expect((getByRole("textbox") as HTMLTextAreaElement).readOnly).toBe(false);
  });
  it("an empty note is a field ready for typing, and stays one while it is typed into", () => {
    note.text = "";
    const { getByRole, rerender } = render(<NoteEditor noteId="n-1" origin="reader" />);
    const field = getByRole("textbox");
    fireEvent.focus(field);
    note.text = "F";
    rerender(<NoteEditor noteId="n-1" origin="reader" />);
    expect(getByRole("textbox")).toBe(field);
  });
  it("shows a written note rendered, with its maths (D22)", () => {
    note.text = "It learns $F(x)$.";
    const { container, queryByRole } = render(<NoteEditor noteId="n-1" origin="reader" />);
    expect(queryByRole("textbox")).toBeNull();
    expect(container.querySelector(".katex")).not.toBeNull();
  });
  it("a click edits it as plain text; leaving the field saves and shows it rendered again", () => {
    note.text = "It learns $F(x)$.";
    const { getByRole, queryByRole } = render(<NoteEditor noteId="n-1" origin="reader" />);
    fireEvent.click(getByRole("button", { name: "Edit note" }));
    const field = getByRole("textbox") as HTMLTextAreaElement;
    expect(field.value).toBe("It learns $F(x)$.");
    expect(document.activeElement).toBe(field);
    fireEvent.blur(field);
    expect(note.commit).toHaveBeenCalledTimes(1);
    expect(queryByRole("textbox")).toBeNull();
  });
  it("shows the note's sketch above its text, and Sketch opens the drawing surface (D23)", () => {
    Object.assign(note, { text: "words", hasSketch: true, sketchVersion: 2 });
    const { getByRole } = render(<NoteEditor noteId="n-1" origin="reader" />);
    expect(getByRole("img", { name: "Sketch" }).getAttribute("src")).toBe("/api/papers/p/notes/n-1/sketch.svg?v=2");
    fireEvent.click(getByRole("button", { name: "Sketch" }));
    expect(getByRole("dialog", { name: "Sketch" })).not.toBeNull();
  });
  it("Escape leaves the field, not the popover", () => {
    note.text = "words";
    const { getByRole, queryByRole } = render(<NoteEditor noteId="n-1" origin="reader" />);
    fireEvent.click(getByRole("button", { name: "Edit note" }));
    fireEvent.keyDown(getByRole("textbox"), { key: "Escape" });
    expect(queryByRole("textbox")).toBeNull();
    expect(note.commit).toHaveBeenCalled();
  });
});

describe("useConnect", () => {
  const hit = (id: string) => ({ mark: mark(id), heading: null, at });
  it("connects the two marks in one step", () => {
    const { result } = renderHook(() => useConnect(() => undefined));
    act(() => result.current.start("h-1"));
    act(() => result.current.connectTo(hit("h-2")));
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0][0]).toMatchObject({ type: "add", edges: [{ from: "h-1", to: "h-2" }] });
  });
  it("stops, and connects nothing, when the mark it started from is gone", () => {
    const { result, rerender } = renderHook(() => useConnect(() => undefined));
    act(() => result.current.start("h-1"));
    board = { ...board, highlights: [mark("h-2")] };   // undone, or reloaded after a conflict
    rerender();
    expect(result.current.connectingFrom).toBeNull();
    act(() => result.current.connectTo(hit("h-2")));
    expect(dispatch).not.toHaveBeenCalled();
  });
});
