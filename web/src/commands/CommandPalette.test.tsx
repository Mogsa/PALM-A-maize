import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommandPalette } from "./CommandPalette";
import { shellCommands } from "./shellCommands";

afterEach(cleanup);
const deps = () => ({ openPanel: vi.fn(), newNote: vi.fn(), find: vi.fn(), split: vi.fn(), shortcuts: vi.fn() });

describe("⌘K (spec A1)", () => {
  it("lists every command, \"Add missing sections\" after Template", () => {
    const { getAllByRole } = render(<CommandPalette commands={shellCommands(deps())} onClose={vi.fn()} />);
    expect(getAllByRole("option").map((o) => o.textContent)).toEqual(
      ["Export", "Tags", "Template", "Add missing sections", "New note", "Find in paper", "Shortcuts"]);
  });
  it("leaves \"Add missing sections\" out while trays are off", () => {
    expect(shellCommands(deps(), false).map((c) => c.label)).toEqual(
      ["Export", "Tags", "Template", "New note", "Find in paper", "Shortcuts"]);
  });
  it("filters as you type, and Enter runs the first match and closes", () => {
    const d = deps();
    const onClose = vi.fn();
    const { getByRole, getAllByRole } = render(<CommandPalette commands={shellCommands(d)} onClose={onClose} />);
    const field = getByRole("textbox", { name: "Search commands" });
    fireEvent.change(field, { target: { value: "tag" } });
    expect(getAllByRole("option").map((o) => o.textContent)).toEqual(["Tags"]);
    fireEvent.keyDown(field, { key: "Enter" });
    expect(d.openPanel).toHaveBeenCalledWith("tags");
    expect(onClose).toHaveBeenCalled();
  });
  it("arrows move the choice", () => {
    const d = deps();
    const { getByRole } = render(<CommandPalette commands={shellCommands(d)} onClose={vi.fn()} />);
    const field = getByRole("textbox", { name: "Search commands" });
    fireEvent.keyDown(field, { key: "ArrowDown" });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(d.openPanel).toHaveBeenCalledWith("tags");
  });
  it("says so when nothing matches", () => {
    const { getByRole, getByText } = render(<CommandPalette commands={shellCommands(deps())} onClose={vi.fn()} />);
    fireEvent.change(getByRole("textbox", { name: "Search commands" }), { target: { value: "zzz" } });
    expect(getByText("No command matches.")).toBeTruthy();
  });
});
