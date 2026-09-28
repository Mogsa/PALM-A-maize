/** Calls `onLine` with each JSON line of a streamed response, as it arrives. */
export async function readNdjson(response: Response, onLine: (line: unknown) => void): Promise<void> {
  if (!response.body) throw new Error("AI help could not run: no response body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    lines.filter((l) => l.trim()).forEach((l) => onLine(JSON.parse(l)));
    if (done) break;
  }
  if (buffer.trim()) onLine(JSON.parse(buffer));
}
