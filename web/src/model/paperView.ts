import { samePaperScroll } from "../paper/scroll";
import type { PaperScroll, View, Viewport } from "./types";

/** How the reader left this paper: which view, where each view was, the tag filter, and the split between the paper
 *  and the board in the "both" view. Not part of the board: saved at `/view` with no version, never undone. */
export type PaperViewState = {
  view: View;
  paper_scroll: PaperScroll | null;
  active_tags: string[];
  viewport: Viewport | null;
  /** The paper's share of the width in the "both" view, 0.15 to 0.85. */
  split: number;
};

export const DEFAULT_SPLIT = 0.4;
export const defaultPaperView: PaperViewState = { view: "paper", paper_scroll: null, active_tags: [], viewport: null, split: DEFAULT_SPLIT };

const sameViewport = (a: Viewport | null, b: Viewport | null) =>
  a === b || (a !== null && b !== null && a.x === b.x && a.y === b.y && a.zoom === b.zoom);
const sameTags = (a: string[], b: string[]) => a.length === b.length && a.every((t, i) => t === b[i]);

function unchanged(current: PaperViewState, patch: Partial<PaperViewState>): boolean {
  return (patch.view === undefined || patch.view === current.view)
    && (patch.split === undefined || patch.split === current.split)
    && (patch.active_tags === undefined || sameTags(patch.active_tags, current.active_tags))
    && (patch.viewport === undefined || sameViewport(patch.viewport, current.viewport))
    && (patch.paper_scroll === undefined || samePaperScroll(patch.paper_scroll, current.paper_scroll));
}

/** The view with `patch` applied; the same object when nothing would change, so a restore event saves nothing. */
export function withView(current: PaperViewState, patch: Partial<PaperViewState>): PaperViewState {
  return unchanged(current, patch) ? current : { ...current, ...patch };
}
