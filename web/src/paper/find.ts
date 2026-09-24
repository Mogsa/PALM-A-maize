import type { Section, Source } from "../model/types";

export const FIND_CONTEXT_WORDS = 4;
export const FIND_MAX_HITS = 200;

export type FindHit = { page: number; start: number; end: number; before: string; match: string; after: string; section: Section | null };

/** Lower case with every whitespace removed, and where each kept character was: addendum 5.2's trick, so a phrase
 *  broken across lines still matches. */
function squeeze(text: string): { flat: string; offsets: number[] } {
  const chars: string[] = [];
  const offsets: number[] = [];
  for (let i = 0; i < text.length; i++) if (!/\s/.test(text[i])) { chars.push(text[i].toLowerCase()); offsets.push(i); }
  return { flat: chars.join(""), offsets };
}

const words = (text: string) => text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);

type Squeezed = { section: Section; flat: string };

/** The section whose text holds the hit with its words either side (addendum 6.2). Context can run past a section's
 *  end, so the hit with only the words before it, then with only the words after it, are tried next. */
function sectionOf(sections: Squeezed[], before: string, match: string, after: string): Section | null {
  for (const text of [`${before} ${match} ${after}`, `${before} ${match}`, `${match} ${after}`]) {
    const needle = squeeze(text).flat;
    const found = sections.find((s) => s.flat.includes(needle));
    if (found) return found.section;
  }
  return null;
}

/** Every place the query appears, with its page, its section and a few words either side (addendum 6.2). Suggests nothing. */
export function findInPaper(query: string, source: Source): FindHit[] {
  const needle = squeeze(query).flat;
  if (!needle) return [];
  const sections: Squeezed[] = source.sections.map((s) => ({ section: s, flat: squeeze(s.text).flat }));
  const hits: FindHit[] = [];
  for (const { page, text } of source.page_text) {
    const { flat, offsets } = squeeze(text);
    for (let at = flat.indexOf(needle); at !== -1 && hits.length < FIND_MAX_HITS; at = flat.indexOf(needle, at + needle.length)) {
      const start = offsets[at];
      const end = offsets[at + needle.length - 1] + 1;
      const before = words(text.slice(0, start)).slice(-FIND_CONTEXT_WORDS).join(" ");
      const after = words(text.slice(end)).slice(0, FIND_CONTEXT_WORDS).join(" ");
      const match = text.slice(start, end).replace(/\s+/g, " ");
      hits.push({ page, start, end, before, match, after, section: sectionOf(sections, before, match, after) });
    }
  }
  return hits;
}

const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A text-layer string with the query wrapped in <mark>. react-pdf inserts it as HTML, so the paper's text is escaped. */
export function markMatches(text: string, query: string): string {
  const q = query.trim();
  if (!q) return escapeHtml(text);
  const pattern = new RegExp(escapeRegExp(q).replace(/\s+/g, "\\s+"), "gi");
  let out = "";
  let last = 0;
  for (const m of text.matchAll(pattern)) {
    out += `${escapeHtml(text.slice(last, m.index))}<mark class="find-hit">${escapeHtml(m[0])}</mark>`;
    last = m.index! + m[0].length;
  }
  return out + escapeHtml(text.slice(last));
}
