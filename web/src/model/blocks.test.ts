import { describe, expect, it } from "vitest";
import { blocksText } from "./blocks";
import type { Block } from "./types";

const text = (t: string): Block => ({ kind: "text", page: 0, rect: [0, 0, 1, 1], text: t });
const clip: Block = { kind: "clip", page: 0, rect: [0, 0, 1, 1], label: "formula" };

describe("blocksText", () => {
  it("joins the text blocks in order and skips clips", () => {
    expect(blocksText([text("one\ntwo\n"), clip, text("three\n")])).toBe("one\ntwo\n\nthree\n");
  });
  it("is empty for no blocks", () => {
    expect(blocksText([])).toBe("");
  });
});
