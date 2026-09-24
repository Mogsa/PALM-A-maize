import { describe, expect, it } from "vitest";
import type { Source } from "../model/types";
import { findInPaper, markMatches, nthOnPage } from "./find";

const source = {
  page_text: [
    { page: 0, text: "Deep residual\nlearning eases training. Residual learning works." },
    { page: 1, text: "Nothing to see." },
  ],
  sections: [
    { id: "sec-1", number: "1", depth: 1, title: "Intro", heading_rect: { page: 0, rect: [0, 0, 1, 1] }, extent: [], text: "Deep residual learning eases training." },
    { id: "sec-2", number: "2", depth: 1, title: "More", heading_rect: { page: 0, rect: [0, 0, 1, 1] }, extent: [], text: "Residual learning works." },
  ],
} as unknown as Source;

describe("find in paper (D13)", () => {
  it("finds every place, ignoring case and line breaks, with a few words either side and its section", () => {
    const hits = findInPaper("residual learning", source);
    expect(hits.map((h) => [h.page, h.match, h.section?.id])).toEqual([[0, "residual learning", "sec-1"], [0, "Residual learning", "sec-2"]]);
    expect(hits[0].before).toBe("Deep");
    expect(hits[0].after).toBe("eases training. Residual learning");
  });
  it("knows which of its page's hits a hit is, so a pick goes to that one", () => {
    const hits = findInPaper("residual learning", source);
    expect(hits.map((h) => nthOnPage(hits, h))).toEqual([0, 1]);
  });
  it("finds nothing for an empty query", () => {
    expect(findInPaper("   ", source)).toEqual([]);
  });
  it("marks matches in a text-layer string, escaping the paper's own text", () => {
    expect(markMatches("a <b> Residual x", "residual")).toBe('a &lt;b&gt; <mark class="find-hit">Residual</mark> x');
  });
});
