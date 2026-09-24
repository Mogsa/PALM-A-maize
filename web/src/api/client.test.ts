import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./client";

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

function lastCall(fn: { mock: { calls: unknown[][] } }): { url: string; init: RequestInit; body: unknown } {
  const [url, init] = fn.mock.calls.at(-1) as [string, RequestInit];
  return { url, init, body: typeof init?.body === "string" ? JSON.parse(init.body) : init?.body };
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

describe("api, schema 2 routes", () => {
  it("postText sends the selection mode, text by default", async () => {
    const fn = mockFetch(200, {});
    const rects = [{ page: 2, rect: [1, 2, 3, 4] as [number, number, number, number] }];
    await api.postText("p", rects, true);
    expect(lastCall(fn)).toMatchObject({ url: "/api/papers/p/text", body: { rects, snap: true, mode: "text" } });
    await api.postText("p", rects, false, "area");
    expect(lastCall(fn).body).toEqual({ rects, snap: false, mode: "area" });   // no lines: an area has none
  });

  it("postText sends a text selection's lines beside its rects (contract 1)", async () => {
    const fn = mockFetch(200, {});
    const rects = [{ page: 2, rect: [1, 2, 30, 40] as [number, number, number, number] }];
    const lines = [{ page: 2, rect: [10, 2, 30, 12] as [number, number, number, number] }, { page: 2, rect: [1, 14, 20, 24] as [number, number, number, number] }];
    await api.postText("p", rects, false, "text", lines);
    expect(lastCall(fn).body).toEqual({ rects, snap: false, mode: "text", lines });
  });

  it("renderUrl builds the stateless render query, at CLIP_DPI unless given", () => {
    const target = { page: 3, rect: [10, 20.5, 30, 40] as [number, number, number, number] };
    expect(api.renderUrl("p", target)).toBe("/api/papers/p/render?page=3&x0=10&y0=20.5&x1=30&y1=40&dpi=216");
    expect(api.renderUrl("p", target, 100)).toBe("/api/papers/p/render?page=3&x0=10&y0=20.5&x1=30&y1=40&dpi=100");
  });

  it("postExport sends tags and the order, paper by default", async () => {
    const fn = mockFetch(200, { path: "/x/export.md", markdown: "# x" });
    expect(await api.postExport("p", ["t-claim"])).toEqual({ path: "/x/export.md", markdown: "# x" });
    expect(lastCall(fn)).toMatchObject({ url: "/api/papers/p/export", body: { tags: ["t-claim"], order: "paper" } });
    await api.postExport("p", [], "template");
    expect(lastCall(fn).body).toEqual({ tags: [], order: "template" });
  });

  it("split posts and returns the drafts", async () => {
    const fn = mockFetch(200, { nodes: [] });
    expect(await api.split("p")).toEqual({ nodes: [] });
    expect(lastCall(fn)).toMatchObject({ url: "/api/papers/p/split", init: { method: "POST" } });
  });

  it("template and tags are read and replaced whole", async () => {
    const template = { schema: 1 as const, slots: [{ name: "Problem", prompt: "Why?" }] };
    const fn = mockFetch(200, template);
    expect(await api.getTemplate()).toEqual(template);
    expect(lastCall(fn).url).toBe("/api/template");
    await api.putTemplate(template);
    expect(lastCall(fn)).toMatchObject({ url: "/api/template", init: { method: "PUT" }, body: template });
    await api.getTags();
    expect(lastCall(fn).url).toBe("/api/tags");
    await api.putTags({ schema: 1, tags: [] });
    expect(lastCall(fn)).toMatchObject({ url: "/api/tags", init: { method: "PUT" } });
  });

  it("notes, clips, questions and re-extraction go to their routes", async () => {
    const fn = mockFetch(200, { markdown: "hi" });
    expect(await api.getNote("p", "n-1")).toEqual({ markdown: "hi" });
    expect(lastCall(fn).url).toBe("/api/papers/p/notes/n-1");
    await api.putClip("p", "n-1", { page: 1, rect: [1, 2, 3, 4] });
    expect(lastCall(fn)).toMatchObject({ url: "/api/papers/p/clips/n-1", init: { method: "PUT" }, body: { page: 1, rect: [1, 2, 3, 4], dpi: 216 } });
    await api.putClip("p", "n-1", { page: 1, rect: [1, 2, 3, 4] }, 100);
    expect(lastCall(fn).body).toEqual({ page: 1, rect: [1, 2, 3, 4], dpi: 100 });
    expect(api.clipUrl("p", "n-1")).toBe("/api/papers/p/clips/n-1.png");
    await api.getQuestions("p");
    expect(lastCall(fn).url).toBe("/api/papers/p/questions");
    await api.reextract("p");
    expect(lastCall(fn)).toMatchObject({ url: "/api/papers/p/extract", init: { method: "POST" } });
  });

  it("putNote accepts a 204", async () => {
    const fn = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fn);
    await api.putNote("p", "n-1", "text");
    expect(lastCall(fn)).toMatchObject({ url: "/api/papers/p/notes/n-1", init: { method: "PUT" }, body: { markdown: "text" } });
  });

  it("addPaper uploads the PDF as multipart, without a JSON content type", async () => {
    const fn = mockFetch(201, { paper_id: "p" });
    expect(await api.addPaper(new Blob(["%PDF-"]), "paper.pdf")).toEqual({ paper_id: "p" });
    const { url, init } = lastCall(fn);
    expect(url).toBe("/api/papers");
    expect(init.body).toBeInstanceOf(FormData);
    expect(new Headers(init.headers).get("content-type")).toBeNull();
  });
});

describe("every request says it comes from Paper Board (contract 2)", () => {
  it.each([
    ["a read", () => api.getBoard("p")],
    ["a JSON write", () => api.putNote("p", "n-1", "text")],
    ["a board save", () => api.putBoard("p", { paper_id: "p" } as never, 3)],
    ["an upload", () => api.addPaper(new Blob(["%PDF-"]), "paper.pdf")],
  ])("%s carries X-Paperboard: 1", async (_, send) => {
    const fn = mockFetch(200, { version: 1, paper_id: "p" });
    await send();
    expect(new Headers(lastCall(fn).init.headers).get("X-Paperboard")).toBe("1");
  });
});
