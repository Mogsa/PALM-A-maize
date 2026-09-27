import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const split = vi.fn<() => Promise<number>>();
vi.mock("./state/BoardProvider", () => ({
  FLUSH_FAILED_MESSAGE: "Some changes could not be saved yet, so this was not done. Try again once saving works.",
  useBoard: () => ({ split }),
}));
import { FLUSH_FAILED_MESSAGE } from "./state/BoardProvider";
import { MoreMenu, SPLIT_FAILED_MESSAGE } from "./MoreMenu";

afterEach(() => { cleanup(); vi.restoreAllMocks(); split.mockReset(); });

async function runSplit(): Promise<string> {
  render(<MoreMenu onPanel={() => undefined} />);
  fireEvent.click(screen.getByRole("button", { name: "More" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Add missing sections" }));
  return (await screen.findByRole("status")).textContent ?? "";
}

describe("the More menu", () => {
  it("lists the panels and Add missing sections, and opens a panel", () => {
    const onPanel = vi.fn();
    render(<MoreMenu onPanel={onPanel} />);
    expect(screen.queryByRole("menu")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    expect(screen.getAllByRole("menuitem").map((b) => b.textContent)).toEqual(["Glossary", "Export", "Tags", "Template", "Add missing sections"]);
    fireEvent.click(screen.getByRole("menuitem", { name: "Tags" }));
    expect(onPanel).toHaveBeenCalledWith("tags");
    expect(screen.queryByRole("menu")).toBeNull();
  });
  it("closes on Escape", () => {
    render(<MoreMenu onPanel={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
  });
});

describe("Add missing sections (split, D16)", () => {
  it("says how many pieces went into the tray", async () => {
    split.mockResolvedValueOnce(1);
    expect(await runSplit()).toBe("Added 1 piece to the tray");
  });
  it("says so when nothing was missing", async () => {
    split.mockResolvedValueOnce(0);
    expect(await runSplit()).toBe("Every section and figure is already on the board");
  });
  it("says a pending change could not be saved, when that stopped it", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    split.mockRejectedValueOnce(new Error(FLUSH_FAILED_MESSAGE));
    expect(await runSplit()).toBe(FLUSH_FAILED_MESSAGE);
  });
  it("says the split failed otherwise", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    split.mockRejectedValueOnce(new Error("500"));
    expect(await runSplit()).toBe(SPLIT_FAILED_MESSAGE);
  });
});
