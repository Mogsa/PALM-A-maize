import { describe, expect, it } from "vitest";
import { clock, describeEvent } from "./sentences";
import type { ActivityDetail, ActivityEvent, ActivityKind } from "./types";

const ev = (kind: ActivityKind, action: string, detail: ActivityDetail = {}): ActivityEvent => ({ t: "2026-09-30T10:42:03.120Z", kind, action, detail });
const names: Record<string, string> = { "t-a": "Method", "t-b": "Result" };
const say = (e: ActivityEvent) => describeEvent(e, (id) => names[id]);

describe("the Activity panel's sentences", () => {
  it.each([
    [ev("session", "open"), "Opened the paper"],
    [ev("session", "close"), "Left the paper"],
    [ev("build", "highlight", { id: "h-1", text: "the learner drives", tags: [] }), "Highlighted “the learner drives”"],
    [ev("build", "cut", { id: "n-1", text: "We add shortcuts." }), "Cut “We add shortcuts.” onto the board"],
    [ev("build", "note", { id: "n-1", text: "the learner drives", on: null }), "Wrote a note: “the learner drives”"],
    [ev("build", "note", { id: "n-1", text: "", on: null }), "Emptied a note"],
    [ev("build", "connect", { id: "e-1", from: "h-1", to: "n-1", tags: [] }), "Connected two things"],
    [ev("build", "group", { id: "n-G", name: "Method", members: ["n-1", "n-2"] }), "Grouped 2 pieces as “Method”"],
    [ev("build", "group", { id: "n-G", name: null, members: ["n-1"] }), "Grouped 1 piece"],
    [ev("build", "tag", { id: "h-1", tags: ["t-a", "t-b"] }), "Tagged a highlight Method, Result"],
    [ev("build", "tag", { id: "e-1", tags: ["t-gone"] }), "Tagged a connection with a deleted tag"],
    [ev("build", "tag", { id: "n-1", tags: [] }), "Took the tags off a piece"],
    [ev("build", "remove", { ids: ["n-1", "e-1"] }), "Deleted 2 things"],
    [ev("build", "remove", { ids: ["h-1"] }), "Deleted 1 thing"],
    [ev("build", "split", { ids: ["n-1", "n-2"] }), "Split a chunk in two"],
    [ev("build", "split", { ids: ["n-1", "n-2", "n-3"] }), "Split a chunk in 3"],
    [ev("build", "cutout", { ids: ["n-1", "n-2"] }), "Cut out part of a chunk"],
    [ev("build", "join", { ids: ["n-1", "n-2", "n-3"] }), "Joined 3 chunks"],
    [ev("build", "undo"), "Undid a change"],
    [ev("build", "redo"), "Redid a change"],
    [ev("read", "view", { view: "board" }), "Switched to the board"],
    [ev("read", "view", { view: "paper" }), "Switched to the paper"],
    [ev("read", "view", { view: "both" }), "Switched to the paper and board side by side"],
    [ev("read", "page", { page: 4, seconds: 38 }), "Read page 4 for 38 s"],
    [ev("read", "page", { page: 5, seconds: 125 }), "Read page 5 for 2 min 5 s"],
    [ev("read", "page", { page: 5, seconds: 120 }), "Read page 5 for 2 min"],
    [ev("read", "find", { text: "residual" }), "Searched the paper for “residual”"],
    [ev("ai", "on"), "Turned AI help on"],
    [ev("ai", "off"), "Turned AI help off"],
    [ev("ai", "define", { word: "regret" }), "Asked AI to define “regret”"],
    [ev("ai", "key-sentences"), "Opened the key sentences"],
    [ev("ai", "jump", { slot: "Problem", text: "Deep nets degrade." }), "Went to a key sentence: “Deep nets degrade.”"],
    [ev("ai", "keep", { slot: "Problem", text: "Deep nets degrade." }), "Kept a key sentence: “Deep nets degrade.”"],
    [ev("ai", "keep", { slot: null, text: "residual block" }), "Kept the AI term “residual block”"],
    [ev("build", "something-new"), "build: something-new"],
  ])("%j says %s", (event, sentence) => {
    expect(say(event)).toBe(sentence);
  });

  it("shortens long words to fit a line", () => {
    const text = "word ".repeat(40).trim();
    const sentence = say(ev("build", "highlight", { id: "h-1", text, tags: [] }));
    expect(sentence.length).toBeLessThan(100);
    expect(sentence.endsWith("…”")).toBe(true);
  });

  it("never fails on a line with missing fields", () => {
    expect(say(ev("build", "highlight", {}))).toBe("Highlighted “”");
    expect(say(ev("build", "remove", {}))).toBe("Deleted 0 things");
  });

  it("gives the time as HH:MM, local", () => {
    const t = new Date(2026, 8, 30, 9, 5).toISOString();
    expect(clock(t)).toBe("09:05");
  });
});
