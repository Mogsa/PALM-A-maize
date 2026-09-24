import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Tag } from "../model/types";

const dispatch = vi.fn();
const board = { active_tags: ["t-a", "t-gone"] };
let tags: Tag[] = [];
vi.mock("../state/BoardProvider", () => ({ useBoard: () => ({ state: { board }, dispatch }) }));
vi.mock("../state/TagsProvider", () => ({ useTags: () => ({ tags, byId: new Map(tags.map((t) => [t.id, t])) }) }));
import { FilterBar } from "./FilterBar";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("the filter bar", () => {
  it("drops a tag deleted on another paper from this board's filter, so the board never filters by a tag nobody can see", () => {
    tags = [{ id: "t-a", name: "claim", colour: "#b91c1c" }];
    render(<FilterBar />);
    expect(dispatch).toHaveBeenCalledWith({ type: "setActiveTags", tags: ["t-a"] });
    expect(screen.getByRole("button", { name: "claim" }).getAttribute("aria-pressed")).toBe("true");
  });
  it("leaves the filter alone while the tags have not loaded", () => {
    tags = [];
    render(<FilterBar />);
    expect(dispatch).not.toHaveBeenCalled();
  });
});
