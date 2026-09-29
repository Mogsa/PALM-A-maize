import { notesConnectedTo } from "../model/links";
import type { Board, Highlight, Source, Tag } from "../model/types";
import { rankFindHits, sentenceAround } from "./definition";
import { findInPaper } from "./find";

/** The preset tag a reader puts on a word they want defined (D27), as `t-question` marks a question. */
export const TERM_TAG_ID = "t-term";
const TERM_NAME = "term";

/** The tags that mark a term: the preset, however renamed, and a tag of the reader's own named "term" (a tags.json
 *  written before D27 has no preset). */
export function termTagIds(tags: Tag[]): Set<string> {
  return new Set(tags.filter((t) => t.id === TERM_TAG_ID || t.name.trim().toLowerCase() === TERM_NAME).map((t) => t.id));
}

export const isTerm = (highlight: Highlight, termIds: ReadonlySet<string>) => highlight.tags.some((id) => termIds.has(id));

/** A term as marked, on one line. */
export const termOf = (highlight: Highlight) => highlight.anchor.quote.exact.replace(/\s+/g, " ").trim();

/** The first note of the reader's own connected to the mark: their definition. An AI's note is not theirs (D14). */
const readerNote = (board: Board, highlight: Highlight) =>
  notesConnectedTo(board, [highlight.id]).find((n) => (n.data.origin ?? "reader") === "reader")?.id ?? null;

export type TermPart =
  | { kind: "note"; noteId: string }
  | { kind: "definition"; page: number; sentence: string; section: string | null };

/** What a term's card shows, in order (D27): the reader's own definition, then the paper's likely definition by
 *  Tier 1's rules (D25). A part with nothing in it is left out. */
export function termCard(board: Board, source: Source, highlight: Highlight): TermPart[] {
  const parts: TermPart[] = [];
  const noteId = readerNote(board, highlight);
  if (noteId) parts.push({ kind: "note", noteId });
  const best = rankFindHits(findInPaper(termOf(highlight), source), source)[0];
  if (best?.likely) {
    const { hit } = best;
    const { before, after } = sentenceAround(source.page_text.find((p) => p.page === hit.page)?.text ?? "", hit.start, hit.end);
    parts.push({ kind: "definition", page: hit.page, sentence: `${before}${hit.match}${after}`.trim(), section: hit.section?.title ?? null });
  }
  return parts;
}

export type GlossaryEntry = { highlight: Highlight; term: string; noteId: string | null };

/** Every term mark on the board, alphabetically by term, each with the reader's definition's note, if any. */
export function glossary(board: Board, termIds: ReadonlySet<string>): GlossaryEntry[] {
  return board.highlights
    .filter((h) => isTerm(h, termIds))
    .map((highlight) => ({ highlight, term: termOf(highlight), noteId: readerNote(board, highlight) }))
    .sort((a, b) => a.term.localeCompare(b.term, undefined, { sensitivity: "base" }));
}
