import { describe, expect, it } from "vitest";
import { paintMarks, paperWords, reflow } from "./marks";
import type { Highlight } from "../model/types";

const mark = (id: string, exact: string): Highlight =>
  ({ id, tags: [], anchor: { rects: [{ page: 0, rect: [0, 0, 1, 1] }], quote: { exact, prefix: "", suffix: "" }, position: 0, state: "anchored" } });
const none = new Set<string>();

describe("paintMarks", () => {
  it("wraps each quote where it occurs, ignoring whitespace differences", () => {
    const text = "Let us consider H(x) as an\nunderlying mapping to be fit.";
    const runs = paintMarks(text, [mark("h-1", "consider H(x) as an underlying")], none);
    expect(runs.map((r) => r.highlightId)).toEqual([null, "h-1", null]);
    expect(runs[1].text).toBe("consider H(x) as an\nunderlying");
  });
  it("leaves the text whole when a quote is not found", () => {
    const runs = paintMarks("plain text", [mark("h-1", "absent")], none);
    expect(runs).toEqual([{ text: "plain text", highlightId: null }]);
  });
  it("handles two marks in order", () => {
    const runs = paintMarks("one two three four", [mark("h-b", "four"), mark("h-a", "two")], none);
    expect(runs.map((r) => r.highlightId)).toEqual([null, "h-a", null, "h-b"]);
  });
});


it("uses context to paint both occurrences of a repeated phrase", () => {
  const first = mark("h-first", "claim");
  first.anchor.quote = {exact: "claim", prefix: "First ", suffix: ". Second claim."};
  const second = mark("h-second", "claim");
  second.anchor.quote = {exact: "claim", prefix: "First claim. Second ", suffix: "."};
  const runs = paintMarks("First claim. Second claim.", [second, first], none);
  expect(runs.filter(r => r.highlightId).map(r => r.highlightId)).toEqual(["h-first", "h-second"]);
});

it("does not guess between indistinguishable occurrences", () => {
  expect(paintMarks("claim and claim", [mark("h-1", "claim")], none)).toEqual([{text: "claim and claim", highlightId: null}]);
});

describe("reflow", () => {
  it("joins a hyphenated line end when the paper spells the joined word elsewhere, and turns single breaks into spaces", () => {
    const words = paperWords([{ text: "Learning algorithms is hard." }]);
    expect(reflow("learning algo-\nrithms and their\nhyperparameters.", words)).toBe("learning algorithms and their hyperparameters.");
  });
  it("keeps a real hyphen at a line end and drops only the break", () => {
    const words = paperWords([{ text: "a state-of-the-\nart result, and the art of it" }]);
    expect(reflow("a state-of-the-\nart result", words)).toBe("a state-of-the-art result");
  });
  it("keeps the hyphen before a capital or a digit unless the joined word is known", () => {
    expect(reflow("T-\nSNE and 3-\n4 steps", none)).toBe("T-SNE and 3-4 steps");
  });
  it("keeps a blank line as a paragraph break and collapses runs of spaces", () => {
    expect(reflow("one  two\n\nthree\nfour", none)).toBe("one two\n\nthree four");
  });
});

describe("paperWords", () => {
  it("collects the paper's words in lower case, leaving a word split at a line end in its two halves", () => {
    const words = paperWords([{ text: "Deep Resid-\nual nets" }, { text: "state-of-the-art 2x" }]);
    expect([...words].sort()).toEqual(["2x", "art", "deep", "nets", "of", "resid", "state", "the", "ual"]);
  });
});

it("paints a quote that spans a hyphenated line end after reflow", () => {
  const words = paperWords([{ text: "a function" }]);
  const text = reflow("We find that reward func-\ntion overfitting is common.", words);
  const runs = paintMarks(text, [mark("h-1", "reward func-\ntion overfitting")], words);
  expect(runs.map((r) => r.highlightId)).toEqual([null, "h-1", null]);
  expect(runs[1].text).toBe("reward function overfitting");
});
