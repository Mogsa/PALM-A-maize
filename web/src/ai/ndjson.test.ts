import { describe, expect, it } from "vitest";
import { readNdjson } from "./ndjson";

const streamOf = (...chunks: string[]) => new Response(new ReadableStream({
  start(c) { chunks.forEach((s) => c.enqueue(new TextEncoder().encode(s))); c.close(); },
}));

describe("readNdjson", () => {
  it("parses lines split across chunks", async () => {
    const lines: unknown[] = [];
    await readNdjson(streamOf('{"delta":"a"}\n{"del', 'ta":"b"}\n{"done":1}\n'), (l) => lines.push(l));
    expect(lines).toEqual([{ delta: "a" }, { delta: "b" }, { done: 1 }]);
  });
});
