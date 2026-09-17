import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./client";

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe("api.putBoard", () => {
  it("sends If-Match and returns the new version", async () => {
    const fn = mockFetch(200, { version: 4 });
    const result = await api.putBoard("p", { paper_id: "p" } as never, 3);
    expect(result).toEqual({ version: 4 });
    const [, init] = fn.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)["If-Match"]).toBe("3");
    expect(init.method).toBe("PUT");
  });

  it("reports a conflict instead of throwing", async () => {
    mockFetch(409, { error: { code: "version_conflict", message: "x", current: 7 } });
    expect(await api.putBoard("p", { paper_id: "p" } as never, 3)).toEqual({ conflict: true, current: 7 });
  });

  it("throws ApiError with the server's code on other errors", async () => {
    mockFetch(404, { error: { code: "paper_not_found", message: "no paper p" } });
    await expect(api.getBoard("p")).rejects.toMatchObject({ code: "paper_not_found" });
  });
});
