import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createNoteStore } from "./notes";
import { SAVE_DELAY_MS } from "./persistence";
import type { NoteFile } from "../model/types";

const file = (markdown: string, has_sketch = false): NoteFile => ({ markdown, has_sketch });

describe("the note store", () => {
  it("loads a note once and shares it", async () => {
    const get = vi.fn(async () => file("text"));
    const store = createNoteStore({ get, put: vi.fn() });
    await Promise.all([store.load("n-1"), store.load("n-1")]);
    expect(get).toHaveBeenCalledTimes(1);
    expect(store.peek("n-1")).toBe("text");
  });
  it("save shows the new text at once and tells subscribers", async () => {
    const store = createNoteStore({ get: vi.fn(), put: vi.fn(async () => undefined) });
    const listener = vi.fn();
    store.subscribe(listener);
    const saving = store.save("n-1", "mine");
    expect(store.peek("n-1")).toBe("mine");
    expect(listener).toHaveBeenCalled();
    await saving;
  });
  it("a failed write rejects for its caller but does not stop the next; settled waits for both", async () => {
    const put = vi.fn().mockRejectedValueOnce(new Error("down")).mockResolvedValue(undefined);
    const store = createNoteStore({ get: vi.fn(), put });
    await expect(store.save("n-1", "a")).rejects.toThrow("down");
    await store.save("n-1", "b");
    await store.settled();
    expect(put).toHaveBeenNthCalledWith(2, "n-1", "b");
  });
  it("a load that lands after a save keeps the saved text", async () => {
    let answer: (text: string) => void = () => undefined;
    const get = vi.fn(() => new Promise<NoteFile>((resolve) => { answer = (text) => resolve(file(text)); }));
    const store = createNoteStore({ get, put: vi.fn(async () => undefined) });
    const loading = store.load("n-1");
    await store.save("n-1", "typed");
    answer("old");
    expect(await loading).toBe("typed");
    expect(store.peek("n-1")).toBe("typed");
  });
  it("settled tries a failed write again, and rejects while it still fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const put = vi.fn().mockRejectedValueOnce(new Error("down")).mockRejectedValueOnce(new Error("down")).mockResolvedValue(undefined);
    const store = createNoteStore({ get: vi.fn(), put });
    await expect(store.save("n-1", "a")).rejects.toThrow("down");
    await expect(store.settled()).rejects.toThrow();
    await store.settled();
    expect(put).toHaveBeenCalledTimes(3);
    expect(put).toHaveBeenLastCalledWith("n-1", "a");
    expect(store.hasUnsaved()).toBe(false);
  });
  it("a failed load can be tried again", async () => {
    const get = vi.fn().mockRejectedValueOnce(new Error("down")).mockResolvedValue(file("ok"));
    const store = createNoteStore({ get, put: vi.fn() });
    await expect(store.load("n-1")).rejects.toThrow("down");
    expect(await store.load("n-1")).toBe("ok");
  });
});

describe("the note store, while typing (I1)", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });
  /** A put that lands only when `land` is called. */
  function heldPut() {
    const held: Array<() => void> = [];
    const put = vi.fn(() => new Promise<void>((resolve) => { held.push(resolve); }));
    return { put, land: () => held.shift()?.() };
  }

  it("nothing is unsaved in a store only read from", async () => {
    const store = createNoteStore({ get: vi.fn(async () => file("text")), put: vi.fn() });
    await store.load("n-1");
    expect(store.hasUnsaved()).toBe(false);
  });
  it("a keystroke shows at once, is unsaved, and is written once, SAVE_DELAY_MS after the last one", async () => {
    const put = vi.fn(async () => undefined);
    const store = createNoteStore({ get: vi.fn(), put });
    store.edit("n-1", "a");
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS - 1);
    store.edit("n-1", "ab");
    expect(store.peek("n-1")).toBe("ab");
    expect(store.hasUnsaved()).toBe(true);
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS - 1);
    expect(put).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(put).toHaveBeenCalledTimes(1);
    expect(put).toHaveBeenCalledWith("n-1", "ab");
    expect(store.hasUnsaved()).toBe(false);
  });
  it("a write in flight is unsaved until it lands", async () => {
    const { put, land } = heldPut();
    const store = createNoteStore({ get: vi.fn(), put });
    store.edit("n-1", "a");
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    expect(put).toHaveBeenCalledTimes(1);
    expect(store.hasUnsaved()).toBe(true);
    land();
    await vi.advanceTimersByTimeAsync(0);
    expect(store.hasUnsaved()).toBe(false);
  });
  it("commit writes a note's pending edit now, once", async () => {
    const put = vi.fn(async () => undefined);
    const store = createNoteStore({ get: vi.fn(), put });
    store.edit("n-1", "typed");
    await store.commit("n-1");
    expect(put).toHaveBeenCalledWith("n-1", "typed");
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    expect(put).toHaveBeenCalledTimes(1);
    await store.commit("n-1");   // nothing pending: nothing written
    expect(put).toHaveBeenCalledTimes(1);
  });
  it("flush writes every pending edit now, and settled does too before it waits", async () => {
    const put = vi.fn(async () => undefined);
    const store = createNoteStore({ get: vi.fn(), put });
    store.edit("n-1", "one");
    store.edit("n-2", "two");
    await store.flush();
    expect(put.mock.calls).toEqual([["n-1", "one"], ["n-2", "two"]]);
    store.edit("n-1", "three");
    await store.settled();
    expect(put).toHaveBeenLastCalledWith("n-1", "three");
    expect(store.hasUnsaved()).toBe(false);
  });
  it("a failed write stays unsaved and marks the note failed until an edit is written", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const put = vi.fn().mockRejectedValueOnce(new Error("down")).mockResolvedValue(undefined);
    const store = createNoteStore({ get: vi.fn(), put });
    const listener = vi.fn();
    store.subscribe(listener);
    store.edit("n-1", "a");
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    expect(store.failed("n-1")).toBe(true);
    expect(store.hasUnsaved()).toBe(true);
    listener.mockClear();
    store.edit("n-1", "ab");
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    expect(store.failed("n-1")).toBe(false);
    expect(listener).toHaveBeenCalled();
    expect(store.hasUnsaved()).toBe(false);
  });
});

describe("the note store, a note just made", () => {
  it("created: the note is empty at once, with nothing to load and nothing to write", async () => {
    const get = vi.fn(async () => file("never read"));
    const put = vi.fn(async () => undefined);
    const store = createNoteStore({ get, put });
    const listener = vi.fn();
    store.subscribe(listener);
    store.created("n-1");
    expect(store.peek("n-1")).toBe("");
    expect(listener).toHaveBeenCalled();
    expect(await store.load("n-1")).toBe("");
    expect(get).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
    expect(store.hasUnsaved()).toBe(false);
  });
  it("created leaves a note's text already here alone", async () => {
    const store = createNoteStore({ get: vi.fn(), put: vi.fn(async () => undefined) });
    await store.save("n-1", "written first");
    store.created("n-1");
    expect(store.peek("n-1")).toBe("written first");
  });
});

describe("the note store, sketches (D23)", () => {
  it("a loaded note says whether it has a sketch", async () => {
    const store = createNoteStore({ get: vi.fn(async (id: string) => file("", id === "n-drawn")), put: vi.fn() });
    await Promise.all([store.load("n-drawn"), store.load("n-plain")]);
    expect(store.sketchVersion("n-drawn")).toBeGreaterThan(0);
    expect(store.sketchVersion("n-plain")).toBe(0);
  });
  it("every saved sketch has a new version, so its image is fetched again; a removed one has none", async () => {
    const store = createNoteStore({ get: vi.fn(async () => file("", true)), put: vi.fn() });
    await store.load("n-1");
    const listener = vi.fn();
    store.subscribe(listener);
    const first = store.sketchVersion("n-1");
    store.sketchSaved("n-1", true);
    const second = store.sketchVersion("n-1");
    expect(second).toBeGreaterThan(first);
    expect(listener).toHaveBeenCalled();
    store.sketchSaved("n-1", false);
    expect(store.sketchVersion("n-1")).toBe(0);
    store.sketchSaved("n-1", true);
    expect(store.sketchVersion("n-1")).toBeGreaterThan(second);
  });
  it("a load that lands after a sketch was saved or removed keeps what the reader did", async () => {
    let answer: (f: NoteFile) => void = () => undefined;
    const store = createNoteStore({ get: vi.fn(() => new Promise<NoteFile>((resolve) => { answer = resolve; })), put: vi.fn() });
    const loading = store.load("n-1");
    store.sketchSaved("n-1", false);
    answer(file("old", true));
    await loading;
    expect(store.sketchVersion("n-1")).toBe(0);
  });
});
