import { act, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyBoard, type Highlight, type Source } from "../model/types";

const source: Source = { schema: 1, paper_id: "p", pages: [], sections: [], figures: [], regions: [], page_text: [] };

vi.mock("../api/client", () => ({
  api: {
    getSource: vi.fn(async () => source),
    getBoard: vi.fn(async () => emptyBoard("p")),
    putBoard: vi.fn(async () => ({ version: 1 })),
  },
}));

import { api } from "../api/client";
import { BoardProvider, useBoard } from "./BoardProvider";
import { SAVE_FAILED_MESSAGE } from "./persistence";

const q = { exact: "x", prefix: "", suffix: "" };
const highlight: Highlight = { id: "h-1", tags: [], note: null, anchor: { page: 0, rect: [0, 0, 1, 1], quote: q, position: 0, state: "anchored" } };

type Board = ReturnType<typeof useBoard>;
let ctx: Board | null = null;
function Probe() {
  ctx = useBoard();
  return <span data-testid="notice">{ctx.notice ?? ""}</span>;
}

afterEach(() => { ctx = null; vi.clearAllMocks(); });

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
});
