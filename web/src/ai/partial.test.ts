import { describe, expect, it } from "vitest";
import { partialExplanation, partialField } from "./partial";

describe("partialField", () => {
  it("reads any string field so far, as Ask's answer", () => {
    expect(partialField('{"answer": "Depth he', "answer")).toBe("Depth he");
    expect(partialField('{"answer": "x", "notes', "notes")).toBe("");
  });
});

describe("partialExplanation", () => {
  it("reads the explanation so far out of unfinished JSON", () => {
    expect(partialExplanation('{"explanation": "A layer that re')).toBe("A layer that re");
  });
  it("unescapes, and drops a dangling backslash", () => {
    expect(partialExplanation('{"explanation": "a \\"b\\" c\\')).toBe('a "b" c');
  });
  it("is empty before the field starts", () => {
    expect(partialExplanation('{"expl')).toBe("");
  });
});
