import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../api/client", () => ({ api: { postActivity: vi.fn(async () => undefined) } }));

import { api } from "../api/client";
import { defaultPaperView, type PaperViewState } from "../model/paperView";
import { FLUSH_MS } from "./logger";
import type { ActivityEvent } from "./types";
import { useActivity } from "./useActivity";

const sent = (): ActivityEvent[] => vi.mocked(api.postActivity).mock.calls.flatMap((c) => c[1]);
const actions = () => sent().map((e) => `${e.kind}:${e.action}`);
type Props = { ready: boolean; view: PaperViewState };
const mount = (props: Props) => renderHook((p: Props) => useActivity("p", p.ready, p.view), { initialProps: props });

beforeEach(() => vi.useFakeTimers({ now: 0 }));
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); });

describe("useActivity", () => {
  it("logs nothing until the paper has loaded, then the session's open", async () => {
    const hook = mount({ ready: false, view: defaultPaperView });
    await act(async () => { await vi.advanceTimersByTimeAsync(FLUSH_MS); });
    expect(api.postActivity).not.toHaveBeenCalled();
    hook.rerender({ ready: true, view: defaultPaperView });
    await act(async () => { await vi.advanceTimersByTimeAsync(FLUSH_MS); });
    expect(actions()).toEqual(["session:open"]);
    expect(vi.mocked(api.postActivity).mock.calls[0]).toEqual(["p", expect.any(Array), { keepalive: false }]);
  });

  it("on pagehide logs the close and sends at once with keepalive", async () => {
    mount({ ready: true, view: defaultPaperView });
    act(() => { window.dispatchEvent(new Event("pagehide")); });
    await act(async () => { await Promise.resolve(); });
    expect(actions()).toEqual(["session:open", "session:close"]);
    expect(vi.mocked(api.postActivity).mock.calls[0][2]).toEqual({ keepalive: true });
  });

  it("logs the close when the paper goes (another is chosen)", async () => {
    const hook = mount({ ready: true, view: defaultPaperView });
    hook.unmount();
    await act(async () => { await Promise.resolve(); });
    expect(actions()).toEqual(["session:open", "session:close"]);
  });

  it("logs a view switch, not the view the paper opened in", async () => {
    const hook = mount({ ready: true, view: { ...defaultPaperView, view: "both" } });
    hook.rerender({ ready: true, view: { ...defaultPaperView, view: "board" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(FLUSH_MS); });
    expect(sent().filter((e) => e.action === "view").map((e) => e.detail)).toEqual([{ view: "board" }]);
  });

  it("logs a page the paper rested on for 2 s or more, counted from 1, when it moves on", async () => {
    const at = (page: number): Props => ({ ready: true, view: { ...defaultPaperView, paper_scroll: { page, y: 0 } } });
    const hook = mount(at(3));
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    hook.rerender(at(4));   // page index 3 for 1 s: not read
    await act(async () => { await vi.advanceTimersByTimeAsync(7000); });
    hook.rerender(at(5));   // page index 4 for 7 s
    await act(async () => { await vi.advanceTimersByTimeAsync(FLUSH_MS); });
    expect(sent().filter((e) => e.action === "page").map((e) => e.detail)).toEqual([{ page: 5, seconds: 7 }]);
  });

  it("ends the page when the board alone is shown", async () => {
    const hook = mount({ ready: true, view: defaultPaperView });   // no scroll yet: the first page
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    hook.rerender({ ready: true, view: { ...defaultPaperView, view: "board" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(FLUSH_MS); });
    expect(sent().filter((e) => e.action === "page").map((e) => e.detail)).toEqual([{ page: 1, seconds: 3 }]);
  });

  it("queues nothing while the paper's log is off", async () => {
    const hook = mount({ ready: true, view: { ...defaultPaperView, log: false } });
    hook.rerender({ ready: true, view: { ...defaultPaperView, log: false, view: "board" } });
    hook.result.current.log("build", "undo");
    await act(async () => { await vi.advanceTimersByTimeAsync(FLUSH_MS); });
    hook.unmount();
    await act(async () => { await Promise.resolve(); });
    expect(api.postActivity).not.toHaveBeenCalled();
  });

  it("logs a note's text when its edit ends, only if it changed", async () => {
    const hook = mount({ ready: true, view: defaultPaperView });
    const { noteSeen, noteEnded } = hook.result.current;
    noteSeen("n-1", "as loaded");
    noteEnded("n-1", "as loaded", null);
    noteEnded("n-1", "the learner drives", "h-1");
    await act(async () => { await vi.advanceTimersByTimeAsync(FLUSH_MS); });
    expect(sent().filter((e) => e.action === "note").map((e) => e.detail)).toEqual([{ id: "n-1", text: "the learner drives", on: "h-1" }]);
  });
});
