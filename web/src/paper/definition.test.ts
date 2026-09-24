import { describe, expect, it } from "vitest";
import type { Source } from "../model/types";
import { definitionScore, LIKELY_DEFINITION_SCORE, rankFindHits, sentenceAround } from "./definition";
import { findInPaper } from "./find";

/** The sentence around a hit, split at the hit: `before [term] after`. */
const at = (sentence: string, first = false) => {
  const [before, rest] = sentence.split("[");
  const [term, after] = rest.split("]");
  return { before, term, after, first };
};

describe("definitionScore (D25): named rules on the sentence around a hit", () => {
  it.each([
    ["first occurrence", at("Deep [residual learning] eases training.", true)],
    ["we define", at("We define [attention] as a mapping of a query to an output.")],
    ["defined as", at("The [residual mapping] is defined as H(x) - x.")],
    ["denoted by", at("The desired mapping is denoted by [H(x)] below.")],
    ["denoted by", at("The [learning rate] is denoted by alpha.")],
    ["let … be", at("Let [the stacked layers] be a residual function.")],
    ["we call", at("We call our particular attention \"[Scaled Dot-Product Attention]\" (Figure 2).")],
    ["called", at("We apply a technique called [dropout] to each layer.")],
    ["refer to … as", at("We refer to this model as [the base model].")],
    ["abbreviation follows", at("We adopt [batch normalization] (BN) right after each convolution.")],
    ["abbreviation follows", at("We evaluate 18-layer and 34-layer [residual nets] (ResNets).")],
    ["the abbreviation itself", at("We adopt batch normalization ([BN]) right after each convolution.")],
    ["colon follows", at("[Residual learning]: a building block.")],
    ["i.e.", at("A mini-batch of 8 images (i.e., 1 per GPU) for [the RPN step].")],
  ])("%s", (rule, context) => {
    expect(definitionScore(context).rules).toContain(rule);
  });

  it("finds nothing in an ordinary use", () => {
    expect(definitionScore(at("Our [residual nets] are easy to optimize.")).rules).toEqual([]);
    expect(definitionScore(at("Our [residual nets] are easy to optimize.")).score).toBe(0);
  });

  it("a pattern alone makes a likely definition; being first alone, or an i.e. alone, does not", () => {
    expect(definitionScore(at("We adopt [batch normalization] (BN) after each layer.")).score).toBeGreaterThanOrEqual(LIKELY_DEFINITION_SCORE);
    expect(definitionScore(at("Deep [residual learning] eases training.", true)).score).toBeLessThan(LIKELY_DEFINITION_SCORE);
    expect(definitionScore(at("The step (i.e., [option A]) is used.")).score).toBeLessThan(LIKELY_DEFINITION_SCORE);
    expect(definitionScore(at("The step (i.e., [option A]) is used.", true)).score).toBeGreaterThanOrEqual(LIKELY_DEFINITION_SCORE);
  });

  it("catches a term named again after it: X, sometimes called Y (D27)", () => {
    expect(definitionScore(at("[Adam], sometimes called adaptive moment estimation, is simple.")).rules).toContain("called");
    expect(definitionScore(at("The [shortcut], also known as a skip connection, adds x.")).rules).toContain("called");
    expect(definitionScore(at("The [shortcut] we called it earlier is used.")).rules).not.toContain("called");
  });

  it("does not take a title in capitals after a colon for a definition (D27)", () => {
    expect(definitionScore(at("[ADAM]: A METHOD FOR STOCHASTIC OPTIMIZATION")).rules).not.toContain("colon follows");
    expect(definitionScore(at("[Adam]: a method for stochastic optimization.")).rules).toContain("colon follows");
  });

  it("a parenthesis that is not an abbreviation is not one", () => {
    expect(definitionScore(at("We use [residual nets] (see Fig. 2) here.")).rules).not.toContain("abbreviation follows");
  });
});

describe("sentenceAround", () => {
  const text = "Deep nets are hard. We adopt batch\nnormalization (BN) right after each convolution, i.e. before activation. Next we train.";
  it("is the hit's own sentence, split at the hit, whitespace made single", () => {
    const start = text.indexOf("batch");
    const end = text.indexOf("(BN)") - 1;
    expect(sentenceAround(text, start, end)).toEqual({ before: "We adopt ", after: " (BN) right after each convolution, i.e. before activation." });
  });
  it("does not end a sentence at an abbreviation followed by a lower-case word or a number", () => {
    const s = "As in Fig. 2 the output, i.e. the sum, is used by the block. Next.";
    const start = s.indexOf("the block");
    expect(sentenceAround(s, start, start + "the block".length).before).toBe("As in Fig. 2 the output, i.e. the sum, is used by ");
  });
});

const source = {
  page_text: [
    { page: 0, text: "Our residual nets are deep. Residual nets are easy." },
    { page: 1, text: "We evaluate 18-layer residual nets (ResNets). Plain nets are not residual nets." },
  ],
  sections: [],
} as unknown as Source;

describe("rankFindHits (D25)", () => {
  it("lists likely definitions first and badges them; the rest stay in paper order", () => {
    const ranked = rankFindHits(findInPaper("residual nets", source), source);
    const on = (page: number, words: string) => [page, source.page_text[page].text.indexOf(words)];
    expect(ranked.map((r) => [r.hit.page, r.hit.start, r.likely])).toEqual([
      [...on(1, "residual nets (ResNets)"), true], [...on(0, "residual nets are deep"), false],
      [...on(0, "Residual nets are easy"), false], [...on(1, "residual nets."), false],
    ]);
    expect(ranked[0].rules).toContain("abbreviation follows");
  });
  it("keeps paper order when nothing looks like a definition", () => {
    const ranked = rankFindHits(findInPaper("plain nets", source), source);
    expect(ranked.map((r) => r.likely)).toEqual([false]);
  });
});
