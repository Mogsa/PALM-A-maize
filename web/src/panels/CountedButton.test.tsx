import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CountedButton, sentenceCount } from "./CountedButton";

afterEach(cleanup);

describe("CountedButton", () => {
  it("shows the label with its count and toggles its panel", () => {
    const onToggle = vi.fn();
    const { getByRole } = render(<CountedButton panel="keySentences" open={null} label="Key sentences" count={3} onToggle={onToggle} />);
    const button = getByRole("button", { name: /Key sentences/ });
    expect(button.textContent).toBe("3Key sentences");
    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith("keySentences");
  });
  it("the agent notes badge counts the notes waiting in agent/", () => {
    const { getByRole } = render(<CountedButton panel="agentNotes" open={null} label="Agent notes" count={2} onToggle={vi.fn()} />);
    expect(getByRole("button", { name: /Agent notes/ }).textContent).toBe("2Agent notes");
  });
  it("hides at zero", () => {
    expect(render(<CountedButton panel="keySentences" open={null} label="Key sentences" count={0} onToggle={vi.fn()} />).container.textContent).toBe("");
  });
  it("counts key sentences across slots", () => {
    const s = { slot: "P", colour: "c", quote: "q", page: 0, lines: [], at: null };
    expect(sentenceCount([{ slot: "P", colour: "c", sentences: [s, s] }, { slot: "M", colour: "c", sentences: [s] }])).toBe(3);
    expect(sentenceCount([])).toBe(0);
  });
});
