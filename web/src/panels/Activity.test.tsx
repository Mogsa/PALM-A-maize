import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ActivityEvent } from "../activity/types";

const view = vi.hoisted(() => ({ log: true }));
const setView = vi.fn();
const flush = vi.fn(async () => undefined);
vi.mock("../state/BoardProvider", () => ({ useBoard: () => ({ paperId: "p", view, setView, activity: { flush } }) }));
vi.mock("../state/TagsProvider", () => ({ useTags: () => ({ tags: [{ id: "t-a", name: "Method", colour: "#000" }] }) }));
const at = (h: number, m: number) => new Date(2026, 8, 30, h, m).toISOString();
const events: ActivityEvent[] = [
  { t: at(10, 1), kind: "build", action: "highlight", detail: { id: "h-1", text: "regret", tags: [] } },
  { t: at(10, 2), kind: "build", action: "tag", detail: { id: "h-1", tags: ["t-a"] } },
  { t: at(10, 3), kind: "read", action: "page", detail: { page: 4, seconds: 38 } },
];
const getActivity = vi.fn(async (..._args: unknown[]) => events);
vi.mock("../api/client", () => ({ api: { getActivity: (...args: unknown[]) => getActivity(...args) } }));
import { Activity, ACTIVITY_LIMIT, ACTIVITY_READ_FAILED } from "./Activity";

afterEach(() => { cleanup(); vi.clearAllMocks(); view.log = true; });

describe("Activity panel", () => {
  it("sends what is queued, then reads the log and lists it newest first, one sentence and a time each", async () => {
    render(<Activity />);
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(3));
    expect(flush).toHaveBeenCalled();
    expect(getActivity).toHaveBeenCalledWith("p", ACTIVITY_LIMIT);
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "10:03Read page 4 for 38 s", "10:02Tagged a highlight Method", "10:01Highlighted “regret”",
    ]);
  });

  it("says the log is on, and its switch turns it off", async () => {
    render(<Activity />);
    expect(screen.getByText(/Recording what you do/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Turn off" }));
    expect(setView).toHaveBeenCalledWith({ log: false });
    await waitFor(() => expect(getActivity).toHaveBeenCalled());
  });

  it("says the log is off, and its switch turns it on", async () => {
    view.log = false;
    render(<Activity />);
    expect(screen.getByText(/Not recording/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Turn on" }));
    expect(setView).toHaveBeenCalledWith({ log: true });
    await waitFor(() => expect(getActivity).toHaveBeenCalled());
  });

  it("says so when there is nothing yet", async () => {
    getActivity.mockResolvedValueOnce([]);
    render(<Activity />);
    expect(await screen.findByText("Nothing recorded yet.")).toBeTruthy();
  });

  it("says so when the log cannot be read", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    getActivity.mockRejectedValueOnce(new Error("down"));
    render(<Activity />);
    expect((await screen.findByRole("alert")).textContent).toBe(ACTIVITY_READ_FAILED);
    error.mockRestore();
  });
});
