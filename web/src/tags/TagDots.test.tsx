import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../state/TagsProvider", () => ({
  useTags: () => ({ tags: [{ id: "t-s", name: "supports", colour: "#15803D" }, { id: "t-q", name: "question", colour: "#7C3AED" }] }),
}));
import { TagDots } from "./TagDots";

afterEach(cleanup);

describe("TagDots (spec A2)", () => {
  it("shows plain yellow first, then one dot per tag in its own colour", () => {
    const { getAllByRole } = render(<TagDots onPick={vi.fn()} plainLabel="Highlight" />);
    const dots = getAllByRole("button");
    expect(dots.map((d) => d.getAttribute("aria-label"))).toEqual(["Highlight", "supports", "question"]);
    expect(dots[2].style.background).toBe("rgb(124, 58, 237)");
  });
  it("passes the tag picked, or null for plain", () => {
    const onPick = vi.fn();
    const { getByRole } = render(<TagDots onPick={onPick} />);
    fireEvent.click(getByRole("button", { name: "question" }));
    fireEvent.click(getByRole("button", { name: "No colour" }));
    expect(onPick.mock.calls).toEqual([["t-q"], [null]]);
  });
  it("presses the current main tag, and none on a fresh selection", () => {
    const { getByRole, rerender } = render(<TagDots current="t-s" onPick={vi.fn()} />);
    expect(getByRole("button", { name: "supports" }).getAttribute("aria-pressed")).toBe("true");
    rerender(<TagDots onPick={vi.fn()} />);
    expect(getByRole("button", { name: "No colour" }).getAttribute("aria-pressed")).toBe("false");
  });
});
