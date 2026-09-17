import { describe, expect, it } from "vitest";
import { paintMarks } from "./marks";
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
