import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api/client";
import { NO_AI, type AiStatus } from "./types";
import { AI_POLL_MS, AiProvider, useAi } from "./AiProvider";
import { AiStatus as AiStatusNote } from "./AiStatus";

const view = { ai: false };
const setView = vi.fn((patch: { ai?: boolean }) => Object.assign(view, patch));
const flushView = vi.fn(() => Promise.resolve());
const log = vi.fn();
vi.mock("../state/BoardProvider", () => ({ useBoard: () => ({ paperId: "p", view, setView, flushView, activity: { log } }) }));

const done: AiStatus = { status: "done", stale: false, message: null,
  ai: { schema: 1, extracted_at: "t", defined: {}, reader: { model: "m", made_at: "t", terms: [], where_to_look: [] } } };

function Probe() {
  const ai = useAi();
  return <><span data-testid="has">{ai.ai ? "yes" : "no"}</span><AiStatusNote /><button onClick={() => ai.setOn(true)}>on</button></>;
}
const mount = () => render(<AiProvider goTo={() => {}}><Probe /></AiProvider>);

// The template names the slots, so key sentences can follow its order.
beforeEach(() => { vi.spyOn(api, "getTemplate").mockResolvedValue({ schema: 1, slots: [{ name: "Problem", prompt: "" }, { name: "Method", prompt: "" }] }); });
afterEach(() => {
  cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); view.ai = false; setView.mockClear(); log.mockClear();
  flushView.mockReset(); flushView.mockImplementation(() => Promise.resolve());
});

describe("AiProvider", () => {
  it("AI off shows nothing AI and makes no request", async () => {
    const get = vi.spyOn(api, "getAi"); const run = vi.spyOn(api, "runAi");
    mount();
    await act(async () => {});
    expect(get).not.toHaveBeenCalled(); expect(run).not.toHaveBeenCalled(); expect(api.getTemplate).not.toHaveBeenCalled();
    expect(screen.getByTestId("has").textContent).toBe("no");
    expect(screen.queryByText(/AI/)).toBeNull();
  });

  it("turning it on with no ai.json runs the pass and says so meanwhile", async () => {
    vi.spyOn(api, "getAi").mockResolvedValue(NO_AI);
    let finish: (s: AiStatus) => void = () => {};
    vi.spyOn(api, "runAi").mockReturnValue(new Promise((r) => { finish = r; }));
    const { rerender } = mount();
    await act(async () => { screen.getByText("on").click(); });
    rerender(<AiProvider goTo={() => {}}><Probe /></AiProvider>);
    await waitFor(() => expect(screen.getByText("AI reading…")).toBeTruthy());
    await act(async () => finish(done));
    await waitFor(() => expect(screen.getByTestId("has").textContent).toBe("yes"));
    expect(log.mock.calls).toEqual([["ai", "on"]]);   // the reader's switch, for the activity log
  });

  it("gives the key sentences in the template's slot order", async () => {
    view.ai = true;
    const at = { page: 2, rect: [0, 0, 10, 10] as [number, number, number, number] };
    const where = [{ slot: "Method", spans: [{ span: "s", quote: "We train.", at }] }, { slot: "Problem", spans: [{ span: "s", quote: "It degrades.", at }] }];
    vi.spyOn(api, "getAi").mockResolvedValue({ ...done, ai: { ...done.ai!, reader: { ...done.ai!.reader!, where_to_look: where } } });
    let slots: string[] = [];
    function Slots() { slots = useAi().keySentences.map((g) => g.slot); return null; }
    render(<AiProvider goTo={() => {}}><Slots /></AiProvider>);
    await waitFor(() => expect(slots).toEqual(["Problem", "Method"]));
  });

  it("redo reads the template again, so slots renamed or reordered since keep their order and colours", async () => {
    view.ai = true;
    const at = { page: 2, rect: [0, 0, 10, 10] as [number, number, number, number] };
    const where = [{ slot: "Method", spans: [{ span: "s", quote: "We train.", at }] }, { slot: "Problem", spans: [{ span: "s", quote: "It degrades.", at }] }];
    const status = { ...done, ai: { ...done.ai!, reader: { ...done.ai!.reader!, where_to_look: where } } };
    vi.spyOn(api, "getAi").mockResolvedValue(status);
    vi.spyOn(api, "runAi").mockResolvedValue(status);
    let ai: ReturnType<typeof useAi> | null = null;
    function Slots() { ai = useAi(); return null; }
    render(<AiProvider goTo={() => {}}><Slots /></AiProvider>);
    await waitFor(() => expect(ai!.keySentences.map((g) => g.slot)).toEqual(["Problem", "Method"]));
    vi.mocked(api.getTemplate).mockResolvedValue({ schema: 1, slots: [{ name: "Method", prompt: "" }, { name: "Problem", prompt: "" }] });
    await act(async () => ai!.redo());
    await waitFor(() => expect(ai!.keySentences.map((g) => g.slot)).toEqual(["Method", "Problem"]));
    expect(api.getTemplate).toHaveBeenCalledTimes(2);
  });

  it("a failed pass is one plain line and turns AI off", async () => {
    view.ai = true;
    vi.spyOn(api, "getAi").mockResolvedValue(NO_AI);
    vi.spyOn(api, "runAi").mockRejectedValue(new Error("AI help could not run: no valid API key"));
    mount();
    await waitFor(() => expect(screen.getByText("AI help could not run: no valid API key")).toBeTruthy());
    expect(setView).toHaveBeenCalledWith({ ai: false });
    expect(log).not.toHaveBeenCalled();   // turned off by a failure, not by the reader
  });

  it("a stale ai.json is not used", async () => {
    view.ai = true;
    vi.spyOn(api, "getAi").mockResolvedValue({ ...done, stale: true });
    mount();
    await waitFor(() => expect(screen.getByText(/older reading/)).toBeTruthy());
    expect(screen.getByTestId("has").textContent).toBe("no");
  });

  it("turning it on saves the view before it asks the server, which refuses a pass while the view says off", async () => {
    let saved: () => void = () => {};
    flushView.mockImplementation(() => new Promise<void>((r) => { saved = r; }));
    const get = vi.spyOn(api, "getAi").mockResolvedValue(NO_AI);
    const run = vi.spyOn(api, "runAi").mockResolvedValue(done);
    const { rerender } = mount();
    await act(async () => { screen.getByText("on").click(); });
    rerender(<AiProvider goTo={() => {}}><Probe /></AiProvider>);
    await act(async () => {});
    expect(flushView).toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled(); expect(run).not.toHaveBeenCalled();
    await act(async () => saved());
    await waitFor(() => expect(run).toHaveBeenCalled());
  });

  it("a status that cannot be read says so, keeps AI on, and asks again", async () => {
    vi.useFakeTimers();
    view.ai = true;
    const get = vi.spyOn(api, "getAi").mockRejectedValueOnce(new Error("AI help could not run: server down")).mockResolvedValue(done);
    mount();
    await act(async () => {});
    expect(screen.getByText("AI help could not run: server down")).toBeTruthy();
    expect(setView).not.toHaveBeenCalledWith({ ai: false });
    await act(async () => { await vi.advanceTimersByTimeAsync(AI_POLL_MS); });
    expect(get).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(/could not run/)).toBeNull();   // the next status read clears the line
    expect(screen.getByTestId("has").textContent).toBe("yes");
  });

  it("a first read that fails still gets the paper its pass once the server answers that there is none", async () => {
    vi.useFakeTimers();
    view.ai = true;
    vi.spyOn(api, "getAi").mockRejectedValueOnce(new Error("AI help could not run: server down")).mockResolvedValue(NO_AI);
    const run = vi.spyOn(api, "runAi").mockResolvedValue(done);
    mount();
    await act(async () => {});
    expect(run).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(AI_POLL_MS); });
    expect(run).toHaveBeenCalledTimes(1);
    expect(setView).not.toHaveBeenCalledWith({ ai: false });
    expect(screen.getByTestId("has").textContent).toBe("yes");
  });

  it("a poll that fails says so, keeps AI on, and the next poll takes the status it reads", async () => {
    vi.useFakeTimers();
    view.ai = true;
    const get = vi.spyOn(api, "getAi").mockResolvedValueOnce({ ...NO_AI, status: "running" })
      .mockRejectedValueOnce(new Error("AI help could not run: server down")).mockResolvedValue(done);
    mount();
    await act(async () => {});
    await act(async () => { await vi.advanceTimersByTimeAsync(AI_POLL_MS); });
    expect(screen.getByText("AI help could not run: server down")).toBeTruthy();
    expect(setView).not.toHaveBeenCalledWith({ ai: false });
    await act(async () => { await vi.advanceTimersByTimeAsync(AI_POLL_MS); });
    expect(get).toHaveBeenCalledTimes(3);
    expect(screen.queryByText(/could not run/)).toBeNull();
    expect(screen.getByTestId("has").textContent).toBe("yes");
    await act(async () => { await vi.advanceTimersByTimeAsync(AI_POLL_MS * 3); });
    expect(get).toHaveBeenCalledTimes(3);   // done: nothing left to wait for
  });
});
