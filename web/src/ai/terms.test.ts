import { describe, expect, it, vi } from "vitest";
import { api } from "../api/client";
import type { Highlight, PageRect } from "../model/types";
import type { AiFile, AiTerm } from "./types";
import { aiEntryFor, aiGlossary, aiTermAt, aiUnderlines, cardParts, keepTerm } from "./terms";

const at = (page: number, x0: number): PageRect => ({ page, rect: [x0, 10, x0 + 40, 20] });
const g = (span: string, quote: string) => ({ span, quote, at: at(0, 0) });
const term = (t: Partial<AiTerm>): AiTerm => ({ term: "residual", defined_in: [], explanation: "Skip path.", grounds: [g("p1-r1", "q")], occurrences: [at(0, 100), at(0, 300)], ...t });
const file = (terms: AiTerm[], defined = {}): AiFile => ({ schema: 1, extracted_at: "t", defined,
  reader: { model: "m", made_at: "t", terms, where_to_look: [{ slot: "Problem", spans: [g("p1-r4", "x")] }] } });
const mark = (r: PageRect, tags = ["t-term"]): Highlight =>
  ({ id: "h-1", tags, anchor: { quote: { exact: "residual", prefix: "", suffix: "" }, rects: [r], state: "ok" } } as unknown as Highlight);

describe("aiEntryFor", () => {
  it("finds a pass term in any case, then falls back to a quick definition", () => {
    expect(aiEntryFor(file([term({})]), "Residual")?.explanation).toBe("Skip path.");
    const quick = file([], { "batch norm": { model: "s", explanation: "Rescales.", grounds: [] } });
    expect(aiEntryFor(quick, "Batch  Norm")?.explanation).toBe("Rescales.");
    expect(aiEntryFor(null, "x")).toBeNull();
  });
});

describe("aiUnderlines", () => {
  it("the reader's own term mark wins where they meet", () => {
    const lines = aiUnderlines(file([term({})]), [mark(at(0, 100))], 0);
    expect(lines.map((l) => l.at.rect[0])).toEqual([300]);
  });
  it("nothing when there is no AI file", () => {
    expect(aiUnderlines(null, [], 0)).toEqual([]);
  });
  it("hit-tests an underline, not a reader's mark", () => {
    const ai = file([term({})]);
    expect(aiTermAt(ai, [mark(at(0, 100))], { page: 0, x: 310, y: 15 })?.term).toBe("residual");
    expect(aiTermAt(ai, [mark(at(0, 100))], { page: 0, x: 110, y: 15 })).toBeNull();
  });
});

describe("cardParts", () => {
  it("orders: your definition, in this paper, then AI", () => {
    const entry = aiEntryFor(file([term({ defined_in: [g("p1-r1", "We call it residual")] })]), "residual");
    const parts = cardParts([{ kind: "note", noteId: "n-1" }, { kind: "definition", page: 0, sentence: "D25's", section: null }], entry);
    expect(parts.map((p) => p.kind)).toEqual(["note", "definition", "ai"]);
    expect((parts[1] as { sentence: string }).sentence).toBe("We call it residual");
  });
  it("keeps D25's definition when the AI gave none, and shows no AI part without an explanation", () => {
    const entry = aiEntryFor(file([term({ explanation: null })]), "residual");
    expect(cardParts([{ kind: "definition", page: 2, sentence: "D25's", section: "S" }], entry))
      .toEqual([{ kind: "definition", page: 2, sentence: "D25's", section: "S" }]);
  });
});

describe("aiGlossary", () => {
  it("lists AI terms the reader has not kept", () => {
    expect(aiGlossary(file([term({}), term({ term: "shortcut" })]), ["Residual"]).map((e) => e.term)).toEqual(["shortcut"]);
  });
});

describe("keepTerm", () => {
  it("makes a term mark of the reader's own from the paper's words, copying no AI text", async () => {
    const anchor = { quote: { exact: "residual", prefix: "a ", suffix: " b" }, rects: [at(0, 300)], state: "ok" };
    vi.spyOn(api, "postText").mockResolvedValue({ highlight: anchor } as never);
    const h = await keepTerm("p", at(0, 300), [{ id: "t-term", name: "term", colour: "#000" }]);
    expect(h.tags).toEqual(["t-term"]);
    expect(h.anchor).toBe(anchor);
    expect(JSON.stringify(h)).not.toContain("Skip path");
    expect(api.postText).toHaveBeenCalledWith("p", [at(0, 300)], false, "text");
  });
});
