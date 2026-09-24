import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const board = { version: 3 };
vi.mock("../state/BoardProvider", () => ({ useBoard: () => ({ paperId: "p", state: { board } }) }));
vi.mock("../api/client", () => ({ api: { getQuestions: vi.fn() } }));
import { api } from "../api/client";
import { QUESTIONS_FAILED_MESSAGE, QuestionList } from "./QuestionList";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("the question list", () => {
  it("shows the server's list and opens what is clicked", async () => {
    vi.mocked(api.getQuestions).mockResolvedValue([{ id: "h-1", kind: "highlight", text: "the residual function" }]);
    const onPick = vi.fn();
    render(<QuestionList onPick={onPick} />);
    fireEvent.click(await screen.findByRole("button", { name: /the residual function/ }));
    expect(onPick).toHaveBeenCalledWith({ id: "h-1", kind: "highlight", text: "the residual function" });
  });
  it("fetches again when a save lands", async () => {
    vi.mocked(api.getQuestions).mockResolvedValue([]);
    const { rerender } = render(<QuestionList onPick={vi.fn()} />);
    await vi.waitFor(() => expect(api.getQuestions).toHaveBeenCalledTimes(1));
    board.version = 4;
    rerender(<QuestionList onPick={vi.fn()} />);
    await vi.waitFor(() => expect(api.getQuestions).toHaveBeenCalledTimes(2));
  });
  it("says so when the list cannot be loaded", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(api.getQuestions).mockRejectedValue(new Error("down"));
    render(<QuestionList onPick={vi.fn()} />);
    expect(await screen.findByText(QUESTIONS_FAILED_MESSAGE)).toBeTruthy();
  });
});
