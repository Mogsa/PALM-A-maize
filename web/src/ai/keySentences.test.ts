import { describe, expect, it } from "vitest";
import type { PageRect } from "../model/types";
import { keySentences, SLOT_COLOURS, slotColour } from "./keySentences";
import type { AiFile, Ground, SlotSpans } from "./types";

const r = (page: number, y: number): PageRect => ({ page, rect: [50, y, 300, y + 10] });
const g = (quote: string, at: PageRect | null, lines?: PageRect[]): Ground => ({ span: "p1-r1", quote, at, lines });
const file = (where: SlotSpans[]): AiFile => ({ schema: 1, extracted_at: "t", defined: {},
  reader: { model: "m", made_at: "t", terms: [], where_to_look: where } });

describe("keySentences", () => {
  it("groups by slot in the template's order, not the pass's, and leaves out slots with none", () => {
    const ai = file([
      { slot: "Method", spans: [g("We train it.", r(3, 100), [r(3, 100)])] },
      { slot: "Problem", spans: [g("Deep nets degrade.", r(0, 200), [r(0, 200), r(0, 212)]), g("It is hard.", r(1, 50), [])] },
    ]);
    const groups = keySentences(ai, ["Problem", "Evidence", "Method"]);
    expect(groups.map((s) => s.slot)).toEqual(["Problem", "Method"]);
    expect(groups[0].sentences.map((s) => s.quote)).toEqual(["Deep nets degrade.", "It is hard."]);
  });
  it("colours a slot by its index in the template, so a colour stays with its slot", () => {
    const ai = file([{ slot: "Method", spans: [g("We train it.", r(3, 100))] }]);
    const [method] = keySentences(ai, ["Problem", "Evidence", "Method"]);
    expect(method.colour).toBe(slotColour(2));
    expect(method.sentences[0].colour).toBe(slotColour(2));
    expect(slotColour(SLOT_COLOURS.length + 1)).toBe(slotColour(1));
  });
  it("takes the page from the first line, else the span; lines default to none", () => {
    const ai = file([{ slot: "Problem", spans: [g("a.", r(4, 0), [r(5, 10)]), g("b.", r(6, 0))] }]);
    const [problem] = keySentences(ai, ["Problem"]);
    expect(problem.sentences.map((s) => [s.page, s.lines.length])).toEqual([[5, 1], [6, 0]]);
    expect(problem.sentences[1]).toMatchObject({ slot: "Problem", at: r(6, 0), lines: [] });
  });
  it("keeps a slot the template no longer has, after the template's, and drops a sentence with nowhere to go", () => {
    const ai = file([{ slot: "Old", spans: [g("x.", r(0, 0)), g("y.", null)] }, { slot: "Problem", spans: [g("z.", r(1, 0))] }]);
    const groups = keySentences(ai, ["Problem"]);
    expect(groups.map((s) => [s.slot, s.colour, s.sentences.length])).toEqual([["Problem", slotColour(0), 1], ["Old", slotColour(1), 1]]);
  });
  it("is empty with AI off or no pass", () => {
    expect(keySentences(null, ["Problem"])).toEqual([]);
    expect(keySentences({ schema: 1, extracted_at: "t", defined: {}, reader: null }, ["Problem"])).toEqual([]);
  });
});
