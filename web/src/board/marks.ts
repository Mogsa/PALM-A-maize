import type { Highlight } from "../model/types";

export type Run = { text: string; highlightId: string | null };

const PARAGRAPH_BREAK = /[ \t]*\n[ \t]*\n[ \t\n]*/;
const LINE_BREAK = /[ \t]*\n[ \t]*/g;
const HYPHENATED_LINE_END = /-\n(?=[a-z])/g;

/** PDF text as prose: hyphenated line ends joined, single line breaks made spaces, blank
 *  lines kept as paragraph breaks. Applied to a chunk's text before it is shown, and to
 *  every quote before it is matched against that text, so the two agree. */
export function reflow(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(HYPHENATED_LINE_END, "")
    .split(PARAGRAPH_BREAK)
    .map((paragraph) => paragraph.replace(LINE_BREAK, " ").replace(/[ \t]{2,}/g, " ").trim())
    .filter(Boolean)
    .join("\n\n");
}

function stripped(text: string): { s: string; offsets: number[] } {
  const chars: string[] = [];
  const offsets: number[] = [];
  for (let i = 0; i < text.length; i++) {
    if (!/\s/.test(text[i])) { chars.push(text[i]); offsets.push(i); }
  }
  return { s: chars.join(""), offsets };
}

/** Split a chunk's text into runs so each highlight inside it can be drawn as a <mark>. */
export function paintMarks(text: string, marks: Highlight[]): Run[] {
  const { s, offsets } = stripped(text);
  const spans: Array<{ start: number; end: number; id: string }> = [];
  for (const mark of marks) {
    // Quotes are reflowed like the chunk's text so one that crossed a hyphenated line end still matches.
    const needle = stripped(reflow(mark.anchor.quote.exact)).s;
    if (!needle) continue;
    const prefix = stripped(reflow(mark.anchor.quote.prefix)).s;
    const suffix = stripped(reflow(mark.anchor.quote.suffix)).s;
    const candidates: Array<{ at: number; score: number }> = [];
    for (let at = s.indexOf(needle); at !== -1; at = s.indexOf(needle, at + 1)) {
      // Compare adjacent context, allowing it to be clipped by the chunk boundary.
      // This is exact disambiguation, not another fuzzy anchoring implementation.
      let before = 0, after = 0;
      while (before < prefix.length && before < at && s[at - before - 1] === prefix[prefix.length - before - 1]) before++;
      const end = at + needle.length;
      while (after < suffix.length && end + after < s.length && s[end + after] === suffix[after]) after++;
      candidates.push({ at, score: before + after });
    }
    candidates.sort((a, b) => b.score - a.score);
    if (!candidates.length || (candidates.length > 1 && candidates[0].score === candidates[1].score)) continue;
    const at = candidates[0].at;
    spans.push({ start: offsets[at], end: offsets[at + needle.length - 1] + 1, id: mark.id });
  }
  spans.sort((a, b) => a.start - b.start);
  const runs: Run[] = [];
  let cursor = 0;
  for (const span of spans) {
    if (span.start < cursor) continue;   // overlapping marks: first wins in v1
    if (span.start > cursor) runs.push({ text: text.slice(cursor, span.start), highlightId: null });
    runs.push({ text: text.slice(span.start, span.end), highlightId: span.id });
    cursor = span.end;
  }
  if (cursor < text.length) runs.push({ text: text.slice(cursor), highlightId: null });
  return runs;
}
