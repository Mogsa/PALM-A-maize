import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { api } from "../api/client";
import type { Source } from "../model/types";
import { cardRect, firstEntry, resolveLink, type LinkDocument, type LinkTarget } from "./citation";

/** A pass over a link on the way elsewhere opens nothing. */
export const CARD_OPEN_DELAY_MS = 250;
/** Time to move the mouse from the link onto its card. */
export const CARD_CLOSE_DELAY_MS = 250;
/** The paper's own internal links, as pdf.js's annotation layer draws them. */
const INTERNAL_LINK = "section.linkAnnotation[data-internal-link]";

export type OpenCard = { link: Element; at: DOMRect; target: LinkTarget; text: string | null; failed: boolean };

const linkOf = (target: EventTarget | null) => (target instanceof Element ? target.closest(INTERNAL_LINK) : null);

/** Citation cards (D24): hovering or focusing an internal link shows the words at its destination, read once per
 *  destination by the existing `POST /text`. Returns the open card, the paper's handlers and the card's own. */
export function useCitationCard(pdf: RefObject<LinkDocument | null>, source: Source, paperId: string) {
  const [card, setCard] = useState<OpenCard | null>(null);
  const words = useRef(new Map<string, Promise<string>>());
  const hovered = useRef<Element | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  const later = (then: () => void, ms: number) => { clear(); timer.current = setTimeout(then, ms); };
  useEffect(() => clear, []);
  const close = useCallback(() => { clear(); hovered.current = null; setCard((c) => (c ? null : c)); }, []);

  const wordsAt = (target: LinkTarget): Promise<string> => {
    const rect = cardRect(target.dest, source.pages[target.pageIndex], source.regions);
    if (!rect) return Promise.reject(new Error("not an explicit destination"));
    const key = `${target.pageIndex}:${rect.join(",")}`;
    const cached = words.current.get(key);
    if (cached) return cached;
    const read = api.postText(paperId, [{ page: target.pageIndex, rect }], false, "text").then((s) => firstEntry(s.text));
    read.catch(() => words.current.delete(key));   // a failed read is tried again on the next hover
    words.current.set(key, read);
    return read;
  };

  const show = async (link: Element) => {
    const pageNumber = Number(link.closest(".react-pdf__Page")?.getAttribute("data-page-number"));
    const id = link.getAttribute("data-annotation-id");
    if (!pdf.current || !id || !pageNumber) return;
    const mine = (c: OpenCard | null) => c?.link === link;
    try {
      const target = await resolveLink(pdf.current, pageNumber, id);
      if (!target || !source.pages[target.pageIndex] || hovered.current !== link) return;
      setCard({ link, at: link.getBoundingClientRect(), target, text: null, failed: false });
      const text = await wordsAt(target);
      setCard((c) => (mine(c) ? { ...c!, text } : c));
    } catch (failure) {
      console.error("Could not read the words at a link's destination", failure);
      setCard((c) => (mine(c) ? { ...c!, failed: true } : c));
    }
  };

  const paper = {
    onMouseOver: (e: React.MouseEvent) => {
      const link = linkOf(e.target);
      if (!link) return;
      if (link === hovered.current) return clear();
      hovered.current = link;
      setCard((c) => (c && c.link !== link ? null : c));   // another link's card never shows by this one
      later(() => void show(link), CARD_OPEN_DELAY_MS);
    },
    onMouseOut: (e: React.MouseEvent) => {
      const link = linkOf(e.target);
      if (link && linkOf(e.relatedTarget) !== link) later(close, CARD_CLOSE_DELAY_MS);
    },
    onFocus: (e: React.FocusEvent) => {
      const link = linkOf(e.target);
      if (!link) return;
      clear();
      hovered.current = link;
      void show(link);
    },
    onBlur: (e: React.FocusEvent) => { if (linkOf(e.target)) later(close, CARD_CLOSE_DELAY_MS); },
  };
  /** The paper moved: the open card no longer sits by its link. A card waiting to open for another link still opens. */
  const hide = () => {
    if (!card) return;
    if (hovered.current === card.link) { clear(); hovered.current = null; }
    setCard(null);
  };
  const cardHandlers = { onEnter: clear, onLeave: () => later(close, CARD_CLOSE_DELAY_MS), onClose: close };
  return { card, paper, cardHandlers, close, hide };
}
