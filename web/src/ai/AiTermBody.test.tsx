import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../api/client";
import type { AiFile } from "./types";

const dispatch = vi.fn();
const log = vi.fn();
const addDefinition = vi.fn();
let ai: AiFile | null = null;
const source = { page_text: [{ page: 0, text: "We call this a residual block. A residual block adds." }], sections: [], figures: [], regions: [], pages: [] };
vi.mock("../state/BoardProvider", () => ({ useBoard: () => ({ paperId: "p", source, state: { board: { highlights: [], nodes: [], edges: [] } }, dispatch, activity: { log } }) }));
vi.mock("../state/TagsProvider", () => ({ useTags: () => ({ tags: [{ id: "t-term", name: "term", colour: "#000" }] }) }));
vi.mock("./AiProvider", () => ({ useAi: () => ({ ai, on: true, addDefinition, goTo: vi.fn() }) }));

import { AiTermBody } from "./AiTermBody";

const at = { page: 0, rect: [10, 10, 60, 20] as [number, number, number, number] };
const g = { span: "p1-r1", quote: "residual block adds", at };

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("AiTermBody", () => {
  it("shows the paper's definition, then the AI part with its badge and a based-on link", () => {
    ai = { schema: 1, extracted_at: "t", defined: {}, reader: { model: "m", made_at: "t", where_to_look: [],
      terms: [{ term: "residual block", defined_in: [], explanation: "A shortcut around layers.", grounds: [g], occurrences: [at] }] } };
    render(<AiTermBody term="residual block" at={at} onGo={vi.fn()} onOpenNote={vi.fn()} />);
    const labels = screen.getAllByText(/In this paper|AI/).map((e) => e.textContent);
    expect(labels[0]).toMatch(/In this paper/);
    expect(screen.getByText("A shortcut around layers.")).toBeTruthy();
    expect(screen.getByText("based on p1 ↗")).toBeTruthy();
  });

  it("Keep adds a term mark and no AI text", async () => {
    vi.spyOn(api, "postText").mockResolvedValue({ highlight: { quote: { exact: "residual block" }, rects: [at], state: "ok" } } as never);
    render(<AiTermBody term="residual block" at={at} onGo={vi.fn()} onOpenNote={vi.fn()} />);
    fireEvent.click(screen.getByText("Keep"));
    await waitFor(() => expect(dispatch).toHaveBeenCalled());
    const action = dispatch.mock.calls[0][0];
    expect(action.type).toBe("addHighlight");
    expect(action.highlight.tags).toEqual(["t-term"]);
    expect(JSON.stringify(action)).not.toContain("shortcut around");
    expect(log).toHaveBeenCalledWith("ai", "keep", { slot: null, text: "residual block" });
  });

  it("offers Define when the AI part is empty, and streams into the card", async () => {
    ai = { schema: 1, extracted_at: "t", defined: {}, reader: null };
    vi.spyOn(api, "define").mockImplementation(async (_id, _req, onDelta) => {
      onDelta('{"explanation": "Adds the in');
      return { model: "s", explanation: "Adds the input back.", grounds: [g] };
    });
    render(<AiTermBody term="residual block" at={at} onGo={vi.fn()} onOpenNote={vi.fn()} />);
    fireEvent.click(screen.getByText("Define"));
    await waitFor(() => expect(addDefinition).toHaveBeenCalledWith("residual block", expect.objectContaining({ explanation: "Adds the input back." })));
    expect(api.define).toHaveBeenCalledWith("p", expect.objectContaining({ word: "residual block", page: 0 }), expect.any(Function));
    expect(log).toHaveBeenCalledWith("ai", "define", { word: "residual block" });
  });
});
