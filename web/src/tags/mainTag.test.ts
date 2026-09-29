import { describe, expect, it } from "vitest";
import type { Tag } from "../model/types";
import { addTag, mainTagColour, setMainTag } from "./mainTag";

const byId = new Map<string, Tag>([["t-q", { id: "t-q", name: "question", colour: "#7C3AED" }]]);

describe("the main tag is the first tag (spec A2)", () => {
  it("a colour on an untagged thing makes it the only tag", () => {
    expect(setMainTag([], "t-q")).toEqual(["t-q"]);
  });
  it("a colour replaces the main tag and keeps the extras", () => {
    expect(setMainTag(["t-a", "t-b"], "t-q")).toEqual(["t-q", "t-b"]);
  });
  it("a colour that is already an extra is promoted, never duplicated (Review Focus 2)", () => {
    expect(setMainTag(["t-a", "t-q", "t-b"], "t-q")).toEqual(["t-q", "t-b"]);
  });
  it("the same colour again changes nothing", () => {
    expect(setMainTag(["t-q", "t-b"], "t-q")).toEqual(["t-q", "t-b"]);
  });
  it("plain yellow drops the main tag and keeps the extras", () => {
    expect(setMainTag(["t-a", "t-b"], null)).toEqual(["t-b"]);
  });
  it("Add tag appends, once", () => {
    expect(addTag(["t-a"], "t-b")).toEqual(["t-a", "t-b"]);
    expect(addTag(["t-a"], "t-a")).toEqual(["t-a"]);
  });
  it("the colour is the main tag's, and none for no tag or a deleted tag (Review Focus 1)", () => {
    expect(mainTagColour(["t-q", "t-x"], byId)).toBe("#7C3AED");
    expect(mainTagColour([], byId)).toBeUndefined();
    expect(mainTagColour(["t-gone"], byId)).toBeUndefined();
  });
});
