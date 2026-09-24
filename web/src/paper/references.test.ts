import { describe, expect, it } from "vitest";
import type { Figure, Section, Source } from "../model/types";
import { findReferences, formulaNumbered, resolveReference, type Reference } from "./references";

const spans = (text: string) => findReferences(text).map((r) => [r.kind, r.key, text.slice(r.start, r.end)]);

describe("findReferences (D26): the paper's own pointers in a chunk's text, by named patterns", () => {
  it.each([
    // ResNet
    ["with “shortcut connections” (Fig. 2). Shortcut", [["figure", "2", "Fig. 2"]]],
    ["on ImageNet is presented in Fig. 4. greatly", [["figure", "4", "Fig. 4"]]],
    ["The shortcut connections in Eqn.(1) introduce", [["equation", "1", "Eqn.(1)"]]],
    ["motivation (Sec.3.1) that the residual", [["section", "3.1", "Sec.3.1"]]],
    ["training (Sec. 3.4), we randomly", [["section", "3.4", "Sec. 3.4"]]],
    ["as shown in Table 2, the", [["table", "2", "Table 2"]]],
    // Attention
    ["see Figure 1. The encoder", [["figure", "1", "Figure 1"]]],
    ["described in Section 3.2.2.", [["section", "3.2.2", "Section 3.2.2"]]],
    ["using Equation 3, and", [["equation", "3", "Equation 3"]]],
    ["from Eq. (3) we", [["equation", "3", "Eq. (3)"]]],
    ["as in §4 above", [["section", "4", "§4"]]],
  ])("finds %j", (text, expected) => {
    expect(spans(text)).toEqual(expected);
  });

  it("finds each number of a citation marker as its own reference", () => {
    expect(spans("recognition tasks [8, 12, 7] have")).toEqual([
      ["citation", "8", "8"], ["citation", "12", "12"], ["citation", "7", "7"],
    ]);
    expect(spans("backpropagation [22].")).toEqual([["citation", "22", "22"]]);
  });

  it("returns them in the order of the text", () => {
    expect(findReferences("Table 1 [3] and Fig. 2").map((r) => r.kind)).toEqual(["table", "citation", "figure"]);
  });

  it("leaves alone what only looks like one", () => {
    expect(spans("a bare (3) is not an equation")).toEqual([]);
    expect(spans("the figure 2 lower case, a table of 3")).toEqual([]);
    expect(spans("an interval [0, 1] of reals")).toEqual([["citation", "0", "0"], ["citation", "1", "1"]]);   // matched later, or left plain
    expect(spans("range [a, b]")).toEqual([]);
  });
});

// A slice of ResNet's source.json: real labels, numbers and bibliography lines.
const page = (index: number) => ({ index, width: 612, height: 792, rotation: 0 });
const figure = (id: string, kind: "figure" | "table", label: string, pageNo: number): Figure => ({
  id, kind, label, caption: `${label}. A caption.`, caption_rect: { page: pageNo, rect: [50, 300, 545, 320] },
  rect: { page: pageNo, rect: [50, 70, 545, 295] }, confidence: "region",
});
const section = (id: string, number: string | null, title: string): Section => ({
  id, number, depth: number ? number.split(".").length : 1, title, heading_rect: { page: 2, rect: [50, 562, 214, 572] }, extent: [],
  text: "We adopt residual learning.",
});
const resnet: Source = {
  schema: 1, paper_id: "resnet", pages: [0, 1, 2, 3, 4, 5, 6, 7, 8].map(page),
  figures: [figure("fig-1", "figure", "Figure 1", 0), figure("fig-2", "figure", "Figure 3", 3), figure("tab-1", "table", "Table 1", 4)],
  sections: [section("sec-2", "1", "1. Introduction"), section("sec-6", "3.1", "3.1. Residual Learning"), section("sec-13", null, "References")],
  regions: [
    { page: 2, rect: [123, 626, 287, 637], label: "formula" },
    { page: 2, rect: [375, 264, 546, 275], label: "formula" },
    { page: 2, rect: [60, 100, 300, 120], label: "text" },
    { page: 5, rect: [60, 100, 300, 120], label: "formula" },
  ],
  page_text: [
    { page: 0, text: "descent (SGD) with backpropagation [22]. See [16], which enable networks\n[16], which enable networks with tens of layers" },
    { page: 2, text: "y = F(x, {Wi}) + x.\n(1)\nHere x and y\ny = F(x, {Wi}) + Wsx.\n(2)" },
    { page: 8, text: "References\n[21] Y. LeCun, B. Boser. Handwritten digit\nrecognition. In NIPS, 1989.\n[22] Y. LeCun, B. Boser, J. S. Denker, D. Henderson, R. E. Howard,\nW. Hubbard, and L. D. Jackel. Backpropagation applied to hand-\nwritten zip code recognition. Neural computation, 1989.\n[23] Y. LeCun, L. Bottou." },
  ],
};
const ref = (kind: Reference["kind"], key: string): Reference => ({ kind, key, start: 0, end: 1 });

describe("resolveReference (D26): a reference matched to the paper's own thing, or null", () => {
  it("matches a figure or table by its label", () => {
    expect(resolveReference(ref("figure", "3"), resnet)).toEqual({ kind: "figure", figure: resnet.figures[1] });
    expect(resolveReference(ref("table", "1"), resnet)).toEqual({ kind: "figure", figure: resnet.figures[2] });
    expect(resolveReference(ref("figure", "2"), resnet)).toBeNull();   // ResNet's Figure 2 was not found by the extractor
    expect(resolveReference(ref("table", "3"), resnet)).toBeNull();
  });
  it("matches a section by its number", () => {
    expect(resolveReference(ref("section", "3.1"), resnet)).toEqual({ kind: "section", section: resnet.sections[1] });
    expect(resolveReference(ref("section", "9"), resnet)).toBeNull();
  });
  it("matches an equation to the formula regions on the pages that print its number", () => {
    expect(resolveReference(ref("equation", "2"), resnet)).toEqual({ kind: "equation", key: "2", regions: resnet.regions.slice(0, 2) });
    expect(resolveReference(ref("equation", "7"), resnet)).toBeNull();
  });
  it("matches a citation to its bibliography entry, trimmed to that one entry", () => {
    expect(resolveReference(ref("citation", "22"), resnet)).toEqual({
      kind: "citation", page: 8,
      entry: "[22] Y. LeCun, B. Boser, J. S. Denker, D. Henderson, R. E. Howard, W. Hubbard, and L. D. Jackel. Backpropagation applied to hand-written zip code recognition. Neural computation, 1989.",
    });
  });
  it("does not take a line of running text that starts with a marker for the entry", () => {
    expect(resolveReference(ref("citation", "16"), resnet)).toBeNull();
    expect(resolveReference(ref("citation", "40"), resnet)).toBeNull();
  });
});

describe("formulaNumbered: whether a formula region's own words carry the equation's number", () => {
  it.each([
    ["y = F(x, {Wi}) + x. (1)", "1", true],
    ["ntion(Q, K, V ) = softmax(QKT √dk )V (1)", "1", true],
    ["� t � i=1 βp(t−i) 2 · |gi|p �1/p (9) � �", "9", true],
    ["y = F(x, {Wi}) + x. (1)", "11", false],
    ["R(T) = T � t=1 [ft(θt) −ft(θ∗)] (5)", "1", false],
  ])("%s carries (%s): %s", (text, key, expected) => {
    expect(formulaNumbered(text, key)).toBe(expected);
  });
});
