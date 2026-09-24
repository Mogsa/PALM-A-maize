import type { QuoteSelector } from "../model/types";

/** Characters of the card's text either side of a selection, as the server's CONTEXT_CHARS (addendum 5.1). */
export const QUOTE_CONTEXT = 32;
/** A chunk's text blocks on a card, in reading order (ChunkBody). */
export const CARD_TEXT = "p.block-text";

/** A place in a card's text: which text block, and how many characters into it. */
export type CardPoint = { para: number; offset: number };
/** Words selected on one card, as the chunk routes take them (addendum 4.10), and where to show the popover. */
export type CardSelection = { nodeId: string; quote: QuoteSelector; at: DOMRect };

/** The quote for a selection from `start` to `end` in a card's text blocks, joined by a line break: the words exactly
 *  as the card shows them, trimmed, with up to QUOTE_CONTEXT characters either side. Null when only whitespace is
 *  selected. */
export function quoteAround(texts: string[], start: CardPoint, end: CardPoint): QuoteSelector | null {
  const joined = texts.join("\n");
  const at = (p: CardPoint) => texts.slice(0, p.para).reduce((sum, t) => sum + t.length + 1, 0) + p.offset;
  let s = at(start);
  let e = at(end);
  while (s < e && /\s/.test(joined[s])) s++;
  while (e > s && /\s/.test(joined[e - 1])) e--;
  if (s >= e) return null;
  return { exact: joined.slice(s, e), prefix: joined.slice(Math.max(0, s - QUOTE_CONTEXT), s), suffix: joined.slice(e, e + QUOTE_CONTEXT) };
}

/** The text block holding a DOM position, or null when it is outside every one. */
function paraOf(node: Node): HTMLElement | null {
  const element = node instanceof Element ? node : node.parentElement;
  return element?.closest<HTMLElement>(CARD_TEXT) ?? null;
}

/** How many characters of `para`'s text come before a DOM position inside it. */
function offsetIn(para: HTMLElement, node: Node, offset: number): number {
  const before = document.createRange();
  before.selectNodeContents(para);
  before.setEnd(node, offset);
  return before.toString().length;
}

/** The current selection when both its ends are in the text blocks of one card inside `root`; otherwise null. */
export function readCardSelection(root: HTMLElement): CardSelection | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  const first = paraOf(range.startContainer);
  const last = paraOf(range.endContainer);
  const card = first?.closest<HTMLElement>(".react-flow__node[data-id]");
  if (!first || !last || !card || !root.contains(card) || last.closest(".react-flow__node") !== card) return null;
  const paras = Array.from(card.querySelectorAll<HTMLElement>(CARD_TEXT));
  const quote = quoteAround(paras.map((p) => p.textContent ?? ""),
    { para: paras.indexOf(first), offset: offsetIn(first, range.startContainer, range.startOffset) },
    { para: paras.indexOf(last), offset: offsetIn(last, range.endContainer, range.endOffset) });
  if (!quote) return null;
  const at = typeof range.getBoundingClientRect === "function" ? range.getBoundingClientRect() : last.getBoundingClientRect();
  return { nodeId: card.dataset.id!, quote, at };
}
