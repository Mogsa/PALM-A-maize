import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const dispatch = vi.fn();
const remove = vi.fn(async () => undefined);
const update = vi.fn(async () => undefined);
const tag = { id: "t-a", name: "claim", colour: "#b91c1c" };
vi.mock("../state/BoardProvider", () => ({ useBoard: () => ({ state: { board: { active_tags: ["t-a", "t-b"] } }, dispatch }) }));
vi.mock("../state/TagsProvider", () => ({ useTags: () => ({ tags: [tag], byId: new Map([[tag.id, tag]]), error: null, update, remove, add: vi.fn() }) }));
import { TagManager } from "./TagManager";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("the tag manager", () => {
  it("deleting a tag drops it from the filter, so the board never filters by a tag nobody can see", async () => {
    render(<TagManager />);
    fireEvent.click(screen.getByRole("button", { name: "Delete claim" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "setActiveTags", tags: ["t-b"] });
    await vi.waitFor(() => expect(remove).toHaveBeenCalledWith("t-a"));
  });
  it("renames on blur, and keeps the old name when the new one is empty", () => {
    render(<TagManager />);
    const name = screen.getByLabelText("Name of claim");
    fireEvent.change(name, { target: { value: "thesis" } });
    fireEvent.blur(name);
    expect(update).toHaveBeenCalledWith({ ...tag, name: "thesis" });
    fireEvent.change(name, { target: { value: "  " } });
    fireEvent.blur(name);
    expect(update).toHaveBeenCalledTimes(1);
  });
  it("saves a new colour once, when the picker is left, not on every step of the drag", () => {
    render(<TagManager />);
    const colour = screen.getByLabelText("Colour of claim");
    fireEvent.change(colour, { target: { value: "#00ff00" } });
    fireEvent.change(colour, { target: { value: "#0000ff" } });
    expect(update).not.toHaveBeenCalled();
    fireEvent.blur(colour);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({ ...tag, colour: "#0000ff" });
  });
});
