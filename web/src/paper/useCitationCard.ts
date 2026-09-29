import type { RefObject } from "react";
import type { PageRect, Source } from "../model/types";
import { cardRect, clipAt, firstEntry, resolveLink, type LinkDocument, type LinkTarget } from "./citation";
import { destinationTop } from "./links";
import type { HoverCard } from "./useHoverCard";
import { useWordsUnder } from "./useWordsUnder";

/** The paper's own internal links, as pdf.js's annotation layer draws them. */
const INTERNAL_LINK = "section.linkAnnotation[data-internal-link]";

const linkOf = (target: EventTarget | null) => (target instanceof Element ? target.closest(INTERNAL_LINK) : null);

/** Where Go there goes: the destination's page and height, as following the link does (D10). */
const goTo = (target: LinkTarget, source: Source): PageRect => {
  const top = destinationTop(target.dest, source.pages[target.pageIndex].height) ?? 0;
  return { page: target.pageIndex, rect: [0, top, 0, top] };
};

/** Citation cards (D24): hovering or focusing an internal link shows the words at its destination, read once per
 *  destination by the existing `POST /text`; a destination on a figure, table or formula shows its clip (D26).
 *  Returns the paper's handlers; the card is `hover`'s. */
export function useCitationCard(pdf: RefObject<LinkDocument | null>, source: Source, paperId: string, hover: HoverCard) {
  const wordsUnder = useWordsUnder(paperId);
  const wordsAt = (target: LinkTarget): Promise<string> => {
    const rect = cardRect(target.dest, source.pages[target.pageIndex], source.regions);
    return rect ? wordsUnder({ page: target.pageIndex, rect }).then(firstEntry) : Promise.reject(new Error("not an explicit destination"));
  };

  const show = async (link: Element) => {
    const pageNumber = Number(link.closest(".react-pdf__Page")?.getAttribute("data-page-number"));
    const id = link.getAttribute("data-annotation-id");
    if (!pdf.current || !id || !pageNumber) return;
    try {
      const target = await resolveLink(pdf.current, pageNumber, id);
      const page = target && source.pages[target.pageIndex];
      if (!target || !page) return;
      const go = goTo(target, source);
      const clip = clipAt(target.dest, page, source);
      if (clip) return hover.open(link, link.getBoundingClientRect(), { kind: "words", text: clip.text, clip: clip.clip, failed: false, go });
      hover.open(link, link.getBoundingClientRect(), { kind: "words", text: null, clip: null, failed: false, go });
      const text = await wordsAt(target);
      hover.update(link, (c) => (c.kind === "words" ? { ...c, text } : c));
    } catch (failure) {
      console.error("Could not read the words at a link's destination", failure);
      hover.update(link, (c) => (c.kind === "words" ? { ...c, failed: true } : c));
    }
  };

  return {
    onMouseOver: (e: React.MouseEvent) => {
      const link = linkOf(e.target);
      if (link) hover.arrive(link, () => void show(link));
    },
    onMouseOut: (e: React.MouseEvent) => {
      const link = linkOf(e.target);
      if (link && linkOf(e.relatedTarget) !== link) hover.depart();
    },
    onFocus: (e: React.FocusEvent) => {
      const link = linkOf(e.target);
      if (link) hover.arrive(link, () => void show(link), true);
    },
    onBlur: (e: React.FocusEvent) => { if (linkOf(e.target)) hover.depart(); },
  };
}
