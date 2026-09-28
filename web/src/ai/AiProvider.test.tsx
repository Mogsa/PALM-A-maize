import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../api/client";
import { NO_AI, type AiStatus } from "./types";
import { AiProvider, useAi } from "./AiProvider";
import { AiStatus as AiStatusNote } from "./AiStatus";

const view = { ai: false };
const setView = vi.fn((patch: { ai?: boolean }) => Object.assign(view, patch));
vi.mock("../state/BoardProvider", () => ({ useBoard: () => ({ paperId: "p", view, setView }) }));

const done: AiStatus = { status: "done", stale: false, message: null,
  ai: { schema: 1, extracted_at: "t", defined: {}, reader: { model: "m", made_at: "t", terms: [], where_to_look: [] } } };

function Probe() {
  const ai = useAi();
  return <><span data-testid="has">{ai.ai ? "yes" : "no"}</span><AiStatusNote /><button onClick={() => ai.setOn(true)}>on</button></>;
}
const mount = () => render(<AiProvider goTo={() => {}}><Probe /></AiProvider>);

afterEach(() => { cleanup(); vi.restoreAllMocks(); view.ai = false; setView.mockClear(); });

describe("AiProvider", () => {
  it("AI off shows nothing AI and makes no request", async () => {
    const get = vi.spyOn(api, "getAi"); const run = vi.spyOn(api, "runAi");
    mount();
    await act(async () => {});
    expect(get).not.toHaveBeenCalled(); expect(run).not.toHaveBeenCalled();
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
  });

  it("a failed pass is one plain line and turns AI off", async () => {
    view.ai = true;
    vi.spyOn(api, "getAi").mockResolvedValue(NO_AI);
    vi.spyOn(api, "runAi").mockRejectedValue(new Error("AI help could not run: no valid API key"));
    mount();
    await waitFor(() => expect(screen.getByText("AI help could not run: no valid API key")).toBeTruthy());
    expect(setView).toHaveBeenCalledWith({ ai: false });
  });

  it("a stale ai.json is not used", async () => {
    view.ai = true;
    vi.spyOn(api, "getAi").mockResolvedValue({ ...done, stale: true });
    mount();
    await waitFor(() => expect(screen.getByText(/older reading/)).toBeTruthy());
    expect(screen.getByTestId("has").textContent).toBe("no");
  });
});
