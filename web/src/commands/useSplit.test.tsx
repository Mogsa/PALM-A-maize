import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const split = vi.fn<() => Promise<number>>();
vi.mock("../state/BoardProvider", () => ({
  FLUSH_FAILED_MESSAGE: "Some changes could not be saved yet, so this was not done. Try again once saving works.",
  useBoard: () => ({ split }),
}));
import { FLUSH_FAILED_MESSAGE } from "../state/BoardProvider";
import { SPLIT_FAILED_MESSAGE, useSplit } from "./useSplit";

afterEach(() => { cleanup(); vi.restoreAllMocks(); split.mockReset(); });

async function said(): Promise<string | null> {
  const { result } = renderHook(() => useSplit());
  await act(() => result.current.run());
  return result.current.said;
}

describe("Add missing sections (split, D16)", () => {
  it("says how many pieces went into the tray", async () => { split.mockResolvedValueOnce(1); expect(await said()).toBe("Added 1 piece to the tray"); });
  it("says so when nothing was missing", async () => { split.mockResolvedValueOnce(0); expect(await said()).toBe("Every section and figure is already on the board"); });
  it("says a pending change could not be saved, when that stopped it", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    split.mockRejectedValueOnce(new Error(FLUSH_FAILED_MESSAGE));
    expect(await said()).toBe(FLUSH_FAILED_MESSAGE);
  });
  it("says the split failed otherwise", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    split.mockRejectedValueOnce(new Error("500"));
    expect(await said()).toBe(SPLIT_FAILED_MESSAGE);
  });
  it("does not run a second time while one is busy", async () => {
    let finish: (n: number) => void = () => {};
    split.mockReturnValueOnce(new Promise((r) => { finish = r; }));
    const { result } = renderHook(() => useSplit());
    let first: Promise<void> = Promise.resolve();
    act(() => { first = result.current.run(); });
    await act(() => result.current.run());
    expect(split).toHaveBeenCalledTimes(1);
    await act(async () => { finish(0); await first; });
  });
});
