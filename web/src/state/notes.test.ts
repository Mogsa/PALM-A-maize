import { describe, expect, it, vi } from "vitest";
import { createNoteStore } from "./notes";

describe("the note store", () => {
  it("loads a note once and shares it", async () => {
    const get = vi.fn(async () => "text");
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
  it("a failed load can be tried again", async () => {
    const get = vi.fn().mockRejectedValueOnce(new Error("down")).mockResolvedValue("ok");
    const store = createNoteStore({ get, put: vi.fn() });
    await expect(store.load("n-1")).rejects.toThrow("down");
    expect(await store.load("n-1")).toBe("ok");
  });
});
