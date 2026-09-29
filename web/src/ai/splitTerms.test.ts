import { describe, expect, it } from "vitest";
import { splitTerms } from "./splitTerms";

describe("splitTerms", () => {
  it("cuts whole words, any case, longest term first", () => {
    expect(splitTerms("A Residual block, not residuals.", ["residual", "residual block"])).toEqual([
      { text: "A ", term: null }, { text: "Residual block", term: "residual block" }, { text: ", not residuals.", term: null },
    ]);
  });
  it("leaves text alone with no terms", () => {
    expect(splitTerms("plain", [])).toEqual([{ text: "plain", term: null }]);
  });
});
