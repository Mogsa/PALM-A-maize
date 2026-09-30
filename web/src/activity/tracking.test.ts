import { describe, expect, it } from "vitest";
import { createDwell, createNoteEdits, DWELL_MIN_MS } from "./tracking";

describe("page dwell", () => {
  it("reports the page left, counted from 1, once the paper rested on it for 2 s or more", () => {
    const dwell = createDwell();
    expect(dwell.move(3, 0)).toBeNull();   // starts reading page index 3
    expect(dwell.move(4, 38_400)).toEqual({ page: 4, seconds: 38 });
  });

  it("reports nothing for a page passed in under 2 s", () => {
    const dwell = createDwell();
    dwell.move(0, 0);
    expect(dwell.move(1, DWELL_MIN_MS - 1)).toBeNull();
    expect(dwell.move(2, DWELL_MIN_MS - 1 + DWELL_MIN_MS)).toEqual({ page: 2, seconds: 2 });
  });

  it("keeps counting while the paper stays on the same page", () => {
    const dwell = createDwell();
    dwell.move(0, 0);
    expect(dwell.move(0, 5000)).toBeNull();
    expect(dwell.move(null, 9000)).toEqual({ page: 1, seconds: 9 });
  });

  it("counts nothing while nothing is read (null), and starts again after", () => {
    const dwell = createDwell();
    expect(dwell.move(null, 0)).toBeNull();
    expect(dwell.move(null, 10_000)).toBeNull();
    dwell.move(2, 10_000);
    expect(dwell.move(null, 13_000)).toEqual({ page: 3, seconds: 3 });
  });
});

describe("a note's edit", () => {
  it("is a change only when the text differs from the text the note had before", () => {
    const edits = createNoteEdits();
    edits.seen("n-1", "old");
    expect(edits.ended("n-1", "old")).toBe(false);
    expect(edits.ended("n-1", "new")).toBe(true);
    expect(edits.ended("n-1", "new")).toBe(false);   // the last end is the new baseline
  });

  it("keeps the first text seen: later views of the same note do not move the baseline", () => {
    const edits = createNoteEdits();
    edits.seen("n-1", "");
    edits.seen("n-1", "typed");
    expect(edits.ended("n-1", "typed")).toBe(true);
  });

  it("treats a note never seen as empty before", () => {
    const edits = createNoteEdits();
    expect(edits.ended("n-2", "")).toBe(false);
    expect(edits.ended("n-3", "words")).toBe(true);
  });
});
