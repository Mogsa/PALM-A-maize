import type { PageRect, Rect } from "../model/types";

/** `ai.json` as the server writes it (spec B3). Generated, never edited, never exported. */
export type Ground = { span: string; quote: string; at: PageRect | null };
export type AiTerm = { term: string; defined_in: Ground[]; explanation: string | null; grounds: Ground[]; occurrences: PageRect[] };
export type SlotSpans = { slot: string; spans: Ground[] };
export type ReaderPass = { model: string; made_at: string; terms: AiTerm[]; where_to_look: SlotSpans[] };
export type Definition = { model: string; explanation: string; grounds: Ground[] };
export type AiFile = { schema: 1; extracted_at: string; reader: ReaderPass | null; defined: Record<string, Definition> };
export type AiStatus = { status: "none" | "running" | "done" | "failed"; stale: boolean; message: string | null; ai: AiFile | null };

/** `definition` is where D25's likely definition is in `page_text`: offsets only, never text. */
export type DefineRequest = { word: string; page: number; rect: Rect; definition: { page: number; start: number; end: number } | null };
export type DefineLine = { delta: string } | { done: Definition } | { error: string };

export const NO_AI: AiStatus = { status: "none", stale: false, message: null, ai: null };
