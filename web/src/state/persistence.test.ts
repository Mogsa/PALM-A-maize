import { describe, expect, it, vi } from "vitest";
import { createPersistence, SAVE_FAILED_MESSAGE } from "./persistence";
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
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
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

describe("createPersistence, fix round 1", () => {
  it("(1) a stale board scheduled after a conflict reload has landed is not saved", async () => {
    vi.useFakeTimers();
    const fresh = { ...emptyBoard("p"), version: 9, goal: "theirs" };
    const save = vi.fn(async (_board: Board, _version: number): Promise<SaveResult> => ({ conflict: true, current: 9 }));
    const p = createPersistence({ save, reload: async () => fresh, onConflict: () => {}, onSaved: () => {}, delayMs: 500 });
    p.schedule({ ...emptyBoard("p"), version: 1, goal: "mine" });
    await vi.advanceTimersByTimeAsync(501);                          // 409, reload resolved
    p.schedule({ ...emptyBoard("p"), version: 1, goal: "mine, from a late effect" });
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("(2) a failed save reports once, keeps the change, and a flush retries it", async () => {
    vi.useFakeTimers();
    const save = vi.fn(async (_board: Board, _version: number): Promise<SaveResult> => {
      if (save.mock.calls.length === 1) throw new TypeError("Failed to fetch");
      return { version: 2 };
    });
    const onError = vi.fn();
    const saved: number[] = [];
    const p = createPersistence({ save, reload: async () => emptyBoard("p"), onConflict: () => {}, onError, onSaved: (v) => saved.push(v), delayMs: 500 });
    p.schedule({ ...emptyBoard("p"), version: 1, goal: "a" });
    await vi.advanceTimersByTimeAsync(501);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(SAVE_FAILED_MESSAGE);
    await p.flush();
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1][0].goal).toBe("a");
    expect(saved).toEqual([2]);
    vi.useRealTimers();
  });

  it("(2) a failed save does not restore over a newer board scheduled while it was in flight", async () => {
    vi.useFakeTimers();
    const failing = deferred<SaveResult>();
    const save = vi.fn((_board: Board, _version: number): Promise<SaveResult> =>
      save.mock.calls.length === 1 ? failing.promise : Promise.resolve({ version: 2 }));
    const p = createPersistence({ save, reload: async () => emptyBoard("p"), onConflict: () => {}, onError: () => {}, onSaved: () => {}, delayMs: 10_000 });
    p.schedule({ ...emptyBoard("p"), version: 1, goal: "a" });
    const first = p.flush();
    await vi.advanceTimersByTimeAsync(0);
    p.schedule({ ...emptyBoard("p"), version: 1, goal: "b" });
    failing.reject(new TypeError("Failed to fetch"));
    await first;
    await p.flush();
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1][0].goal).toBe("b");
    vi.useRealTimers();
  });

  it("(2) a failed save does not restore over a newer board already queued behind it", async () => {
    vi.useFakeTimers();
    const failing = deferred<SaveResult>();
    const save = vi.fn((_board: Board, _version: number): Promise<SaveResult> =>
      save.mock.calls.length === 1 ? failing.promise : Promise.resolve({ version: 2 }));
    const p = createPersistence({ save, reload: async () => emptyBoard("p"), onConflict: () => {}, onError: () => {}, onSaved: () => {}, delayMs: 500 });
    p.schedule({ ...emptyBoard("p"), version: 1, goal: "a" });
    await vi.advanceTimersByTimeAsync(501);                          // a in flight
    p.schedule({ ...emptyBoard("p"), version: 1, goal: "b" });
    await vi.advanceTimersByTimeAsync(501);                          // b's debounce fired; b queued behind a
    failing.reject(new TypeError("Failed to fetch"));
    await vi.advanceTimersByTimeAsync(0);                            // a fails, b saves
    await p.flush();
    expect(save.mock.calls.map((c) => c[0].goal)).toEqual(["a", "b"]);
    vi.useRealTimers();
  });

  it("(3) dispose right after flush does not cancel the flush", async () => {
    const save = vi.fn(async (_board: Board, _version: number) => ({ version: 1 }));
    const p = createPersistence({ save, reload: async () => emptyBoard("p"), onConflict: () => {}, onSaved: () => {}, delayMs: 10_000 });
    p.schedule({ ...emptyBoard("p"), goal: "a" });
    const flushed = p.flush();
    p.dispose();
    await flushed;
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0].goal).toBe("a");
  });
});
