import { useCallback, useMemo, useRef, type RefObject } from "react";
import { markMatches } from "./find";

/** A find hit to mark: the words, on one page's text layer, and which of the page's matches was picked. */
export type FindMark = { page: number; query: string; nth: number };

/** The props that mark a find hit on one page's text layer, then scroll the mark into view once.
 *  Both callbacks keep their identity until the hit changes: react-pdf redraws a text layer whenever
 *  either changes, which would wipe a selection on every board change. */
export function useFindMark(container: RefObject<HTMLElement | null>, findMark: FindMark | null) {
  const revealed = useRef<FindMark | null>(null);
  const customTextRenderer = useMemo(
    () => (findMark ? ({ str }: { str: string }) => markMatches(str, findMark.query) : undefined), [findMark]);
  const onRenderTextLayerSuccess = useCallback(() => {
    if (!findMark || revealed.current === findMark) return;
    revealed.current = findMark;
    const marks = container.current?.querySelectorAll<HTMLElement>(`.react-pdf__Page[data-page-number="${findMark.page + 1}"] .find-hit`);
    // Text-layer items can split a match, so the count may drift; the last mark is the nearest fallback.
    const picked = marks?.[findMark.nth] ?? marks?.[marks.length - 1];
    picked?.classList.add("current");
    picked?.scrollIntoView({ block: "center" });
  }, [container, findMark]);
  return (page: number) => (findMark?.page === page ? { customTextRenderer, onRenderTextLayerSuccess } : {});
}
