import type { PageRect } from "../model/types";
import type { AiFile, Ground } from "./types";

/** One colour per template slot, by its index (the values live in tokens.css); past the ninth they repeat. */
export const SLOT_COLOURS = Array.from({ length: 9 }, (_, i) => `var(--slot-${i})`);
export const slotColour = (index: number) => SLOT_COLOURS[index % SLOT_COLOURS.length];

/** A sentence of the paper's own that answers a slot (spec: key sentences). `lines` may be empty: then it is not
 *  drawn, and a jump goes to `at`, the span it is in. */
export type KeySentence = { slot: string; colour: string; quote: string; page: number; lines: PageRect[]; at: PageRect | null };
export type KeySentenceGroup = { slot: string; colour: string; sentences: KeySentence[] };

function sentence(slot: string, colour: string, g: Ground): KeySentence | null {
  const lines = g.lines ?? [];
  const page = lines[0]?.page ?? g.at?.page;
  return page === undefined ? null : { slot, colour, quote: g.quote, page, lines, at: g.at };
}

/** The pass's key sentences grouped by slot in the template's order; a slot the template no longer has (edited since
 *  the pass) comes after, so nothing the AI found is hidden. Slots with none are left out. */
export function keySentences(ai: AiFile | null, slotNames: string[]): KeySentenceGroup[] {
  const where = ai?.reader?.where_to_look ?? [];
  const order = [...slotNames, ...where.map((s) => s.slot).filter((s) => !slotNames.includes(s))];
  return order.flatMap((slot, i) => {
    const colour = slotColour(i);
    const sentences = where.filter((s) => s.slot === slot)
      .flatMap((s) => s.spans.map((g) => sentence(slot, colour, g)).filter((k): k is KeySentence => k !== null));
    return sentences.length ? [{ slot, colour, sentences }] : [];
  });
}
