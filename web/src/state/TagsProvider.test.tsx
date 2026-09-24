import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Tag, TagFile } from "../model/types";

const claim: Tag = { id: "t-claim", name: "claim", colour: "#B91C1C" };
vi.mock("../api/client", () => ({
  api: { getTags: vi.fn(async () => ({ schema: 1, tags: [claim] })), putTags: vi.fn(async (file: TagFile) => file) },
}));
import { api } from "../api/client";
import { TagChips } from "../tags/TagChips";
import { TagPicker } from "../tags/TagPicker";
import { TAGS_FAILED_MESSAGE, TagsProvider, useTags } from "./TagsProvider";

let ctx: ReturnType<typeof useTags> | null = null;
function Probe() { ctx = useTags(); return null; }
afterEach(() => { cleanup(); ctx = null; vi.clearAllMocks(); });

describe("TagsProvider", () => {
  it("loads the global tags, adds one with a minted id, and saves the whole list", async () => {
    render(<TagsProvider><Probe /></TagsProvider>);
    await waitFor(() => expect(ctx!.tags).toEqual([claim]));
    let added: Tag | null = null;
    await act(async () => { added = await ctx!.add("pass 3"); });
    expect(added!.id).toMatch(/^t-/);
    expect(api.putTags).toHaveBeenLastCalledWith({ schema: 1, tags: [claim, added] });
  });
  it("shows an error when a save fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(api.putTags).mockRejectedValueOnce(new Error("down"));
    render(<TagsProvider><Probe /></TagsProvider>);
    await waitFor(() => expect(ctx!.tags).toHaveLength(1));
    await act(async () => { await ctx!.remove("t-claim"); });
    expect(ctx!.error).toBe(TAGS_FAILED_MESSAGE);
  });
  it("after a failed load, a write reads the tags first and never replaces the file with only its own", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(api.getTags).mockRejectedValueOnce(new Error("down"));
    render(<TagsProvider><Probe /></TagsProvider>);
    await waitFor(() => expect(ctx!.error).toBe(TAGS_FAILED_MESSAGE));
    let added: Tag | null = null;
    await act(async () => { added = await ctx!.add("pass 3"); });
    expect(api.putTags).toHaveBeenLastCalledWith({ schema: 1, tags: [claim, added] });
  });
  it("refuses a write while the tags cannot be read at all", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(api.getTags).mockRejectedValueOnce(new Error("down")).mockRejectedValueOnce(new Error("still down"));
    render(<TagsProvider><Probe /></TagsProvider>);
    await waitFor(() => expect(ctx!.error).toBe(TAGS_FAILED_MESSAGE));
    await act(async () => { await expect(ctx!.add("pass 3")).rejects.toThrow(); });
    expect(api.putTags).not.toHaveBeenCalled();
    expect(ctx!.tags).toEqual([]);
  });
  it("chips ignore a tag id nobody defines any more (addendum 4.3)", async () => {
    const { container } = render(<TagsProvider><TagChips ids={["t-claim", "t-deleted"]} /></TagsProvider>);
    await waitFor(() => expect(container.querySelectorAll(".chip")).toHaveLength(1));
  });
  it("the picker toggles a tag, and a new tag is added and checked", async () => {
    const onChange = vi.fn();
    render(<TagsProvider><TagPicker value={[]} onChange={onChange} /></TagsProvider>);
    fireEvent.click(await screen.findByLabelText("claim"));
    expect(onChange).toHaveBeenLastCalledWith(["t-claim"]);
    fireEvent.change(screen.getByLabelText("New tag"), { target: { value: "pass 3" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Add" })); });
    expect(onChange).toHaveBeenLastCalledWith([expect.stringMatching(/^t-/)]);
  });
});
