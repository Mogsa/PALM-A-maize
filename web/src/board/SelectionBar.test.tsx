import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BoardNode, ChunkNode, Rect } from "../model/types";

const dispatch = vi.fn();
vi.mock("../state/BoardProvider", () => ({ useBoard: () => ({ dispatch, paperId: "p" }) }));
vi.mock("../state/TagsProvider", () => ({ useTags: () => ({ tags: [{ id: "t-q", name: "question", colour: "#7C3AED" }] }) }));
vi.mock("../api/client", () => ({ api: { join: vi.fn() } }));
import { api } from "../api/client";
import { SelectionBar } from "./SelectionBar";

const q = { exact: "x", prefix: "", suffix: "" };
const chunk = (id: string, y: number): ChunkNode => ({ id, type: "chunk", position: { x: 0, y }, width: 320,
  data: { tags: [], collapsed: true, blocks: [], user_sized: false, region: { rects: [{ page: 0, rect: [50, y, 280, y + 50] as Rect }], start: q, end: q, position: y, state: "anchored" } } });
const note: BoardNode = { id: "n-n", type: "note", position: { x: 0, y: 0 }, data: { tags: [], collapsed: false, note: "notes/n-n.md", origin: "reader" } };

beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => undefined); });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("SelectionBar (addendum 4.10)", () => {
  it("offers Join for chunks the server says are neighbours, and joins them as one reshape", async () => {
    const a = chunk("n-a", 0), b = chunk("n-b", 100);
    vi.mocked(api.join).mockResolvedValue({ node: { type: "chunk", data: a.data }, order: [1, 0] });
    const { findByRole, queryByRole } = render(<SelectionBar selected={[a, b]} onGroup={vi.fn()} />);
    fireEvent.click(await findByRole("button", { name: "Join" }));
    expect(api.join).toHaveBeenCalledWith("p", [a.data.region, b.data.region]);
    expect(queryByRole("button", { name: "Group" })).not.toBeNull();
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: "reshape", removeIds: ["n-a"] }));
  });
  it("offers Group instead for chunks that are not neighbours", async () => {
    vi.mocked(api.join).mockResolvedValue(null);
    const onGroup = vi.fn();
    const { findByRole, queryByRole } = render(<SelectionBar selected={[chunk("n-a", 0), chunk("n-b", 300)]} onGroup={onGroup} />);
    fireEvent.click(await findByRole("button", { name: "Group" }));
    expect(onGroup).toHaveBeenCalledWith(["n-a", "n-b"]);
    expect(queryByRole("button", { name: "Join" })).toBeNull();
  });
  it("offers Group, without asking the server, when something other than a chunk is selected", async () => {
    const { findByRole } = render(<SelectionBar selected={[chunk("n-a", 0), note]} onGroup={vi.fn()} />);
    await findByRole("button", { name: "Group" });
    expect(api.join).not.toHaveBeenCalled();
  });
  it("offers Group when the server cannot be asked", async () => {
    vi.mocked(api.join).mockRejectedValue(new Error("offline"));
    const { findByRole } = render(<SelectionBar selected={[chunk("n-a", 0), chunk("n-b", 100)]} onGroup={vi.fn()} />);
    await findByRole("button", { name: "Group" });
  });
  it("shows nothing for one piece", () => {
    const { container } = render(<SelectionBar selected={[chunk("n-a", 0)]} onGroup={vi.fn()} />);
    expect(container.innerHTML).toBe("");
  });
  it("● colours every selected piece as one step", () => {
    const a = chunk("n-a", 0), b = { ...chunk("n-b", 300), data: { ...chunk("n-b", 300).data, tags: ["t-x", "t-y"] } };
    vi.mocked(api.join).mockResolvedValue(null);
    const { getByRole } = render(<SelectionBar selected={[a, b]} onGroup={vi.fn()} />);
    fireEvent.click(getByRole("button", { name: "question" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "setNodeTags", tags: { "n-a": ["t-q"], "n-b": ["t-q", "t-y"] } });
  });
});
