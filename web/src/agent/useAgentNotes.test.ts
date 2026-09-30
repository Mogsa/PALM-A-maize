import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentNote } from "./agentNotes";

const note: AgentNote = { file: "a.md", title: null, on: null, text: "x", modified: "2026-09-30T10:00:00Z" };
const agentNotes = vi.fn(async (..._args: unknown[]) => [note]);
vi.mock("../api/client", () => ({ api: { agentNotes: (...args: unknown[]) => agentNotes(...args) } }));
import { AGENT_POLL_MS, useAgentNotes } from "./useAgentNotes";

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); });

const settle = () => act(async () => { await vi.advanceTimersByTimeAsync(0); });

describe("useAgentNotes", () => {
  it("reads the folder once when the paper opens, and again when the window regains focus", async () => {
    const { result } = renderHook(() => useAgentNotes("p", false));
    await settle();
    expect(agentNotes).toHaveBeenCalledWith("p");
    expect(result.current.notes).toEqual([note]);
    await act(async () => { await vi.advanceTimersByTimeAsync(AGENT_POLL_MS * 3); });
    expect(agentNotes).toHaveBeenCalledTimes(1);   // closed: no polling
    await act(async () => { window.dispatchEvent(new Event("focus")); await vi.advanceTimersByTimeAsync(0); });
    expect(agentNotes).toHaveBeenCalledTimes(2);
  });
  it("re-reads when the panel opens and every 5 s while it is open", async () => {
    const { rerender } = renderHook(({ open }) => useAgentNotes("p", open), { initialProps: { open: false } });
    await settle();
    rerender({ open: true });
    await settle();
    expect(agentNotes).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(AGENT_POLL_MS * 2); });
    expect(agentNotes).toHaveBeenCalledTimes(4);
    rerender({ open: false });
    await act(async () => { await vi.advanceTimersByTimeAsync(AGENT_POLL_MS * 2); });
    expect(agentNotes).toHaveBeenCalledTimes(4);
  });
  it("keeps what it had when a read fails", async () => {
    const { result } = renderHook(() => useAgentNotes("p", false));
    await settle();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    agentNotes.mockRejectedValueOnce(new Error("down"));
    await act(async () => { await result.current.refresh(); });
    expect(result.current.notes).toEqual([note]);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
