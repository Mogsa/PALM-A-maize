import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyBoard, type Highlight, type Source } from "../model/types";

const source: Source = { schema: 1, paper_id: "p", pages: [], sections: [], figures: [], regions: [], page_text: [] };

vi.mock("../api/client", () => ({
  CLIP_DPI: 216,
  api: {
    getSource: vi.fn(async () => source),
    getBoard: vi.fn(async () => ({ ...emptyBoard("p"), version: 1 })),
    putBoard: vi.fn(async () => ({ version: 2 })),
    getView: vi.fn(async () => ({ view: "paper", paper_scroll: null, active_tags: [], viewport: null, split: 0.4 })),
    putView: vi.fn(async () => undefined),
    split: vi.fn(async () => ({ nodes: [] })),
    getTemplate: vi.fn(async () => ({ schema: 1, slots: [{ name: "Main point", prompt: "What is it?" }] })),
    putClip: vi.fn(),
    getNote: vi.fn(async () => ({ markdown: "" })),
    putNote: vi.fn(async () => undefined),
  },
}));

import { StrictMode } from "react";
import { api } from "../api/client";
import { BoardProvider, FIRST_OPEN_FAILED_MESSAGE, FLUSH_FAILED_MESSAGE, useBoard, useNote } from "./BoardProvider";
import { SAVE_FAILED_MESSAGE } from "./persistence";
import { defaultPaperView } from "../model/paperView";

const q = { exact: "x", prefix: "", suffix: "" };
const highlight: Highlight = { id: "h-1", tags: [], anchor: { rects: [{ page: 0, rect: [0, 0, 1, 1] }], quote: q, position: 0, state: "anchored" } };

type Board = ReturnType<typeof useBoard>;
let ctx: Board | null = null;
function Probe() {
  ctx = useBoard();
  return <span data-testid="notice">{ctx.notice ?? ""}</span>;
}

// Unmount first and let its flush run, so a save left over from one test is never counted in the next.
afterEach(async () => {
  cleanup();
  await new Promise((resolve) => setTimeout(resolve, 0));
  ctx = null;
  vi.clearAllMocks();
});

describe("BoardProvider", () => {
  it("saves a change still inside the debounce when it unmounts", async () => {
    const { unmount } = render(<BoardProvider paperId="p"><Probe /></BoardProvider>);
    await waitFor(() => expect(ctx).not.toBeNull());
    act(() => ctx!.dispatch({ type: "addHighlight", highlight }));
    unmount();
    await waitFor(() => expect(api.putBoard).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.putBoard).mock.calls[0][0]).toBe("p");
  });

  it("shows a notice when a save fails", async () => {
    vi.mocked(api.putBoard).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const { findByText } = render(<BoardProvider paperId="p"><Probe /></BoardProvider>);
    await waitFor(() => expect(ctx).not.toBeNull());
    act(() => ctx!.dispatch({ type: "addHighlight", highlight }));
    expect(await findByText(SAVE_FAILED_MESSAGE, {}, { timeout: 2000 })).toBeTruthy();
  });

  it("asks the browser to hold the page and flushes when the tab closes with an unsaved change", async () => {
    render(<BoardProvider paperId="p"><Probe /></BoardProvider>);
    await waitFor(() => expect(ctx).not.toBeNull());
    act(() => ctx!.dispatch({ type: "addHighlight", highlight }));
    const event = new Event("beforeunload", { cancelable: true });
    act(() => { window.dispatchEvent(event); });
    expect(event.defaultPrevented).toBe(true);
    await waitFor(() => expect(api.putBoard).toHaveBeenCalledTimes(1));   // flushed now, not after the 500 ms debounce
  });

  it("asks the browser to hold the page and writes the note when the tab closes while a note is typed into (I1)", async () => {
    render(<BoardProvider paperId="p"><Probe /></BoardProvider>);
    await waitFor(() => expect(ctx).not.toBeNull());
    act(() => ctx!.notes.edit("n-1", "typed, not yet written"));
    const event = new Event("beforeunload", { cancelable: true });
    act(() => { window.dispatchEvent(event); });
    expect(event.defaultPrevented).toBe(true);
    await waitFor(() => expect(api.putNote).toHaveBeenCalledWith("p", "n-1", "typed, not yet written"));
    expect(api.putBoard).not.toHaveBeenCalled();
  });

  it("shows the server's message when the paper cannot be loaded, and retries", async () => {
    vi.mocked(api.getSource).mockRejectedValueOnce(new Error("No paper named p"));
    const { findByText, findByRole, findByTestId } = render(<BoardProvider paperId="p"><Probe /></BoardProvider>);
    expect(await findByText(/No paper named p/)).toBeTruthy();
    fireEvent.click(await findByRole("button", { name: "Retry" }));
    expect(await findByTestId("notice")).toBeTruthy();
    expect(api.getSource).toHaveBeenCalledTimes(2);
  });

  it("lets the tab close without a prompt when nothing is unsaved", async () => {
    render(<BoardProvider paperId="p"><Probe /></BoardProvider>);
    await waitFor(() => expect(ctx).not.toBeNull());
    const event = new Event("beforeunload", { cancelable: true });
    act(() => { window.dispatchEvent(event); });
    expect(event.defaultPrevented).toBe(false);
    expect(api.putBoard).not.toHaveBeenCalled();
  });
});

const q2 = { exact: "x", prefix: "", suffix: "" };
const draft = { type: "chunk" as const, position: { x: 0, y: 0 },
  data: { tags: [], collapsed: true, region: { rects: [{ page: 0, rect: [0, 0, 9, 9] as [number, number, number, number] }], start: q2, end: q2, position: 0, state: "anchored" as const }, blocks: [], user_sized: false, source_id: "sec-1" } };
const groups = () => ctx!.state.board.nodes.filter((n) => n.type === "group");

describe("BoardProvider, first open (D15)", () => {
  it("lays out a new board once under StrictMode, as one undo step, with the template's slots and no tray", async () => {
    // StrictMode runs the load effect twice, so the board is fetched twice; the layout must land once.
    vi.mocked(api.getBoard).mockResolvedValueOnce(emptyBoard("p")).mockResolvedValueOnce(emptyBoard("p"));
    render(<StrictMode><BoardProvider paperId="p"><Probe /></BoardProvider></StrictMode>);
    await waitFor(() => expect(ctx).not.toBeNull());
    expect(groups().map((g) => g.data)).toEqual([{ tags: [], name: "Main point", prompt: "What is it?" }]);
    expect(ctx!.state.board.nodes.filter((n) => n.type === "chunk")).toHaveLength(0);
    expect(ctx!.state.history.past).toHaveLength(1);
    expect(api.split).not.toHaveBeenCalled();
  });
  it("never lays out a saved board, even an empty one", async () => {
    render(<BoardProvider paperId="p"><Probe /></BoardProvider>);
    await waitFor(() => expect(ctx).not.toBeNull());
    expect(api.split).not.toHaveBeenCalled();
    expect(ctx!.state.board.nodes).toEqual([]);
  });
  it("shows the board with a notice when first open fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(api.getBoard).mockResolvedValueOnce(emptyBoard("p"));
    vi.mocked(api.getTemplate).mockRejectedValueOnce(new Error("down"));
    const { findByText } = render(<BoardProvider paperId="p"><Probe /></BoardProvider>);
    expect(await findByText(FIRST_OPEN_FAILED_MESSAGE)).toBeTruthy();
    expect(ctx!.state.board.nodes).toEqual([]);
  });
});

describe("BoardProvider, flush and split", () => {
  it("flush waits for a note still being written", async () => {
    let finish: () => void = () => undefined;
    vi.mocked(api.putNote).mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    render(<BoardProvider paperId="p"><Probe /></BoardProvider>);
    await waitFor(() => expect(ctx).not.toBeNull());
    void ctx!.notes.save("n-1", "text");
    let flushed = false;
    const flushing = ctx!.flush().then(() => { flushed = true; });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(flushed).toBe(false);
    finish();
    await flushing;
    expect(flushed).toBe(true);
  });
  it("flush rejects when the board could not be saved, and split then asks the server nothing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(api.putBoard).mockRejectedValue(new TypeError("Failed to fetch"));
    render(<BoardProvider paperId="p"><Probe /></BoardProvider>);
    await waitFor(() => expect(ctx).not.toBeNull());
    act(() => ctx!.dispatch({ type: "addHighlight", highlight }));
    await act(async () => { await expect(ctx!.flush()).rejects.toThrow(FLUSH_FAILED_MESSAGE); });
    await act(async () => { await expect(ctx!.split()).rejects.toThrow(FLUSH_FAILED_MESSAGE); });
    expect(api.split).not.toHaveBeenCalled();
    vi.mocked(api.putBoard).mockReset();
    vi.mocked(api.putBoard).mockResolvedValue({ version: 2 });
  });
  it("split adds what is missing to a new tray as one undo step and says how many", async () => {
    vi.mocked(api.split).mockResolvedValueOnce({ nodes: [draft] });
    render(<BoardProvider paperId="p"><Probe /></BoardProvider>);
    await waitFor(() => expect(ctx).not.toBeNull());
    let added = 0;
    await act(async () => { added = await ctx!.split(); });
    expect(added).toBe(1);
    expect(groups()).toHaveLength(1);
    expect(ctx!.state.history.past).toHaveLength(1);
  });
});

describe("useNote, sketches (D23)", () => {
  let note: ReturnType<typeof useNote> | null = null;
  function NoteProbe() {
    note = useNote("n-1");
    return null;
  }
  it("says whether a note has a sketch, and a saved sketch changes its version but not the board", async () => {
    vi.mocked(api.getNote).mockResolvedValueOnce({ markdown: "", has_sketch: true });
    render(<BoardProvider paperId="p"><Probe /><NoteProbe /></BoardProvider>);
    await waitFor(() => expect(note?.hasSketch).toBe(true));
    const before = note!.sketchVersion;
    act(() => note!.sketchSaved(true));
    expect(note!.sketchVersion).toBeGreaterThan(before);
    act(() => note!.sketchSaved(false));
    expect(note!.hasSketch).toBe(false);
    expect(ctx!.state.history.past).toHaveLength(0);
  });
});

describe("BoardProvider view state", () => {
  it("loads the view from its own route", async () => {
    vi.mocked(api.getView).mockResolvedValueOnce({ ...defaultPaperView, view: "board", active_tags: ["t-a"] });
    render(<BoardProvider paperId="p"><Probe /></BoardProvider>);
    await waitFor(() => expect(ctx).not.toBeNull());
    expect(ctx!.view).toMatchObject({ view: "board", active_tags: ["t-a"] });
    expect(api.getView).toHaveBeenCalledWith("p");
  });

  it("still opens the paper, at the default view, when the view cannot be read", async () => {
    vi.mocked(api.getView).mockRejectedValueOnce(new Error("404"));
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(<BoardProvider paperId="p"><Probe /></BoardProvider>);
    await waitFor(() => expect(ctx).not.toBeNull());
    expect(ctx!.view).toEqual(defaultPaperView);
    error.mockRestore();
  });

  it("puts a viewport or scroll change to /view, never dirtying the board, saving it, or making an undo step", async () => {
    const { unmount } = render(<BoardProvider paperId="p"><Probe /></BoardProvider>);
    await waitFor(() => expect(ctx).not.toBeNull());
    act(() => ctx!.setView({ viewport: { x: 5, y: 6, zoom: 1.5 }, paper_scroll: { page: 2, y: 40 } }));
    expect(ctx!.state.dirty).toBe(false);
    expect(ctx!.state.history.past).toHaveLength(0);
    expect(ctx!.view.viewport).toEqual({ x: 5, y: 6, zoom: 1.5 });
    unmount();
    await waitFor(() => expect(api.putView).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.putView).mock.calls[0]).toEqual(["p", expect.objectContaining({ paper_scroll: { page: 2, y: 40 } })]);
    expect(api.putBoard).not.toHaveBeenCalled();
  });
});
