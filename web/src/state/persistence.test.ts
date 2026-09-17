import { describe, expect, it, vi } from "vitest";
import { createPersistence } from "./persistence";
import { emptyBoard, type Board } from "../model/types";

describe("createPersistence", () => {
  it("saves once after the delay with the latest board and the current version", async () => {
    vi.useFakeTimers();
    const save = vi.fn(async (_board: Board, _version: number) => ({ version: 2 }));
    const saved: number[] = [];
    const p = createPersistence({ save, reload: async () => emptyBoard("p"), onConflict: () => {}, onSaved: (v) => saved.push(v), delayMs: 500 });
    p.schedule({ ...emptyBoard("p"), version: 1, goal: "a" });
    p.schedule({ ...emptyBoard("p"), version: 1, goal: "b" });
    await vi.advanceTimersByTimeAsync(499);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0].goal).toBe("b");
    expect(save.mock.calls[0][1]).toBe(1);
    expect(saved).toEqual([2]);
    vi.useRealTimers();
  });

  it("on conflict reloads, reports, and does not retry the stale board", async () => {
    vi.useFakeTimers();
    const fresh = { ...emptyBoard("p"), version: 9, goal: "theirs" };
    const save = vi.fn(async () => ({ conflict: true as const, current: 9 }));
    const reload = vi.fn(async () => fresh);
    const onConflict = vi.fn();
    const onReload = vi.fn();
    const p = createPersistence({ save, reload, onConflict, onReload, onSaved: () => {}, delayMs: 10 });
    p.schedule({ ...emptyBoard("p"), version: 1, goal: "mine" });
    await vi.advanceTimersByTimeAsync(20);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(onReload).toHaveBeenCalledWith(fresh);
    expect(onConflict).toHaveBeenCalledWith(expect.stringContaining("another"));
    await vi.advanceTimersByTimeAsync(100);
    expect(save).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("flush saves immediately", async () => {
    const save = vi.fn(async () => ({ version: 1 }));
    const p = createPersistence({ save, reload: async () => emptyBoard("p"), onConflict: () => {}, onSaved: () => {}, delayMs: 10_000 });
    p.schedule(emptyBoard("p"));
    await p.flush();
    expect(save).toHaveBeenCalledTimes(1);
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

type SaveResult = { version: number } | { conflict: true; current: number };

describe("createPersistence, ruling 7", () => {
  it("(a) a change made while a save is in flight is saved with the version that save returned", async () => {
    vi.useFakeTimers();
    const first = deferred<SaveResult>();
    const save = vi.fn((_board: Board, _version: number) => (save.mock.calls.length === 1 ? first.promise : Promise.resolve({ version: 3 })));
    const onConflict = vi.fn();
    const p = createPersistence({ save, reload: async () => emptyBoard("p"), onConflict, onSaved: () => {}, delayMs: 500 });
    p.schedule({ ...emptyBoard("p"), version: 1, goal: "a" });
    await vi.advanceTimersByTimeAsync(501);
    p.schedule({ ...emptyBoard("p"), version: 1, goal: "b" });   // the reader's board has not seen "saved" yet
    first.resolve({ version: 2 });
    await vi.advanceTimersByTimeAsync(501);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1][0].goal).toBe("b");
    expect(save.mock.calls[1][1]).toBe(2);
    expect(onConflict).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("(b) a debounce that fires during an in-flight save waits for it: never two PUTs at once", async () => {
    vi.useFakeTimers();
    const first = deferred<SaveResult>();
    let concurrent = 0;
    let maxConcurrent = 0;
    const save = vi.fn(async (_board: Board, _version: number) => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      const result = save.mock.calls.length === 1 ? await first.promise : { version: 3 };
      concurrent--;
      return result;
    });
    const p = createPersistence({ save, reload: async () => emptyBoard("p"), onConflict: () => {}, onSaved: () => {}, delayMs: 500 });
    p.schedule({ ...emptyBoard("p"), version: 1, goal: "a" });
    await vi.advanceTimersByTimeAsync(501);
    p.schedule({ ...emptyBoard("p"), version: 1, goal: "b" });
    await vi.advanceTimersByTimeAsync(501);
    expect(save).toHaveBeenCalledTimes(1);
    first.resolve({ version: 2 });
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1][0].goal).toBe("b");
    expect(maxConcurrent).toBe(1);
    vi.useRealTimers();
  });

  it("(c) onSaved reports the revision of the snapshot that was saved", async () => {
    vi.useFakeTimers();
    const save = vi.fn(async (_board: Board, _version: number) => ({ version: 2 }));
    const saved: [number, number | undefined][] = [];
    const p = createPersistence({ save, reload: async () => emptyBoard("p"), onConflict: () => {}, onSaved: (v, r) => saved.push([v, r]), delayMs: 500 });
    p.schedule({ ...emptyBoard("p"), version: 1 }, 7);
    await vi.advanceTimersByTimeAsync(501);
    expect(saved).toEqual([[2, 7]]);
    vi.useRealTimers();
  });

  it("(a) a change made while a conflict reload is in flight is not written over the reloaded board", async () => {
    vi.useFakeTimers();
    const reloading = deferred<Board>();
    const fresh = { ...emptyBoard("p"), version: 9, goal: "theirs" };
    const save = vi.fn(async (_board: Board, _version: number): Promise<SaveResult> => ({ conflict: true, current: 9 }));
    const onReload = vi.fn();
    const p = createPersistence({ save, reload: () => reloading.promise, onConflict: () => {}, onReload, onSaved: () => {}, delayMs: 500 });
    p.schedule({ ...emptyBoard("p"), version: 1, goal: "mine" });
    await vi.advanceTimersByTimeAsync(501);                          // save sent, 409 back, reload in flight
    p.schedule({ ...emptyBoard("p"), version: 1, goal: "mine, later" });
    await vi.advanceTimersByTimeAsync(501);
    reloading.resolve(fresh);
    await vi.advanceTimersByTimeAsync(1000);
    expect(onReload).toHaveBeenCalledWith(fresh);
    expect(save).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
