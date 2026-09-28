import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ActionMenu } from "./ActionMenu";

afterEach(cleanup);

describe("ActionMenu (the › list)", () => {
  it("is closed until › is pressed, then runs the item picked and closes", () => {
    const run = vi.fn();
    const { getByRole, queryByRole } = render(<ActionMenu items={[{ id: "a", label: "Add tag", run }]} />);
    expect(queryByRole("menu")).toBeNull();
    fireEvent.click(getByRole("button", { name: "More actions" }));
    fireEvent.click(getByRole("menuitem", { name: "Add tag" }));
    expect(run).toHaveBeenCalledTimes(1);
    expect(queryByRole("menu")).toBeNull();
  });
  it("can open already (a right-click)", () => {
    const { getByRole } = render(<ActionMenu initiallyOpen items={[{ id: "a", label: "Split here", run: vi.fn() }]} />);
    expect(getByRole("menuitem", { name: "Split here" })).toBeTruthy();
  });
  it("shows nothing when there is nothing to offer", () => {
    const { container } = render(<ActionMenu items={[]} />);
    expect(container.innerHTML).toBe("");
  });
});
