import { describe, expect, it } from "vitest";
import { paintMarks, reflow } from "./marks";
import type { Highlight } from "../model/types";

const mark = (id: string, exact: string): Highlight =>
  ({ id, tags: [], note: null, anchor: { page: 0, rect: [0, 0, 1, 1], quote: { exact, prefix: "", suffix: "" }, position: 0, state: "anchored" } });

describe("paintMarks", () => {
  it("wraps each quote where it occurs, ignoring whitespace differences", () => {
    const text = "Let us consider H(x) as an\nunderlying mapping to be fit.";
    const runs = paintMarks(text, [mark("h-1", "consider H(x) as an underlying")]);
    expect(runs.map((r) => r.highlightId)).toEqual([null, "h-1", null]);
    expect(runs[1].text).toBe("consider H(x) as an\nunderlying");
  });
  it("leaves the text whole when a quote is not found", () => {
    const runs = paintMarks("plain text", [mark("h-1", "absent")]);
    expect(runs).toEqual([{ text: "plain text", highlightId: null }]);
  });
  it("handles two marks in order", () => {
    const runs = paintMarks("one two three four", [mark("h-b", "four"), mark("h-a", "two")]);
    expect(runs.map((r) => r.highlightId)).toEqual([null, "h-a", null, "h-b"]);
  });
});


it("uses context to paint both occurrences of a repeated phrase", () => {
  const first = mark("h-first", "claim");
  first.anchor.quote = {exact: "claim", prefix: "First ", suffix: ". Second claim."};
  const second = mark("h-second", "claim");
  second.anchor.quote = {exact: "claim", prefix: "First claim. Second ", suffix: "."};
  const runs = paintMarks("First claim. Second claim.", [second, first]);
  expect(runs.filter(r => r.highlightId).map(r => r.highlightId)).toEqual(["h-first", "h-second"]);
});

it("does not guess between indistinguishable occurrences", () => {
  expect(paintMarks("claim and claim", [mark("h-1", "claim")])).toEqual([{text: "claim and claim", highlightId: null}]);
});

describe("reflow", () => {
  it("joins hyphenated line ends and turns single breaks into spaces", () => {
    expect(reflow("learning algo-\nrithms and their\nhyperparameters.")).toBe("learning algorithms and their hyperparameters.");
  });
  it("keeps a blank line as a paragraph break and collapses runs of spaces", () => {
    expect(reflow("one  two\n\nthree\nfour")).toBe("one two\n\nthree four");
  });
  it("joins a hyphen only before a lowercase letter; otherwise the hyphen stays and the break becomes a space", () => {
    expect(reflow("T-\nSNE and 3-\n4 steps")).toBe("T- SNE and 3- 4 steps");
  });
});

it("paints a quote that spans a hyphenated line end after reflow", () => {
  const text = reflow("We find that reward func-\ntion overfitting is common.");
  const runs = paintMarks(text, [mark("h-1", "reward func-\ntion overfitting")]);
  expect(runs.map((r) => r.highlightId)).toEqual([null, "h-1", null]);
  expect(runs[1].text).toBe("reward function overfitting");
});
