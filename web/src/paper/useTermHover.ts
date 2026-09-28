import { useRef, type RefObject } from "react";
import { aiTermAt } from "../ai/terms";
import type { AiFile } from "../ai/types";
import type { Board, Source } from "../model/types";
import { useTags } from "../state/TagsProvider";
import { markAt, pagePoint } from "./hit";
import { pageFrames } from "./selection";
import { isTerm, termTagIds } from "./term";
import type { HoverCard } from "./useHoverCard";

/** A term's card on the paper (D27). Marks take no pointer events, so a text drag can start on them; the mouse is
 *  hit-tested against the term marks instead, and the card opens when it comes onto one, as a link's does. An AI
 *  underline (spec B4) opens the AI term card when there is no mark under the point. */
export function useTermHover(container: RefObject<HTMLElement | null>, source: Source, board: Board, hover: HoverCard, ai: AiFile | null = null) {
  const terms = termTagIds(useTags().tags);
  const over = useRef<string | null>(null);

  const leave = () => { if (over.current) { over.current = null; hover.depart(); } };
  const onMouseMove = (event: React.MouseEvent) => {
    const marks = board.highlights.filter((h) => isTerm(h, terms));
    if (!container.current || (!marks.length && !ai) || event.buttons) return leave();   // a drag is selecting, not asking
    const point = pagePoint(event.clientX, event.clientY, pageFrames(container.current, source));
    const mark = point && markAt(point, marks);
    const line = !mark && point ? aiTermAt(ai, marks, point) : null;
    if (!mark && !line) return leave();
    const key = mark ? mark.id : `${line!.term}@${line!.at.page}:${line!.at.rect.join(",")}`;
    if (key === over.current) return;
    over.current = key;
    const at = new DOMRect(event.clientX, event.clientY, 0, 0);
    hover.arrive(key, () => hover.open(key, at, mark ? { kind: "term", highlightId: mark.id } : { kind: "aiTerm", term: line!.term, at: line!.at }));
  };
  return { onMouseMove, onMouseLeave: leave };
}
