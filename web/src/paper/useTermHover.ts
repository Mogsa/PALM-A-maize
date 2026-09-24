import { useRef, type RefObject } from "react";
import type { Board, Source } from "../model/types";
import { useTags } from "../state/TagsProvider";
import { markAt, pagePoint } from "./hit";
import { pageFrames } from "./selection";
import { isTerm, termTagIds } from "./term";
import type { HoverCard } from "./useHoverCard";

/** A term's card on the paper (D27). Marks take no pointer events, so a text drag can start on them; the mouse is
 *  hit-tested against the term marks instead, and the card opens when it comes onto one, as a link's does. */
export function useTermHover(container: RefObject<HTMLElement | null>, source: Source, board: Board, hover: HoverCard) {
  const terms = termTagIds(useTags().tags);
  const over = useRef<string | null>(null);

  const leave = () => { if (over.current) { over.current = null; hover.depart(); } };
  const onMouseMove = (event: React.MouseEvent) => {
    const marks = board.highlights.filter((h) => isTerm(h, terms));
    if (!container.current || !marks.length || event.buttons) return leave();   // a drag is selecting, not asking
    const point = pagePoint(event.clientX, event.clientY, pageFrames(container.current, source));
    const mark = point && markAt(point, marks);
    if (!mark) return leave();
    if (mark.id === over.current) return;
    over.current = mark.id;
    const at = new DOMRect(event.clientX, event.clientY, 0, 0);
    hover.arrive(mark.id, () => hover.open(mark.id, at, { kind: "term", highlightId: mark.id }));
  };
  return { onMouseMove, onMouseLeave: leave };
}
