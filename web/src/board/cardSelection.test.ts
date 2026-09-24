import { afterEach, describe, expect, it } from "vitest";
import { QUOTE_CONTEXT, quoteAround, readCardSelection } from "./cardSelection";

const texts = ["We adopt residual learning to every few stacked layers.", "Here x and y are the input and output vectors."];

describe("quoteAround (addendum 4.10)", () => {
  it("quotes the words selected in one block, with the card's text either side", () => {
    expect(quoteAround(texts, { para: 0, offset: 9 }, { para: 0, offset: 26 })).toEqual({
      exact: "residual learning", prefix: "We adopt ", suffix: " to every few stacked layers.\nHe",
    });
  });
  it("joins blocks with a line break, so a selection across a displayed equation keeps both sides (Review Focus 2)", () => {
    const quote = quoteAround(texts, { para: 0, offset: 30 }, { para: 1, offset: 10 })!;
    expect(quote.exact).toBe("every few stacked layers.\nHere x and");
  });
  it("trims whitespace at either end and cuts the context to QUOTE_CONTEXT characters", () => {
    const quote = quoteAround(texts, { para: 0, offset: 39 }, { para: 1, offset: 0 })!;
    expect(quote.exact).toBe("stacked layers.");
    expect(quote.prefix).toHaveLength(QUOTE_CONTEXT);
  });
  it("is null when only whitespace is selected", () => {
    expect(quoteAround(texts, { para: 0, offset: 55 }, { para: 1, offset: 0 })).toBeNull();
  });
});

describe("readCardSelection", () => {
  afterEach(() => { document.body.innerHTML = ""; window.getSelection()?.removeAllRanges(); });

  const card = (id: string) => `<div class="react-flow__node" data-id="${id}"><div class="node-body">
    <p class="block-text"><span>We adopt </span><mark>residual</mark><span> learning.</span></p>
    <img class="block-clip">
    <p class="block-text"><span>Here x and y.</span></p></div></div>`;
  const select = (from: Node, fromOffset: number, to: Node, toOffset: number) => {
    const range = document.createRange();
    range.setStart(from, fromOffset);
    range.setEnd(to, toOffset);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
  };

  it("reads the card and the words from a selection that crosses a mark and a clip", () => {
    document.body.innerHTML = `<div id="board">${card("n-1")}</div>`;
    const [first, second] = Array.from(document.querySelectorAll("p.block-text"));
    select(first.querySelector("mark")!.firstChild!, 0, second.querySelector("span")!.firstChild!, 4);
    const read = readCardSelection(document.getElementById("board")!)!;
    expect(read.nodeId).toBe("n-1");
    expect(read.quote).toEqual({ exact: "residual learning.\nHere", prefix: "We adopt ", suffix: " x and y." });
  });

  it("is null for a selection that runs from one card into another", () => {
    document.body.innerHTML = `<div id="board">${card("n-1")}${card("n-2")}</div>`;
    const paras = document.querySelectorAll("p.block-text span");
    select(paras[0].firstChild!, 0, paras[3].firstChild!, 3);
    expect(readCardSelection(document.getElementById("board")!)).toBeNull();
  });

  it("is null when nothing is selected", () => {
    document.body.innerHTML = `<div id="board">${card("n-1")}</div>`;
    expect(readCardSelection(document.getElementById("board")!)).toBeNull();
  });
});
