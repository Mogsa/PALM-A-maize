import type { Figure, LayoutRegion, PageRect, Section, Source } from "../model/types";
import { CARD_LINES, firstEntry } from "./citation";

/** References on a board card (D26): a chunk's text has no PDF links, so the paper's own pointers ("Figure 2",
 *  "Eq. (3)", "Sec. 4.1", "[12]") are found by simple, named patterns and matched to what the paper has. Nothing is
 *  generated: a match only shows the paper's own figure, section, formula or bibliography entry. */

export type ReferenceKind = "figure" | "table" | "equation" | "section" | "citation";
/** `key` is the number as the text writes it: "2", "3.1", "12". [start, end) is the span to underline. */
export type Reference = { kind: ReferenceKind; key: string; start: number; end: number };

const NUMBER = String.raw`(\d+)`;
const DOTTED = String.raw`(\d+(?:\.\d+)*)`;
/** Each has one group, the number. A citation marker is a list of numbers; each is found by CITATION_NUMBER. */
export const REFERENCE_PATTERNS: { name: string; kind: ReferenceKind; pattern: RegExp }[] = [
  { name: "Figure 2, Fig. 2", kind: "figure", pattern: new RegExp(String.raw`\b(?:Figure|Fig\.)\s*${NUMBER}\b`, "g") },
  { name: "Table 1", kind: "table", pattern: new RegExp(String.raw`\bTable\s*${NUMBER}\b`, "g") },
  { name: "Eq. (3), Eqn. (3)", kind: "equation", pattern: new RegExp(String.raw`\bEqn?\.\s*\(\s*${NUMBER}\s*\)`, "g") },
  { name: "Equation 3, Equation (3)", kind: "equation", pattern: new RegExp(String.raw`\bEquation\s*(?:\(\s*${NUMBER}\s*\)|${NUMBER}\b)`, "g") },
  { name: "Section 4, Sec. 4.1", kind: "section", pattern: new RegExp(String.raw`\b(?:Section|Sec\.)\s*${DOTTED}`, "g") },
  { name: "§4", kind: "section", pattern: new RegExp(String.raw`§\s*${DOTTED}`, "g") },
];
/** "[12]" or "[3, 7]": digits and commas only, so "[a, b]" and "[3–5]" are left alone. */
const CITATION = /\[\s*\d+(?:\s*,\s*\d+)*\s*\]/g;
const CITATION_NUMBER = /\d+/g;

function citations(text: string): Reference[] {
  const out: Reference[] = [];
  for (const marker of text.matchAll(CITATION)) {
    for (const n of marker[0].matchAll(CITATION_NUMBER)) {
      const start = marker.index! + n.index!;
      out.push({ kind: "citation", key: n[0], start, end: start + n[0].length });
    }
  }
  return out;
}

/** Every reference in `text`, in the order of the text; where two patterns overlap, the one starting first wins. */
export function findReferences(text: string): Reference[] {
  const found = REFERENCE_PATTERNS.flatMap(({ kind, pattern }) => [...text.matchAll(pattern)].map((m) => ({
    kind, key: m.slice(1).find((g) => g !== undefined)!, start: m.index!, end: m.index! + m[0].length,
  })));
  const all = [...found, ...citations(text)].sort((a, b) => a.start - b.start || b.end - a.end);
  const out: Reference[] = [];
  for (const ref of all) if (!out.length || ref.start >= out[out.length - 1].end) out.push(ref);
  return out;
}

/** What a reference points at in this paper. An equation's formula is known only once the words of the candidate
 *  regions are read (formulaNumbered), so it carries the formula regions on the pages that print its number. */
export type Target =
  | { kind: "figure"; figure: Figure }
  | { kind: "section"; section: Section }
  | { kind: "equation"; key: string; regions: LayoutRegion[] }
  | { kind: "citation"; entry: string; page: number };

const LABEL = { figure: "Figure", table: "Table" } as const;
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** "(3)" and "( 3 )", but not "(13)". */
const printedNumber = (key: string) => new RegExp(String.raw`\(\s*${escape(key)}\s*\)`);
/** A bibliography entry starts a line with its marker, then a capital: an author. A line of running text that happens
 *  to start with "[16]," does not. */
const entryStart = (key: string) => new RegExp(String.raw`^\[${escape(key)}\]\s+(?=\p{Lu})`, "mu");

/** Whether a formula region's words carry the equation number `key`, as "(3)". */
export function formulaNumbered(text: string, key: string): boolean {
  return printedNumber(key).test(text);
}

/** The bibliography entry for "[key]": the last line in the paper that starts with the marker, trimmed to its entry
 *  by Tier 1's firstEntry. */
function bibliographyEntry(key: string, source: Source): { entry: string; page: number } | null {
  let found: { entry: string; page: number } | null = null;
  for (const { page, text } of source.page_text) {
    const at = entryStart(key).exec(text);
    if (at) found = { entry: firstEntry(text.slice(at.index)), page };
  }
  return found;
}

/** What a card shows (D24, D26): the paper's own words, a clip of the paper when it points at a figure, table or
 *  formula, and where Go there goes. */
export type WordsCard = { text: string; clip: PageRect | null; go: PageRect };

/** A section's heading and its first CARD_LINES lines, up to its first paragraph's end. */
const sectionWords = (section: Section) =>
  `${section.title}\n\n${firstEntry(section.text.split("\n").slice(0, CARD_LINES).join("\n"))}`;

/** The card for a matched reference. An equation's candidate formulas are read, in order, by `read` (the existing
 *  `POST /text`) until one carries its number; null when none does. */
export async function referenceCard(target: Target, read: (at: PageRect) => Promise<string>): Promise<WordsCard | null> {
  switch (target.kind) {
    case "figure": return { text: target.figure.caption, clip: target.figure.rect, go: target.figure.rect };
    case "section": return { text: sectionWords(target.section), clip: null, go: target.section.heading_rect };
    case "citation": return { text: target.entry, clip: null, go: { page: target.page, rect: [0, 0, 0, 0] } };
    case "equation": {
      for (const region of target.regions) {
        const at = { page: region.page, rect: region.rect };
        if (formulaNumbered(await read(at), target.key)) return { text: "", clip: at, go: at };
      }
      return null;
    }
  }
}

/** The paper's own figure, section, formula regions or bibliography entry for `ref`, or null when there is none:
 *  an unmatched reference stays plain text. */
export function resolveReference(ref: Reference, source: Source): Target | null {
  switch (ref.kind) {
    case "figure":
    case "table": {
      const label = `${LABEL[ref.kind]} ${ref.key}`;
      const figure = source.figures.find((f) => f.label === label);
      return figure ? { kind: "figure", figure } : null;
    }
    case "section": {
      const section = source.sections.find((s) => s.number === ref.key);
      return section ? { kind: "section", section } : null;
    }
    case "equation": {
      const pages = new Set(source.page_text.filter((p) => printedNumber(ref.key).test(p.text)).map((p) => p.page));
      const regions = source.regions.filter((r) => r.label === "formula" && pages.has(r.page));
      return regions.length ? { kind: "equation", key: ref.key, regions } : null;
    }
    case "citation": {
      const found = bibliographyEntry(ref.key, source);
      return found ? { kind: "citation", ...found } : null;
    }
  }
}

export type ReferencePart = { text: string; ref: Reference | null };

/** `text` cut at the references this paper can show, in order; a reference with no match stays in the plain text. */
export function splitReferences(text: string, source: Source): ReferencePart[] {
  const parts: ReferencePart[] = [];
  let cursor = 0;
  for (const ref of findReferences(text)) {
    if (!resolveReference(ref, source)) continue;
    if (ref.start > cursor) parts.push({ text: text.slice(cursor, ref.start), ref: null });
    parts.push({ text: text.slice(ref.start, ref.end), ref });
    cursor = ref.end;
  }
  if (cursor < text.length || !parts.length) parts.push({ text: text.slice(cursor), ref: null });
  return parts;
}
