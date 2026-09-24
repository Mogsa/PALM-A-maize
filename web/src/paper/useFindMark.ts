import { useCallback, useMemo, useRef, type RefObject } from "react";
import { markMatches } from "./find";

/** A find hit to mark: the words, on one page's text layer. */
export type FindMark = { page: number; query: string };

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
    container.current?.querySelector<HTMLElement>(`.react-pdf__Page[data-page-number="${findMark.page + 1}"] .find-hit`)
      ?.scrollIntoView({ block: "center" });
  }, [container, findMark]);
  return (page: number) => (findMark?.page === page ? { customTextRenderer, onRenderTextLayerSuccess } : {});
}
