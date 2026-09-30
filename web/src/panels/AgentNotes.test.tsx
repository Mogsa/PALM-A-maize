import { act, cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentNote } from "../agent/agentNotes";
import { emptyBoard, type Board, type BoardNode, type Highlight } from "../model/types";

const q = { exact: "degradation problem", prefix: "", suffix: "" };
const mark: Highlight = { id: "h-1", tags: [], anchor: { rects: [{ page: 1, rect: [10, 10, 50, 20] }], quote: q, position: 0, state: "anchored" } };
const readerNote: BoardNode = { id: "n-n", type: "note", position: { x: 0, y: 0 }, data: { tags: [], collapsed: false, note: "notes/n-n.md", origin: "reader" } };
const board: Board = { ...emptyBoard("p"), nodes: [readerNote], highlights: [mark] };
const dispatch = vi.fn();
const save = vi.fn(async (..._args: unknown[]) => undefined);
const log = vi.fn();
vi.mock("../state/BoardProvider", () => ({ useBoard: () => ({ paperId: "p", dispatch, state: { board }, notes: { save }, activity: { log } }) }));
const placeAgentNote = vi.fn(async (..._args: unknown[]) => undefined);
vi.mock("../api/client", () => ({ api: { placeAgentNote: (...args: unknown[]) => placeAgentNote(...args) } }));
import { AgentNotes } from "./AgentNotes";

const notes: AgentNote[] = [
  { file: "new.md", title: "Why it degrades", on: "h-1", text: "Not overfitting (p. 1, §1).\n", modified: "2026-09-30T10:00:00Z" },
  { file: "old.md", title: null, on: "n-n", text: "See Figure 1.\n", modified: "2026-09-29T10:00:00Z" },
  { file: "loose.md", title: null, on: null, text: "A general point.\n", modified: "2026-09-28T10:00:00Z" },
];

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const renderPanel = (list = notes) => {
  const props = { agent: { notes: list, refresh: vi.fn(async () => {}) }, onJump: vi.fn(), onOpenNote: vi.fn() };
  return { ...render(<AgentNotes {...props} />), props };
};

describe("Agent notes panel", () => {
  it("lists the notes as given (newest first), each marked AI with its title, text and file", () => {
    const { getAllByRole, getByRole } = renderPanel();
    expect(getByRole("region", { name: "Agent notes" })).toBeTruthy();
    const items = getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0].querySelector(".ai-label")?.textContent).toBe("AI");
    expect(items[0].textContent).toContain("Why it degrades");
    expect(items[0].textContent).toContain("Not overfitting (p. 1, §1).");
    expect(items[0].textContent).toContain("new.md");
    expect(items.every((li) => li.querySelector(".ai-label"))).toBe(true);
  });
  it("says how to get notes when there are none", () => {
    const { getByText } = renderPanel([]);
    expect(getByText(/AGENTS\.md/)).toBeTruthy();
  });
  it("shows what a note is on as a chip: a highlight jumps in the paper, a node opens on the board", () => {
    const { getAllByRole, props } = renderPanel();
    const items = getAllByRole("listitem");
    fireEvent.click(within(items[0]).getByRole("button", { name: /degradation problem/ }));
    expect(props.onJump).toHaveBeenCalledWith(mark.anchor.rects[0]);
    fireEvent.click(within(items[1]).getByRole("button", { name: /Note/ }));
    expect(props.onOpenNote).toHaveBeenCalledWith("n-n");
    expect(items[2].querySelector(".chip")).toBeNull();
  });
  it("Put on board writes the text, adds one AI note connected to what it is on, then marks the file placed", async () => {
    const { getAllByRole, props } = renderPanel();
    await act(async () => { fireEvent.click(within(getAllByRole("listitem")[0]).getByRole("button", { name: "Put on board" })); });
    await waitFor(() => expect(placeAgentNote).toHaveBeenCalledWith("p", "new.md"));
    expect(dispatch).toHaveBeenCalledTimes(1);
    const action = dispatch.mock.calls[0][0];
    expect(action.type).toBe("add");
    expect(action.nodes).toHaveLength(1);
    const [note] = action.nodes;
    expect(note.data.origin).toBe("ai");
    expect(action.edges).toEqual([expect.objectContaining({ from: "h-1", to: note.id })]);
    expect(save).toHaveBeenCalledWith(note.id, "# Why it degrades\n\nNot overfitting (p. 1, §1).\n");
    expect(save.mock.invocationCallOrder[0]).toBeLessThan(dispatch.mock.invocationCallOrder[0]);
    expect(props.agent.refresh).toHaveBeenCalled();
  });
  it("a note on nothing goes on the board unconnected", async () => {
    const { getAllByRole } = renderPanel();
    await act(async () => { fireEvent.click(within(getAllByRole("listitem")[2]).getByRole("button", { name: "Put on board" })); });
    await waitFor(() => expect(placeAgentNote).toHaveBeenCalledWith("p", "loose.md"));
    expect(dispatch.mock.calls[0][0].edges).toEqual([]);
  });
  it("when the text cannot be written, nothing goes on the board and the file stays", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    save.mockRejectedValueOnce(new Error("disk full"));
    const { getAllByRole } = renderPanel();
    await act(async () => { fireEvent.click(within(getAllByRole("listitem")[0]).getByRole("button", { name: "Put on board" })); });
    expect(dispatch).not.toHaveBeenCalled();
    expect(placeAgentNote).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
