const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Text cut at whole-word, case-insensitive occurrences of the AI's terms (spec B4), longest first. */
export function splitTerms(text: string, terms: string[]): { text: string; term: string | null }[] {
  if (!terms.length) return [{ text, term: null }];
  const sorted = [...terms].sort((a, b) => b.length - a.length);
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])(${sorted.map((t) => escape(t).replace(/\s+/g, "\\s+")).join("|")})(?![\\p{L}\\p{N}])`, "giu");
  const out: { text: string; term: string | null }[] = [];
  let last = 0;
  for (const m of text.matchAll(pattern)) {
    if (m.index! > last) out.push({ text: text.slice(last, m.index), term: null });
    const term = sorted.find((t) => t.toLowerCase() === m[0].toLowerCase().replace(/\s+/g, " ")) ?? m[0];
    out.push({ text: m[0], term });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), term: null });
  return out;
}
