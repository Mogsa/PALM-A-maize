import type { XY } from "../model/reparent";

/** The drag's own type: only a drag begun on selected words of ours is a cut. */
export const CUT_DRAG_TYPE = "application/x-paperboard-cut";
/** What a drop does: cut the dragged words and place the piece at `at`, in board coordinates. */
export type CutDrop = (at: XY) => Promise<void>;

// The paper and the board are separate components that share nothing but this: the drag's start offers a cut, and the
// board's drop takes it. Taken once, so a later drop can never replay it (Review Focus 4).
let offered: CutDrop | null = null;

export function offerCut(drop: CutDrop): void { offered = drop; }
export function withdrawCut(): void { offered = null; }
export function takeCut(): CutDrop | null {
  const drop = offered;
  offered = null;
  return drop;
}
export function isCutDrag(types: readonly string[]): boolean { return types.includes(CUT_DRAG_TYPE); }
