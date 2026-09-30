import { api } from "../api/client";
import { newId } from "../model/ids";
import type { Highlight, PageRect, Tag } from "../model/types";
import { TERM_TAG_ID, termOf, termTagIds, type TermPart } from "../paper/term";
import type { AiFile, Ground } from "./types";

/** What the AI has on one word: from the pass, or from a quick definition. */
export type AiEntry = { term: string; definedIn: Ground | null; explanation: string | null; grounds: Ground[] };
export type AiPart = { kind: "ai"; explanation: string; grounds: Ground[] };
export type AiUnderline = { term: string; at: PageRect };

/** As the server keys `defined`: lower case, single spaces. */
export const wordKey = (word: string) => word.toLowerCase().replace(/\s+/g, " ").trim();

export function aiEntryFor(ai: AiFile | null, word: string): AiEntry | null {
  if (!ai) return null;
  const key = wordKey(word);
  const found = ai.reader?.terms.find((t) => wordKey(t.term) === key);
  if (found) return { term: found.term, definedIn: found.defined_in[0] ?? null, explanation: found.explanation, grounds: found.grounds };
  const quick = ai.defined[key];
  return quick ? { term: word, definedIn: null, explanation: quick.explanation, grounds: quick.grounds } : null;
}

const overlaps = (a: PageRect, b: PageRect) => a.page === b.page
  && a.rect[0] < b.rect[2] && b.rect[0] < a.rect[2] && a.rect[1] < b.rect[3] && b.rect[1] < a.rect[3];

/** The dotted underlines on one page (spec B4): every occurrence of every AI term, except where the reader's own
 *  term mark already is: their solid underline wins. */
export function aiUnderlines(ai: AiFile | null, readerTerms: Highlight[], page: number): AiUnderline[] {
  const theirs = readerTerms.flatMap((h) => h.anchor.rects);
  return (ai?.reader?.terms ?? []).flatMap((t) => t.occurrences
    .filter((o) => o.page === page && !theirs.some((r) => overlaps(o, r)))
    .map((o) => ({ term: t.term, at: o })));
}

export function aiTermAt(ai: AiFile | null, readerTerms: Highlight[], point: { page: number; x: number; y: number }): AiUnderline | null {
  return aiUnderlines(ai, readerTerms, point.page).find(({ at: { rect } }) =>
    point.x >= rect[0] && point.x <= rect[2] && point.y >= rect[1] && point.y <= rect[3]) ?? null;
}

/** A term card's parts in order (spec B4): your definition; in this paper (the AI's `defined_in`, else D25's);
 *  then the AI's explanation, when it has one. */
export function cardParts(readerParts: TermPart[], entry: AiEntry | null): (TermPart | AiPart)[] {
  const note = readerParts.filter((p) => p.kind === "note");
  const d25 = readerParts.find((p) => p.kind === "definition");
  const inPaper: TermPart | undefined = entry?.definedIn?.at
    ? { kind: "definition", page: entry.definedIn.at.page, sentence: entry.definedIn.quote, section: null }
    : d25;
  const ai: AiPart[] = entry?.explanation ? [{ kind: "ai", explanation: entry.explanation, grounds: entry.grounds }] : [];
  return [...note, ...(inPaper ? [inPaper] : []), ...ai];
}

/** AI terms the reader has not kept, for the Glossary's lighter rows (spec B4). */
export type AiGlossaryEntry = { term: string; explanation: string | null };
export function aiGlossary(ai: AiFile | null, keptTerms: string[]): AiGlossaryEntry[] {
  const kept = new Set(keptTerms.map(wordKey));
  return (ai?.reader?.terms ?? [])
    .filter((t) => !kept.has(wordKey(t.term)))
    .map((t) => ({ term: t.term, explanation: t.explanation }))
    .sort((a, b) => a.term.localeCompare(b.term, undefined, { sensitivity: "base" }));
}

/** The tag Keep puts on: the term preset, or the reader's own tag named "term". */
export function keepTagId(tags: Tag[]): string {
  const ids = termTagIds(tags);
  return ids.has(TERM_TAG_ID) ? TERM_TAG_ID : ([...ids][0] ?? TERM_TAG_ID);
}

/** Keep (spec B4): a `term` mark of the reader's own on this occurrence. Its anchor is read from the paper; no AI
 *  text goes into it. */
export async function keepTerm(paperId: string, at: PageRect, tags: Tag[]): Promise<Highlight> {
  const selection = await api.postText(paperId, [at], false, "text");
  return { id: newId("h"), tags: [keepTagId(tags)], anchor: selection.highlight };
}

export const keptTerms = (highlights: Highlight[]) => highlights.map(termOf);
