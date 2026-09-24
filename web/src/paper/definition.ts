import type { Source } from "../model/types";
import type { FindHit } from "./find";

/** "Where is this defined?" (D25): each Find hit is scored by simple, named rules on the sentence around it. Nothing
 *  is generated: the rules only reorder and label the paper's own occurrences. */

/** A pattern that on its own says "this is where the term is introduced". */
export const STRONG_CUE = 2;
/** A hint that says so only together with another: being the first occurrence, or an "i.e." nearby. */
export const WEAK_CUE = 1;
/** A hit scoring at least this is badged "likely definition" and listed first. */
export const LIKELY_DEFINITION_SCORE = STRONG_CUE;
/** How far either side of a hit the sentence around it is looked for, in characters. */
export const SENTENCE_MAX_CHARS = 300;

/** A hit's sentence, split at the hit: `before` and `after` are the sentence's words either side of the term. */
export type DefinitionContext = { before: string; term: string; after: string; first: boolean };
type Rule = { name: string; weight: number; test: (c: DefinitionContext) => boolean };

const OPEN_QUOTE = `["“‘']?\\s*$`;
const endsWith = (pattern: string) => new RegExp(`${pattern}${OPEN_QUOTE}`, "i");
/** A short parenthesised token that looks like an abbreviation: a capital, then letters, digits or hyphens. */
const ABBREVIATION = /^\s*\(\s*[A-Z][A-Za-z0-9-]{0,11}\s*\)/;

export const DEFINITION_RULES: Rule[] = [
  { name: "first occurrence", weight: WEAK_CUE, test: (c) => c.first },
  { name: "we define", weight: STRONG_CUE, test: (c) => /\bwe\s+define\b/i.test(c.before) },
  { name: "defined as", weight: STRONG_CUE, test: (c) => /^\W*(is|are)\s+defined\s+(as|by|to\s+be)\b/i.test(c.after) },
  { name: "denoted by", weight: STRONG_CUE,
    test: (c) => endsWith("\\bdenoted?\\s+(by|as)").test(c.before) || /^\W*(is|are)?\s*denoted\s+(by|as)\b/i.test(c.after) },
  { name: "let … be", weight: STRONG_CUE, test: (c) => /\blet\b[^.]*$/i.test(c.before) && /^\W*be\b/i.test(c.after) },
  { name: "we call", weight: STRONG_CUE, test: (c) => /\bwe\s+call\b/i.test(c.before) },
  { name: "called", weight: STRONG_CUE, test: (c) => endsWith("\\b(called|termed|known\\s+as)").test(c.before) },
  { name: "refer to … as", weight: STRONG_CUE, test: (c) => endsWith("\\brefer(red)?\\s+to\\b.*\\bas").test(c.before) },
  { name: "abbreviation follows", weight: STRONG_CUE, test: (c) => ABBREVIATION.test(c.after) },
  { name: "the abbreviation itself", weight: STRONG_CUE, test: (c) => /\(\s*$/.test(c.before) && /^\s*\)/.test(c.after) },
  { name: "colon follows", weight: STRONG_CUE, test: (c) => /^["”’']?\s*:/.test(c.after) },
  { name: "i.e.", weight: WEAK_CUE, test: (c) => /\bi\.\s?e\.|\bthat is,/i.test(`${c.before} ${c.after}`) },
];

/** The rules a hit meets, and their summed weight. */
export function definitionScore(context: DefinitionContext): { score: number; rules: string[] } {
  const met = DEFINITION_RULES.filter((rule) => rule.test(context));
  return { score: met.reduce((sum, rule) => sum + rule.weight, 0), rules: met.map((rule) => rule.name) };
}

/** A sentence ends at . ! or ? followed by space and a capital, a quote or an opening bracket: "Fig. 2" and "i.e. the"
 *  do not end one. */
const SENTENCE_END = /[.!?]["”’)]?\s+(?=[A-Z"“‘(\[])/g;
const single = (text: string) => text.replace(/\s+/g, " ");

/** The words of the hit's sentence before and after the hit, within SENTENCE_MAX_CHARS either side. */
export function sentenceAround(text: string, start: number, end: number): { before: string; after: string } {
  const head = text.slice(Math.max(0, start - SENTENCE_MAX_CHARS), start);
  let from = 0;
  for (const m of head.matchAll(SENTENCE_END)) from = m.index! + m[0].length;
  const tail = text.slice(end, end + SENTENCE_MAX_CHARS);
  const stop = new RegExp(SENTENCE_END.source).exec(tail);
  const to = stop ? stop.index + stop[0].trimEnd().length : tail.length;
  return { before: single(head.slice(from)), after: single(tail.slice(0, to)) };
}

export type RankedHit = { hit: FindHit; score: number; rules: string[]; likely: boolean };

/** Find's hits with likely definitions first, the highest score first, each group in paper order. */
export function rankFindHits(hits: FindHit[], source: Source): RankedHit[] {
  const pageText = new Map(source.page_text.map((p) => [p.page, p.text]));
  const ranked = hits.map((hit, i) => {
    const { before, after } = sentenceAround(pageText.get(hit.page) ?? "", hit.start, hit.end);
    const { score, rules } = definitionScore({ before, term: hit.match, after, first: i === 0 });
    return { hit, score, rules, likely: score >= LIKELY_DEFINITION_SCORE };
  });
  const likely = ranked.filter((r) => r.likely).sort((a, b) => b.score - a.score);   // a stable sort keeps paper order
  return [...likely, ...ranked.filter((r) => !r.likely)];
}
