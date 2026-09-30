import { act, cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
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
const log = vi.fn();
vi.mock("../ai/AiProvider", () => ({ useAi: () => ({ keySentences: groups, goTo }) }));
const board = vi.hoisted(() => ({ highlights: [] as unknown[] }));
vi.mock("../state/BoardProvider", () => ({ useBoard: () => ({ paperId: "p", dispatch, state: { board }, activity: { log } }) }));
// The server reads the anchor off the paper: its printed words, prefix, suffix and position, not the model's copy.
const printed = { rects: [r(2, 100), r(2, 112)], quote: { exact: "Deep nets de-\ngrade.", prefix: "shown. ", suffix: " We" },
  position: 4321, state: "anchored" as const };
const postText = vi.fn(async (..._args: unknown[]) => ({ highlight: printed }));
vi.mock("../api/client", () => ({ api: { postText: (...args: unknown[]) => postText(...args) } }));
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
    expect(log.mock.calls).toEqual([["ai", "jump", { slot: "Problem", text: "Deep nets degrade." }], ["ai", "jump", { slot: "Problem", text: "It is hard." }]]);
  });
  it("Keep makes one plain highlight of the reader's own, anchored by the server from the same lines, and is not offered without lines", async () => {
    const { getAllByRole } = render(<KeySentences />);
    const items = getAllByRole("listitem");
    expect(within(items[1]).queryByRole("button", { name: /Keep/ })).toBeNull();
    await act(async () => { fireEvent.click(within(items[0]).getByRole("button", { name: /Keep/ })); });
    await waitFor(() => expect(dispatch).toHaveBeenCalledTimes(1));
    expect(postText).toHaveBeenCalledWith("p", [r(2, 100), r(2, 112)], false, "text", [r(2, 100), r(2, 112)]);
    expect(dispatch).toHaveBeenCalledWith({ type: "addHighlight", highlight: { id: expect.stringMatching(/^h-/), tags: [], anchor: printed } });
    expect(goTo).not.toHaveBeenCalled();   // keeping is not a jump
    expect(log.mock.calls).toEqual([["ai", "keep", { slot: "Problem", text: "Deep nets degrade." }]]);
  });
  it("a Keep the server refuses adds nothing and records nothing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    postText.mockRejectedValueOnce(new Error("no anchor"));
    const { getAllByRole } = render(<KeySentences />);
    await act(async () => { fireEvent.click(within(getAllByRole("listitem")[0]).getByRole("button", { name: /Keep/ })); });
    await waitFor(() => expect(postText).toHaveBeenCalledTimes(1));
    expect(dispatch).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });
  it("Keep pressed twice while the server answers still makes one highlight", async () => {
    const { getAllByRole } = render(<KeySentences />);
    const keep = within(getAllByRole("listitem")[0]).getByRole("button", { name: /Keep/ });
    await act(async () => { fireEvent.click(keep); fireEvent.click(keep); });
    await waitFor(() => expect(dispatch).toHaveBeenCalledTimes(1));
    expect(postText).toHaveBeenCalledTimes(1);
  });
  it("a sentence already kept shows Kept instead of Keep, by its lines, though the printed words differ from the AI's", () => {
    board.highlights = [{ id: "h-1", tags: [], anchor: printed }];
    const { getAllByRole } = render(<KeySentences />);
    const [first, , third] = getAllByRole("listitem");
    expect(within(first).queryByRole("button", { name: /Keep/ })).toBeNull();
    expect(first.textContent).toContain("Kept");
    expect(within(third).getByRole("button", { name: /Keep/ })).toBeTruthy();
  });
  it("the same words highlighted elsewhere are not this sentence kept", () => {
    board.highlights = [{ id: "h-1", tags: [], anchor: { ...printed, quote: { exact: "Deep nets degrade.", prefix: "", suffix: "" }, rects: [r(2, 400)] } }];
    const { getAllByRole } = render(<KeySentences />);
    expect(within(getAllByRole("listitem")[0]).getByRole("button", { name: /Keep/ })).toBeTruthy();
  });
});
