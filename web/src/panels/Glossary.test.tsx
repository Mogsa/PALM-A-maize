import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AiFile } from "../ai/types";
import { emptyBoard, type Board, type Highlight } from "../model/types";

const mark = (id: string, exact: string, tags = ["t-term"]): Highlight => ({
  id, tags, anchor: { rects: [{ page: 2, rect: [50, 300, 90, 310] }], quote: { exact, prefix: "", suffix: "" }, position: 0, state: "anchored" },
});
const board: Board = {
  ...emptyBoard("p"),
  highlights: [mark("h-z", "shortcut"), mark("h-a", "Affine"), mark("h-q", "unclear", ["t-question"])],
  nodes: [{ id: "n-1", type: "note", position: { x: 0, y: 0 }, data: { tags: [], collapsed: false, note: "notes/n-1.md", origin: "reader" } }],
  edges: [{ id: "e-1", from: "h-z", to: "n-1", data: { tags: [] } }],
};
const notes: Record<string, string> = { "n-1": "A path that **skips** layers.\nSecond line, not shown." };
vi.mock("../state/BoardProvider", () => ({ useBoard: () => ({ state: { board } }), useNote: (id: string) => ({ text: notes[id] }) }));
vi.mock("../state/TagsProvider", () => ({ useTags: () => ({ tags: [{ id: "t-term", name: "term", colour: "#0F766E" }] }) }));
import { Glossary } from "./Glossary";

afterEach(cleanup);

// Task 9's AiProvider (useAi) is not built yet: the Glossary takes the AI file as a prop instead
// (`ai?: AiFile | null`), which the future AiProvider consumer will pass in as `useAi().ai`.
const renderGlossary = (ai?: AiFile | null) =>
  render(<Glossary onJump={vi.fn()} onOpenNote={vi.fn()} ai={ai} />);

describe("Glossary (D27)", () => {
  it("lists every term mark alphabetically, with the first line of the reader's definition rendered", () => {
    const { getAllByRole, container } = render(<Glossary onJump={vi.fn()} onOpenNote={vi.fn()} />);
    const rows = getAllByRole("listitem");
    expect(rows.map((r) => r.querySelector(".term")!.textContent)).toEqual(["Affine", "shortcut"]);
    expect(rows[1].textContent).toContain("A path that skips layers.");
    expect(rows[1].textContent).not.toContain("Second line");
    expect(container.querySelector("strong")?.textContent).toBe("skips");
    expect(rows[0].textContent).toContain("No definition of yours yet");
  });
  it("jumps to where a term is used, and opens the note on a click of its definition; nothing is edited here", () => {
    const onJump = vi.fn();
    const onOpenNote = vi.fn();
    const { getByRole, container } = render(<Glossary onJump={onJump} onOpenNote={onOpenNote} />);
    fireEvent.click(getByRole("button", { name: "shortcut" }));
    expect(onJump).toHaveBeenCalledWith({ page: 2, rect: [50, 300, 90, 310] });
    fireEvent.click(getByRole("button", { name: /A path that/ }));
    expect(onOpenNote).toHaveBeenCalledWith("n-1");
    expect(container.querySelector("textarea, input")).toBeNull();
  });
  it("lists AI terms the reader has not kept after theirs, badged AI", () => {
    const ai: AiFile = {
      schema: 1,
      extracted_at: "t",
      defined: {},
      reader: {
        model: "m",
        made_at: "t",
        terms: [{ term: "gradient", explanation: "Skips layers.", defined_in: [], grounds: [], occurrences: [] }],
        where_to_look: [],
      },
    };
    const { getAllByRole } = renderGlossary(ai);
    const rows = getAllByRole("listitem");
    expect(rows.at(-1)!.className).toContain("ai");
    expect(rows.at(-1)!.textContent).toContain("gradient");
    expect(rows.at(-1)!.textContent).toContain("AI");
  });
  it("shows no AI rows when AI is off", () => {
    const { container } = renderGlossary(null);
    expect(container.querySelectorAll("li.ai")).toHaveLength(0);
  });
});
