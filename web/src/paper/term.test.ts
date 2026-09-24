import { describe, expect, it } from "vitest";
import { emptyBoard, type Board, type Highlight, type NoteNode, type Source, type Tag } from "../model/types";
import { glossary, termCard, termTagIds, TERM_TAG_ID } from "./term";

const tags: Tag[] = [{ id: "t-question", name: "question", colour: "#7C3AED" }, { id: TERM_TAG_ID, name: "term", colour: "#0F766E" }];
const terms = termTagIds(tags);

const mark = (id: string, exact: string, tagIds = [TERM_TAG_ID]): Highlight => ({
  id, tags: tagIds, anchor: { rects: [{ page: 0, rect: [0, 100, 50, 110] }], quote: { exact, prefix: "", suffix: "" }, position: 0, state: "anchored" },
});
const note = (id: string, origin: "reader" | "ai"): NoteNode => ({ id, type: "note", position: { x: 0, y: 0 }, data: { tags: [], collapsed: false, note: `notes/${id}.md`, origin } });
const board = (highlights: Highlight[], notes: NoteNode[] = [], links: [string, string][] = []): Board => ({
  ...emptyBoard("p"), highlights, nodes: notes, edges: links.map(([from, to], i) => ({ id: `e-${i}`, from, to, data: { tags: [] } })),
});
// ResNet's abstract uses "residual nets" first; page 5 defines it with its abbreviation in brackets.
const source: Source = {
  schema: 1, paper_id: "p", pages: [], sections: [], figures: [], regions: [],
  page_text: [
    { page: 0, text: "On the ImageNet dataset we evaluate residual nets with a depth of up to 152 layers." },
    { page: 4, text: "Next we evaluate 18-layer and 34-layer residual nets (ResNets). The baseline architectures are the same." },
  ],
};

describe("termTagIds (D27): which tags mark a term", () => {
  it("is the preset, and a tag of the reader's own named term", () => {
    expect(terms).toEqual(new Set([TERM_TAG_ID]));
    expect(termTagIds([{ id: "t-01ABC", name: " Term ", colour: "#000" }])).toEqual(new Set(["t-01ABC"]));
    expect(termTagIds([{ ...tags[1], name: "jargon" }])).toEqual(new Set([TERM_TAG_ID]));   // renamed, still the preset
  });
});

describe("termCard (D27): the reader's definition first, then the paper's likely one, then look up elsewhere", () => {
  it("puts a note of the reader's own before the paper's definition, and Look up last", () => {
    const h = mark("h-1", "residual nets");
    const parts = termCard(board([h], [note("n-ai", "ai"), note("n-mine", "reader")], [["h-1", "n-ai"], ["n-mine", "h-1"]]), source, h);
    expect(parts.map((p) => p.kind)).toEqual(["note", "definition", "lookup"]);
    expect(parts[0]).toEqual({ kind: "note", noteId: "n-mine" });
    expect(parts[1]).toMatchObject({ kind: "definition", page: 4, sentence: "Next we evaluate 18-layer and 34-layer residual nets (ResNets)." });
  });
  it("leaves out what is not there: no note of the reader's, no sentence that reads like a definition", () => {
    const h = mark("h-2", "baseline architectures");
    expect(termCard(board([h]), source, h).map((p) => p.kind)).toEqual(["lookup"]);
  });
});

describe("glossary (D27): every term mark in the paper, alphabetically, with the reader's definition", () => {
  it("lists term marks only, by term ignoring case, each with its first note of the reader's own", () => {
    const b = board(
      [mark("h-z", "Zero padding"), mark("h-a", "affine"), mark("h-q", "a question", ["t-question"]), mark("h-r", "Residual\nnets")],
      [note("n-1", "reader"), note("n-2", "ai")], [["h-r", "n-1"], ["h-a", "n-2"]],
    );
    expect(glossary(b, terms)).toEqual([
      { highlight: b.highlights[1], term: "affine", noteId: null },
      { highlight: b.highlights[3], term: "Residual nets", noteId: "n-1" },
      { highlight: b.highlights[0], term: "Zero padding", noteId: null },
    ]);
  });
});
