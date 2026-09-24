import { useEffect, useLayoutEffect, useState, type RefObject } from "react";
import { useUpdateNodeInternals } from "@xyflow/react";

/** Where a handle sits when its mark is not painted in the body: level with the card's title. */
export const HEAD_MIDDLE_PX = 15;

/** The middle of each mark's first painted line, in px from the card's top, clamped into the visible body. Layout px
 *  (offsetTop), which React Flow's zoom does not scale; the body is position: relative, the card's wrapper absolute. */
export function markOffsets(body: HTMLElement): Map<string, number> {
  const out = new Map<string, number>();
  const top = body.offsetTop;
  const bottom = top + body.clientHeight;
  for (const el of Array.from(body.querySelectorAll<HTMLElement>("mark[data-highlight-id]"))) {
    const id = el.dataset.highlightId!;
    if (out.has(id)) continue;
    const y = top + el.offsetTop - body.scrollTop + el.offsetHeight / 2;
    out.set(id, Math.min(Math.max(y, top), bottom));
  }
  return out;
}

function sameOffsets(a: ReadonlyMap<string, number>, b: ReadonlyMap<string, number>): boolean {
  if (a.size !== b.size) return false;
  for (const [key, value] of a) if (b.get(key) !== value) return false;
  return true;
}

/** Keeps the offsets current as the body resizes or scrolls, and tells React Flow the handles moved. */
export function useMarkOffsets(bodyRef: RefObject<HTMLElement | null>, nodeId: string, collapsed: boolean, contentKey: unknown): ReadonlyMap<string, number> {
  const updateNodeInternals = useUpdateNodeInternals();
  const [offsets, setOffsets] = useState<ReadonlyMap<string, number>>(() => new Map());
  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (collapsed || !body) { setOffsets((prev) => (prev.size ? new Map() : prev)); return; }
    const measure = () => { const next = markOffsets(body); setOffsets((prev) => (sameOffsets(prev, next) ? prev : next)); };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(body);
    body.addEventListener("scroll", measure);
    return () => { observer.disconnect(); body.removeEventListener("scroll", measure); };
  }, [bodyRef, collapsed, contentKey]);
  useEffect(() => { updateNodeInternals(nodeId); }, [offsets, nodeId, updateNodeInternals]);
  return offsets;
}
