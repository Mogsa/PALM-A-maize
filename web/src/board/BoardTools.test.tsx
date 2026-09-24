import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const split = vi.fn<() => Promise<number>>();
vi.mock("../state/BoardProvider", () => ({
  FLUSH_FAILED_MESSAGE: "Some changes could not be saved yet, so this was not done. Try again once saving works.",
  useBoard: () => ({ split }),
}));
import { FLUSH_FAILED_MESSAGE } from "../state/BoardProvider";
import { BoardTools, SPLIT_FAILED_MESSAGE } from "./BoardTools";

afterEach(() => { cleanup(); vi.restoreAllMocks(); split.mockReset(); });

async function runSplit(): Promise<string> {
  render(<BoardTools onAddGroup={() => undefined} onAddNote={() => undefined} />);
  fireEvent.click(screen.getByRole("button", { name: /Split/ }));
  return (await screen.findByRole("status")).textContent ?? "";
}

describe("the Split button (D16)", () => {
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
