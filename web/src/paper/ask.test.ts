import { describe, expect, it } from "vitest";
import { ASK_PROMPT, buildAskPrompt, buildJargonPrompt, JARGON_PROMPT, sentenceAround } from "./ask";

describe("Ask elsewhere (D14)", () => {
  it("finds the sentence around the marked words, ignoring line breaks", () => {
    const page = "We stack layers. The residual\nfunction is learned instead. Then we test.";
    expect(sentenceAround(page, "residual function")).toBe("The residual function is learned instead.");
  });
  it("takes the sentence of the marked occurrence, not the first, using the quote's prefix and suffix", () => {
    const page = "We use attention. We define\nattention here. Then more.";
    const quote = { exact: "attention", prefix: "We define\n", suffix: " here. Th" };
    expect(sentenceAround(page, quote.exact, quote)).toBe("We define attention here.");
    expect(sentenceAround(page, quote.exact, { prefix: "not on this page ", suffix: " here. Th" })).toBe("We define attention here.");
  });
  it("falls back to the words themselves when they are not in the page text", () => {
    expect(sentenceAround("Nothing here.", "missing words")).toBe("missing words");
  });
  it("fills the four slots, and leaves the goal line out when there is no goal", () => {
    const prompt = buildAskPrompt({ marked: "scaled dot-product", sentence: "We call it scaled dot-product attention.", section: "3.2.1 ...", goal: "" });
    expect(prompt).toContain('"scaled dot-product"');
    expect(prompt).toContain("We call it scaled dot-product attention.");
    expect(prompt).toContain("3.2.1 ...");
    expect(prompt).not.toContain("{goal}");
    expect(buildAskPrompt({ marked: "m", sentence: "s", section: "t", goal: "learn attention" })).toContain("learn attention");
  });
  it("inserts text literally, even text that looks like a replacement pattern", () => {
    expect(buildAskPrompt({ marked: "cost $1 and $&", sentence: "s", section: "t", goal: "" })).toContain('"cost $1 and $&"');
  });
  it("never fills a slot inside text already inserted", () => {
    const prompt = buildAskPrompt({ marked: "see {sentence}", sentence: "the sentence", section: "t", goal: "" });
    expect(prompt).toContain('"see {sentence}"');
    expect(prompt).toContain('"the sentence"');
  });
  it("is one named constant with the four slots", () => {
    for (const slot of ["{marked}", "{sentence}", "{section}", "{goal}"]) expect(ASK_PROMPT).toContain(slot);
  });
});

describe("Look up elsewhere, for a term (D27)", () => {
  it("is the owner's jargon prompt, word for word", () => {
    expect(JARGON_PROMPT).toBe("Explain the term '{term}' as used in this sentence: '{sentence}'. Assume I am a student new to this field. "
      + "Keep it short, and give a source I can check.");
  });
  it("fills the term and its sentence, flattening the term's line breaks and keeping a $ as written", () => {
    expect(buildJargonPrompt({ term: "residual\nmapping", sentence: "Costs $5 {sentence}." })).toBe(
      "Explain the term 'residual mapping' as used in this sentence: 'Costs $5 {sentence}.'. Assume I am a student new to this field. "
      + "Keep it short, and give a source I can check.");
  });
});
