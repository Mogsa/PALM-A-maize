import { act, cleanup, fireEvent, render, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyBoard, type Board, type Highlight } from "../model/types";

const dispatch = vi.fn();
const note = { text: undefined as string | undefined, error: null as string | null, save: vi.fn(async () => undefined) };
let board: Board;
vi.mock("../state/BoardProvider", () => ({
  useBoard: () => ({ state: { board }, dispatch, paperId: "p", source: { sections: [], figures: [], page_text: [], pages: [] } }),
  useNote: () => note,
}));
vi.mock("../tags/TagPicker", () => ({ TagPicker: () => <input type="text" aria-label="New tag" /> }));
vi.mock("../api/client", () => ({ api: { postText: vi.fn() } }));
import { MarkPopover } from "./MarkPopover";
import { NoteEditor } from "./NoteEditor";
import { useConnect } from "./useConnect";

const q = { exact: "residual function", prefix: "", suffix: "" };
const mark = (id: string): Highlight => ({ id, tags: [], anchor: { rects: [{ page: 0, rect: [10, 10, 50, 20] }], quote: q, position: 0, state: "anchored" } });
const at = new DOMRect(100, 450, 0, 0);
const size = { innerWidth: window.innerWidth, innerHeight: window.innerHeight };

beforeEach(() => { board = { ...emptyBoard("p"), highlights: [mark("h-1"), mark("h-2")] }; note.text = undefined; });
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
    expect((getByRole("textbox") as HTMLTextAreaElement).readOnly).toBe(false);
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
