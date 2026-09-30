import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useCallback, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AskAnswer } from "../ai/ask/types";
import { MAX_QUESTION_CHARS, MAX_SELECTION_CHARS, useAskPanel } from "../ai/ask/useAskPanel";
import { api } from "../api/client";
import { extraCommands, extraSelectionItems } from "../commands/registry";

const goTo = vi.fn();
vi.mock("../ai/AiProvider", () => ({ useAi: () => ({ goTo }) }));
const notes: Record<string, string> = { "n-1": "Depth hurts until the shortcut.\nMore." };
vi.mock("../state/BoardProvider", () => ({ useBoard: () => ({ paperId: "p" }), useNote: (id: string) => ({ text: notes[id] }) }));
import { Ask } from "./Ask";

const at = { page: 6, rect: [50, 180, 286, 250] as [number, number, number, number] };
const grounded: AskAnswer = { answer: "Deeper nets are more accurate.", grounds: [{ span: "p7-r3", quote: "more accurate", at }], notes: [], trimmed: false };
const board = {} as never;

function Harness({ on = true, onOpenNote = vi.fn() }: { on?: boolean; onOpenNote?: (id: string) => void }) {
  const [shown, setShown] = useState(false);
  const open = useCallback(() => setShown(true), []);
  const close = useCallback(() => setShown(false), []);
  const ask = useAskPanel({ on, open, close });
  return shown ? <Ask ask={ask} onOpenNote={onOpenNote} /> : <span>closed</span>;
}

/** Opens the panel as ⌘K's Ask does. */
function openThroughCommand() {
  const command = extraCommands(board).find((c) => c.label === "Ask");
  act(() => command!.run());
}

function send(question: string) {
  fireEvent.change(screen.getByRole("textbox", { name: "Question" }), { target: { value: question } });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); goTo.mockReset(); });

describe("Ask panel", () => {
  it("streams the answer in, then shows a chip per ground that scrolls the paper there", async () => {
    let finish: (a: AskAnswer) => void = () => {};
    vi.spyOn(api, "ask").mockImplementation((_, __, onDelta) => {
      onDelta('{"answer": "Deeper nets ar');
      return new Promise((resolve) => { finish = resolve; });
    });
    render(<Harness />);
    openThroughCommand();
    expect(screen.getByRole("region", { name: "Ask" }).textContent).toContain("AI");
    send("Does depth help?");
    await waitFor(() => expect(screen.getByText("Deeper nets ar")).toBeTruthy());
    await act(async () => finish(grounded));
    expect(screen.getByText("Deeper nets are more accurate.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "p7" }));
    expect(goTo).toHaveBeenCalledWith(at);
    expect(screen.queryByText(/Not found in the paper/)).toBeNull();
  });

  it("an answer with no grounds left says so instead of chips", async () => {
    vi.spyOn(api, "ask").mockResolvedValue({ ...grounded, grounds: [] });
    render(<Harness />);
    openThroughCommand();
    send("What about cats?");
    expect(await screen.findByText("Not found in the paper: treat with care")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^p\d+$/ })).toBeNull();
  });

  it("a note the answer relies on is a chip that opens the note", async () => {
    vi.spyOn(api, "ask").mockResolvedValue({ ...grounded, notes: ["n-1"] });
    const onOpenNote = vi.fn();
    render(<Harness onOpenNote={onOpenNote} />);
    openThroughCommand();
    send("What did I think?");
    fireEvent.click(await screen.findByRole("button", { name: /Your note: Depth hurts until the shortcut\./ }));
    expect(onOpenNote).toHaveBeenCalledWith("n-1");
  });

  it("sends the whole chat so far with the next question, and New chat clears the screen", async () => {
    const ask = vi.spyOn(api, "ask").mockResolvedValue(grounded);
    render(<Harness />);
    openThroughCommand();
    send("First?");
    await screen.findByText("Deeper nets are more accurate.");
    send("Second?");
    await waitFor(() => expect(ask).toHaveBeenCalledTimes(2));
    expect(ask.mock.calls[1][1]).toEqual({ question: "Second?", selection: null, use_marks: true,
      history: [{ question: "First?", answer: "Deeper nets are more accurate." }] });
    fireEvent.click(screen.getByRole("button", { name: "New chat" }));
    expect(screen.queryByText("First?")).toBeNull();
  });

  it("says when the oldest turns were left out to fit", async () => {
    vi.spyOn(api, "ask").mockResolvedValue({ ...grounded, trimmed: true });
    render(<Harness />);
    openThroughCommand();
    send("Again?");
    expect(await screen.findByText("Oldest turns were left out to fit.")).toBeTruthy();
  });

  it("Ask about this opens the panel with the selected words quoted, and sends them with the question", async () => {
    const ask = vi.spyOn(api, "ask").mockResolvedValue(grounded);
    render(<Harness />);
    const target = { on: "paper" as const, text: " residual \n learning ", rects: [at], at: new DOMRect() };
    const item = extraSelectionItems(target, board).find((i) => i.label === "Ask about this");
    act(() => item!.run());
    expect(screen.getByRole("region", { name: "Ask" }).querySelector("blockquote")!.textContent).toContain("residual learning");
    send("What is this?");
    await waitFor(() => expect(ask).toHaveBeenCalled());
    expect(ask.mock.calls[0][1]).toMatchObject({ question: "What is this?", selection: "residual learning" });
  });

  it("Ask about this clips a selection longer than the server takes, marked with an ellipsis", async () => {
    const ask = vi.spyOn(api, "ask").mockResolvedValue(grounded);
    render(<Harness />);
    const target = { on: "paper" as const, text: "w".repeat(MAX_SELECTION_CHARS + 50), rects: [at], at: new DOMRect() };
    act(() => extraSelectionItems(target, board).find((i) => i.label === "Ask about this")!.run());
    send("What is this?");
    await waitFor(() => expect(ask).toHaveBeenCalled());
    expect(ask.mock.calls[0][1].selection).toBe("w".repeat(MAX_SELECTION_CHARS - 1) + "…");
  });

  it("the question box takes no more than the server does", () => {
    render(<Harness />);
    openThroughCommand();
    expect((screen.getByRole("textbox", { name: "Question" }) as HTMLTextAreaElement).maxLength).toBe(MAX_QUESTION_CHARS);
  });

  it("the switch off sends use_marks false", async () => {
    const ask = vi.spyOn(api, "ask").mockResolvedValue(grounded);
    render(<Harness />);
    openThroughCommand();
    fireEvent.click(screen.getByRole("checkbox", { name: "Use my highlights & notes" }));
    send("Why?");
    await waitFor(() => expect(ask).toHaveBeenCalled());
    expect(ask.mock.calls[0][1].use_marks).toBe(false);
  });

  it("Show what's sent shows the server's block, exactly", async () => {
    vi.spyOn(api, "askContext").mockResolvedValue('<reader>\n<goal>Why depth</goal>\n</reader>');
    render(<Harness />);
    openThroughCommand();
    fireEvent.click(screen.getByText("Show what's sent"));
    await waitFor(() => expect(screen.getByTestId("ask-context").textContent).toBe("<reader>\n<goal>Why depth</goal>\n</reader>"));
    expect(api.askContext).toHaveBeenCalledWith("p");
  });

  it("with AI help off there is no Ask command, no Ask about this, and the panel closes", () => {
    const { rerender } = render(<Harness />);
    openThroughCommand();
    expect(screen.getByRole("region", { name: "Ask" })).toBeTruthy();
    rerender(<Harness on={false} />);
    expect(screen.getByText("closed")).toBeTruthy();
    expect(extraCommands(board).some((c) => c.label === "Ask")).toBe(false);
    const target = { on: "paper" as const, text: "word", rects: [at], at: new DOMRect() };
    expect(extraSelectionItems(target, board).some((i) => i.label === "Ask about this")).toBe(false);
  });
});
