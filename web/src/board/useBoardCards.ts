import type { Highlight, Source } from "../model/types";
import { referenceCard, resolveReference, type Reference } from "../paper/references";
import { isTerm } from "../paper/term";
import type { HoverCard } from "../paper/useHoverCard";
import { useWordsUnder } from "../paper/useWordsUnder";

/** A reference ChunkBody found and the paper can show (D26). */
export const REFERENCE = ".ref[data-ref-kind]";
const MARK = "mark[data-highlight-id]";

const closest = (target: EventTarget | null, selector: string) => (target instanceof Element ? target.closest(selector) : null);

/** Context cards on board cards: a reference in a chunk's text (D26), a mark tagged term (D27). The same card, the same
 *  timing, as the paper view's links. Returns the board's handlers; the card is `hover`'s. */
export function useBoardCards(source: Source, paperId: string, highlights: Highlight[], hover: HoverCard) {
  const read = useWordsUnder(paperId);

  const showReference = async (el: Element) => {
    const ref = { kind: el.getAttribute("data-ref-kind"), key: el.getAttribute("data-ref-key") } as Reference;
    const target = resolveReference(ref, source);
    if (!target) return;
    const at = el.getBoundingClientRect();
    if (target.kind === "equation") hover.open(el, at, { kind: "words", text: null, clip: null, failed: false, go: { page: target.regions[0].page, rect: [0, 0, 0, 0] } });
    try {
      const card = await referenceCard(target, read);
      if (card) return hover.open(el, at, { kind: "words", ...card, failed: false });
      hover.update(el, (c) => (c.kind === "words" ? { ...c, failed: true } : c));
    } catch (failure) {
      console.error("Could not read the formula a reference points at", failure);
      hover.update(el, (c) => (c.kind === "words" ? { ...c, failed: true } : c));
    }
  };

  /** The reference or term mark an event is on, and how to show its card. */
  const thing = (target: EventTarget | null): { el: Element; show: () => void } | null => {
    const ref = closest(target, REFERENCE);
    if (ref) return { el: ref, show: () => void showReference(ref) };
    const mark = closest(target, MARK);
    const id = mark?.getAttribute("data-highlight-id");
    const highlight = id ? highlights.find((h) => h.id === id) : undefined;
    if (!mark || !highlight || !isTerm(highlight)) return null;
    return { el: mark, show: () => hover.open(mark, mark.getBoundingClientRect(), { kind: "term", highlightId: highlight.id }) };
  };

  return {
    onMouseOver: (e: React.MouseEvent) => { const t = thing(e.target); if (t) hover.arrive(t.el, t.show); },
    onMouseOut: (e: React.MouseEvent) => {
      const t = thing(e.target);
      if (t && !t.el.contains(e.relatedTarget as Node | null)) hover.depart();
    },
    onFocus: (e: React.FocusEvent) => { const t = thing(e.target); if (t) hover.arrive(t.el, t.show, true); },
    onBlur: (e: React.FocusEvent) => { if (thing(e.target)) hover.depart(); },
  };
}
