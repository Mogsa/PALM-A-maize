import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyBoard, type ChunkNode, type Rect } from "../model/types";

const dispatch = vi.fn();
const q = (exact: string) => ({ exact, prefix: "", suffix: "" });
const region = { rects: [{ page: 2, rect: [50, 100, 286, 400] as Rect }], start: q("a"), end: q("b"), position: 0, state: "anchored" as const };
const chunk: ChunkNode = { id: "n-c", type: "chunk", position: { x: 0, y: 0 }, width: 320, data: { tags: [], collapsed: false, region, blocks: [], user_sized: false } };
vi.mock("../state/BoardProvider", () => ({ useBoard: () => ({ state: { board: { ...emptyBoard("p"), nodes: [chunk] } }, dispatch, paperId: "p" }) }));
vi.mock("../api/client", () => ({ api: { highlightInChunk: vi.fn(), recut: vi.fn() } }));
import { api } from "../api/client";
import { NOT_FOUND_MESSAGE, NOTHING_TO_DIVIDE, TextPopover } from "./TextPopover";

const selection = { nodeId: "n-c", quote: q("residual learning"), at: { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 } as DOMRect };
const piece = (y: number) => ({ type: "chunk" as const, data: { ...chunk.data, region: { ...region, position: y } } });

beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => undefined); });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("TextPopover (D20, D21)", () => {
  it("offers Highlight on a selection, and Split here and Cut out only on a right-click", () => {
    const { queryByRole, rerender } = render(<TextPopover selection={selection} onClose={vi.fn()} />);
    expect(queryByRole("button", { name: "Highlight" })).not.toBeNull();
    expect(queryByRole("button", { name: "Split here" })).toBeNull();
    rerender(<TextPopover selection={selection} actions="recut" onClose={vi.fn()} />);
    expect(queryByRole("button", { name: "Highlight" })).toBeNull();
    expect(queryByRole("button", { name: "Cut out" })).not.toBeNull();
  });

  it("Highlight asks the server for the anchor inside the chunk and adds it as one highlight", async () => {
    const anchor = { rects: region.rects, quote: q("residual learning"), position: 9, state: "anchored" as const };
    vi.mocked(api.highlightInChunk).mockResolvedValue(anchor);
    const onClose = vi.fn();
    const { getByRole } = render(<TextPopover selection={selection} onClose={onClose} />);
    fireEvent.click(getByRole("button", { name: "Highlight" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(api.highlightInChunk).toHaveBeenCalledWith("p", region, selection.quote);
    expect(dispatch).toHaveBeenCalledWith({ type: "addHighlight", highlight: { id: expect.stringMatching(/^h-/), tags: [], anchor } });
  });

  it("Cut out replaces the chunk by its pieces as one reshape", async () => {
    vi.mocked(api.recut).mockResolvedValue([piece(0), piece(1), piece(2)]);
    const { getByRole } = render(<TextPopover selection={selection} actions="recut" onClose={vi.fn()} />);
    fireEvent.click(getByRole("button", { name: "Cut out" }));
    await waitFor(() => expect(dispatch).toHaveBeenCalledTimes(1));
    expect(api.recut).toHaveBeenCalledWith("p", region, selection.quote, "cut");
    const action = dispatch.mock.calls[0][0];
    expect(action.type).toBe("reshape");
    expect(action.keep.id).toBe("n-c");
    expect(action.add).toHaveLength(2);
  });

  it("changes nothing and says so when there is nothing to divide (Review Focus 4)", async () => {
    vi.mocked(api.recut).mockResolvedValue([piece(0)]);
    const { getByRole, findByRole } = render(<TextPopover selection={selection} actions="recut" onClose={vi.fn()} />);
    fireEvent.click(getByRole("button", { name: "Split here" }));
    expect((await findByRole("status")).textContent).toBe(NOTHING_TO_DIVIDE.split);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("does not carry what it said about one selection over to the next (review finding 2)", async () => {
    vi.mocked(api.highlightInChunk).mockRejectedValue(Object.assign(new Error("x"), { code: "quote_not_found" }));
    const { getByRole, findByRole, queryByRole, rerender } = render(<TextPopover selection={selection} onClose={vi.fn()} />);
    fireEvent.click(getByRole("button", { name: "Highlight" }));
    await findByRole("status");
    rerender(<TextPopover selection={{ ...selection, quote: q("stacked layers") }} onClose={vi.fn()} />);
    expect(queryByRole("status")).toBeNull();
  });

  it("says the words were not found when the server cannot find them in the chunk", async () => {
    vi.mocked(api.highlightInChunk).mockRejectedValue(Object.assign(new Error("x"), { code: "quote_not_found" }));
    const { getByRole, findByRole } = render(<TextPopover selection={selection} onClose={vi.fn()} />);
    fireEvent.click(getByRole("button", { name: "Highlight" }));
    expect((await findByRole("status")).textContent).toBe(NOT_FOUND_MESSAGE);
    expect(dispatch).not.toHaveBeenCalled();
  });
});
