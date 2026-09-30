import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { KeySentenceGroup } from "../ai/keySentences";
import type { PageRect } from "../model/types";

const r = (page: number, y: number): PageRect => ({ page, rect: [50, y, 300, y + 10] });
const groups: KeySentenceGroup[] = [
  { slot: "Problem", colour: "var(--slot-0)", sentences: [
    { slot: "Problem", colour: "var(--slot-0)", quote: "Deep nets degrade.", page: 2, lines: [r(2, 100), r(2, 112)], at: r(2, 90) },
    { slot: "Problem", colour: "var(--slot-0)", quote: "It is hard.", page: 3, lines: [], at: r(3, 40) },
  ] },
  { slot: "Method", colour: "var(--slot-2)", sentences: [
    { slot: "Method", colour: "var(--slot-2)", quote: "We add shortcuts.", page: 4, lines: [r(4, 10)], at: r(4, 0) },
  ] },
];
const goTo = vi.fn();
const dispatch = vi.fn();
vi.mock("../ai/AiProvider", () => ({ useAi: () => ({ keySentences: groups, goTo }) }));
const board = vi.hoisted(() => ({ highlights: [] as unknown[] }));
vi.mock("../state/BoardProvider", () => ({ useBoard: () => ({ dispatch, state: { board } }) }));
import { KeySentences } from "./KeySentences";

afterEach(() => { cleanup(); vi.clearAllMocks(); board.highlights = []; });

describe("KeySentences panel", () => {
  it("lists the sentences grouped by slot, in order, each with its page, marked AI", () => {
    const { getAllByRole, container } = render(<KeySentences />);
    const heads = [...container.querySelectorAll<HTMLElement>(".slot-head")];
    expect(heads.map((h) => h.textContent)).toEqual(["Problem", "Method"]);
    expect(heads[1].style.getPropertyValue("--key-colour")).toBe("var(--slot-2)");
    const items = getAllByRole("listitem");
    expect(items.map((li) => li.querySelector(".quote")!.textContent)).toEqual(["Deep nets degrade.", "It is hard.", "We add shortcuts."]);
    expect(items[0].textContent).toContain("p. 3");   // pages are counted from 1 for the reader
    expect(container.querySelector("h3 .ai-badge")?.textContent).toBe("AI");
  });
  it("jumps to a sentence's first line, else to its span", () => {
    const { getByRole } = render(<KeySentences />);
    fireEvent.click(getByRole("button", { name: /Deep nets degrade/ }));
    expect(goTo).toHaveBeenCalledWith(r(2, 100));
    fireEvent.click(getByRole("button", { name: /It is hard/ }));
    expect(goTo).toHaveBeenLastCalledWith(r(3, 40));
  });
  it("Keep makes one plain highlight of the reader's own on the same lines, and is not offered without lines", () => {
    const { getAllByRole } = render(<KeySentences />);
    const items = getAllByRole("listitem");
    expect(within(items[1]).queryByRole("button", { name: /Keep/ })).toBeNull();
    fireEvent.click(within(items[0]).getByRole("button", { name: /Keep/ }));
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({ type: "addHighlight", highlight: {
      id: expect.stringMatching(/^h-/), tags: [],
      anchor: { rects: [r(2, 100), r(2, 112)], quote: { exact: "Deep nets degrade.", prefix: "", suffix: "" }, position: 0, state: "anchored" },
    } });
    expect(goTo).not.toHaveBeenCalled();   // keeping is not a jump
  });
  it("a sentence already kept shows Kept instead of Keep, so it is never kept twice", () => {
    board.highlights = [{ id: "h-1", tags: [], anchor: { rects: [r(2, 100), r(2, 112)], quote: { exact: "Deep nets degrade.", prefix: "", suffix: "" }, position: 0, state: "anchored" } }];
    const { getAllByRole } = render(<KeySentences />);
    const first = getAllByRole("listitem")[0];
    expect(within(first).queryByRole("button", { name: /Keep/ })).toBeNull();
    expect(first.textContent).toContain("Kept");
  });
});
