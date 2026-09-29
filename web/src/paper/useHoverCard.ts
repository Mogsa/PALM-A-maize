import { useCallback, useEffect, useRef, useState } from "react";
import type { PageRect } from "../model/types";

/** A pass over a link on the way elsewhere opens nothing. */
export const CARD_OPEN_DELAY_MS = 250;
/** Time to move the mouse from the link onto its card. */
export const CARD_CLOSE_DELAY_MS = 250;

/** What a card shows: the paper's words (and a clip) at a link or reference, with where Go there goes (D24, D26); or
 *  a term's definitions, drawn from its mark (D27). `text` is null while the words are read. */
export type CardContent =
  | { kind: "words"; text: string | null; clip: PageRect | null; failed: boolean; go: PageRect }
  | { kind: "term"; highlightId: string }
  | { kind: "aiTerm"; term: string; at: PageRect | null };
/** `key` is the thing hovered: a link element, a reference element, a mark's id. */
export type OpenCard = { key: unknown; at: DOMRect; content: CardContent };

/** The timing every context card shares, in both views: open after a pause on a thing, at once on keyboard focus, close
 *  a moment after the mouse leaves both the thing and its card. One card at a time. */
export function useHoverCard() {
  const [card, setCard] = useState<OpenCard | null>(null);
  const hovered = useRef<unknown>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => { if (timer.current) clearTimeout(timer.current); timer.current = null; }, []);
  const later = useCallback((then: () => void, ms: number) => { clear(); timer.current = setTimeout(then, ms); }, [clear]);
  useEffect(() => clear, [clear]);
  const close = useCallback(() => { clear(); hovered.current = null; setCard((c) => (c ? null : c)); }, [clear]);

  /** The mouse arrived on `key` (or focus did, `now`): `show` runs once the pause is over. */
  const arrive = (key: unknown, show: () => void, now = false) => {
    if (!now && key === hovered.current) return clear();
    hovered.current = key;
    setCard((c) => (c && c.key !== key ? null : c));   // another thing's card never shows by this one
    if (now) { clear(); show(); } else later(show, CARD_OPEN_DELAY_MS);
  };
  const depart = () => later(close, CARD_CLOSE_DELAY_MS);
  /** Shows `content` for `key`, if the mouse is still on it. */
  const open = (key: unknown, at: DOMRect, content: CardContent) => {
    if (hovered.current === key) setCard({ key, at, content });
  };
  const update = (key: unknown, change: (content: CardContent) => CardContent) =>
    setCard((c) => (c && c.key === key ? { ...c, content: change(c.content) } : c));
  /** The view moved: the open card no longer sits by its thing. A card waiting to open for another thing still opens. */
  const hide = () => {
    if (!card) return;
    if (hovered.current === card.key) { clear(); hovered.current = null; }
    setCard(null);
  };
  const cardHandlers = { onEnter: clear, onLeave: depart, onClose: close };
  return { card, arrive, depart, open, update, close, hide, cardHandlers };
}

export type HoverCard = ReturnType<typeof useHoverCard>;
