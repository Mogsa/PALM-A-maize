import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./client";

describe("api, activity log", () => {
  const events = [{ t: "2026-09-30T10:00:00.000Z", kind: "read" as const, action: "view", detail: { view: "board" } }];

  it("postActivity sends the events with the Paperboard header, keepalive when asked", async () => {
    const fn = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fn);
    await api.postActivity("p", events, { keepalive: true });
    const { url, init, body } = lastCall(fn);
    expect(url).toBe("/api/papers/p/activity");
    expect(init).toMatchObject({ method: "POST", keepalive: true });
    expect((init.headers as Record<string, string>)["X-Paperboard"]).toBe("1");
    expect(body).toEqual({ events });
    await api.postActivity("p", events);
    expect(lastCall(fn).init.keepalive).toBe(false);
  });

  it("postActivity throws on a refusal", async () => {
    mockFetch(400, { error: { code: "bad_activity", message: "no" } });
    await expect(api.postActivity("p", events)).rejects.toMatchObject({ code: "bad_activity" });
  });

  it("getActivity reads the last `limit` events", async () => {
    const fn = mockFetch(200, { events });
    expect(await api.getActivity("p", 500)).toEqual(events);
    expect(lastCall(fn).url).toBe("/api/papers/p/activity?limit=500");
  });
});

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

  it("postExport sends tags and always the paper's order", async () => {
    const fn = mockFetch(200, { path: "/x/export.md", markdown: "# x" });
    expect(await api.postExport("p", ["t-claim"])).toEqual({ path: "/x/export.md", markdown: "# x" });
    expect(lastCall(fn)).toMatchObject({ url: "/api/papers/p/export", body: { tags: ["t-claim"], order: "paper" } });
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
    expect(await api.getNote("p", "n-1")).toEqual({ markdown: "hi", has_sketch: false });   // a server without sketches
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

  it("getNote says whether the note has a sketch; a note never written is empty and has none", async () => {
    mockFetch(200, { markdown: "", has_sketch: true });
    expect(await api.getNote("p", "n-1")).toEqual({ markdown: "", has_sketch: true });
    mockFetch(404, { error: { code: "note_not_found", message: "no note" } });
    expect(await api.getNote("p", "n-1")).toEqual({ markdown: "", has_sketch: false });
  });

  it("a sketch is put, read, removed and shown at its own routes (D23)", async () => {
    const sketch = { width: 600, height: 400, strokes: [{ points: [[1, 2, 0.5]] as [number, number, number][], size: 4 }] };
    const fn = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fn);
    await api.putSketch("p", "n-1", { ...sketch, paths: ["M1 2Z"] });
    expect(lastCall(fn)).toMatchObject({ url: "/api/papers/p/notes/n-1/sketch", init: { method: "PUT" }, body: { ...sketch, paths: ["M1 2Z"] } });
    await api.deleteSketch("p", "n-1");
    expect(lastCall(fn)).toMatchObject({ url: "/api/papers/p/notes/n-1/sketch", init: { method: "DELETE" } });
    mockFetch(200, sketch);
    expect(await api.getSketch("p", "n-1")).toEqual(sketch);
    expect(api.sketchUrl("p", "n-1", 3)).toBe("/api/papers/p/notes/n-1/sketch.svg?v=3");
  });

  it("addPaper uploads the PDF as multipart, without a JSON content type", async () => {
    const fn = mockFetch(201, { paper_id: "p" });
    expect(await api.addPaper(new Blob(["%PDF-"]), "paper.pdf")).toEqual({ paper_id: "p" });
    const { url, init } = lastCall(fn);
    expect(url).toBe("/api/papers");
    expect(init.body).toBeInstanceOf(FormData);
    expect(new Headers(init.headers).get("content-type")).toBeNull();
  });

  it("addPaper fails with the status even when the body is not JSON (a proxy's 413) or is a bare {code}", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("Request Entity Too Large", { status: 413 })));
    await expect(api.addPaper(new Blob(["%PDF-"]), "big.pdf")).rejects.toMatchObject({ status: 413 });
    mockFetch(415, { code: "not_pdf" });
    await expect(api.addPaper(new Blob(["x"]), "a.txt")).rejects.toMatchObject({ status: 415, code: "not_pdf" });
  });

  it("the view is read and put at its own route, with no version", async () => {
    const view = { view: "both" as const, paper_scroll: null, active_tags: [], viewport: null, split: 0.4, ai: false };
    mockFetch(200, view);
    expect(await api.getView("p")).toEqual(view);
    const fn = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fn);
    await api.putView("p", view);
    const call = lastCall(fn);
    expect(call).toMatchObject({ url: "/api/papers/p/view", init: { method: "PUT" }, body: view });
    expect(new Headers(call.init.headers).get("if-match")).toBeNull();
  });
});

describe("api, AI routes", () => {
  it("getAi reads a 404 as no pass yet", async () => {
    mockFetch(404, { error: { code: "ai_not_found", message: "none" } });
    expect(await api.getAi("p")).toEqual({ status: "none", stale: false, message: null, ai: null });
  });

  it("runAi posts to /ai", async () => {
    const fn = mockFetch(200, { status: "done", stale: false, message: null, ai: null });
    await api.runAi("p");
    expect(lastCall(fn)).toMatchObject({ url: "/api/papers/p/ai", init: { method: "POST" } });
  });

  it("define streams deltas and resolves with the result", async () => {
    const body = '{"delta":"{\\"explanation\\": \\"x"}\n{"done":{"model":"m","explanation":"x","grounds":[]}}\n';
    const fn = vi.fn(async () => new Response(body, { status: 200 }));
    vi.stubGlobal("fetch", fn);
    const deltas: string[] = [];
    const result = await api.define("p", { word: "w", page: 0, rect: [0, 0, 1, 1], definition: null }, (d) => deltas.push(d));
    expect(result.explanation).toBe("x");
    expect(deltas).toEqual(['{"explanation": "x']);
    expect(lastCall(fn).body).toEqual({ word: "w", page: 0, rect: [0, 0, 1, 1], definition: null });
  });

  it("define rejects with the server's plain line", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response('{"error":"AI help could not run: x"}\n', { status: 200 })));
    await expect(api.define("p", { word: "w", page: 0, rect: [0, 0, 1, 1], definition: null }, () => {}))
      .rejects.toThrow("AI help could not run: x");
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
