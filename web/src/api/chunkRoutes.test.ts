import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChunkAnchor } from "../model/types";
import { api } from "./client";

const q = { exact: "x", prefix: "", suffix: "" };
const region: ChunkAnchor = { rects: [{ page: 2, rect: [50, 100, 286, 400] }], start: q, end: q, position: 0, state: "anchored" };

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", fn);
  return fn;
}
const sent = (fn: ReturnType<typeof mockFetch>) => {
  const [url, init] = fn.mock.calls.at(-1) as unknown as [string, RequestInit];
  return { url, method: init.method, headers: init.headers as Record<string, string>, body: JSON.parse(init.body as string) };
};

afterEach(() => vi.unstubAllGlobals());

describe("the chunk routes (addendum 4.10)", () => {
  it("highlightInChunk posts the region and the quote and returns the anchor", async () => {
    const anchor = { rects: region.rects, quote: q, position: 3, state: "anchored" };
    const fn = mockFetch(200, { highlight: anchor });
    expect(await api.highlightInChunk("p", region, q)).toEqual(anchor);
    expect(sent(fn)).toMatchObject({ url: "/api/papers/p/chunks/highlight", method: "POST", body: { region, quote: q } });
    expect(sent(fn).headers["X-Paperboard"]).toBe("1");
  });

  it("highlightInChunk throws the server's quote_not_found", async () => {
    mockFetch(422, { error: { code: "quote_not_found", message: "not in this piece" } });
    await expect(api.highlightInChunk("p", region, q)).rejects.toMatchObject({ code: "quote_not_found" });
  });

  it("recut posts the mode and returns the pieces", async () => {
    const fn = mockFetch(200, { nodes: [{ type: "chunk", data: {} }] });
    expect(await api.recut("p", region, q, "cut")).toHaveLength(1);
    expect(sent(fn)).toMatchObject({ url: "/api/papers/p/chunks/split", body: { region, at: q, mode: "cut" } });
  });

  it("join returns the joined piece, null for chunks that are not neighbours, and throws anything else", async () => {
    const fn = mockFetch(200, { node: { type: "chunk", data: {} }, order: [1, 0] });
    expect(await api.join("p", [region, region])).toMatchObject({ order: [1, 0] });
    expect(sent(fn)).toMatchObject({ url: "/api/papers/p/chunks/join", body: { regions: [region, region] } });
    mockFetch(422, { error: { code: "not_contiguous", message: "not neighbours" } });
    expect(await api.join("p", [region, region])).toBeNull();
    mockFetch(500, { error: { code: "internal", message: "boom" } });
    await expect(api.join("p", [region, region])).rejects.toMatchObject({ code: "internal" });
  });
});
