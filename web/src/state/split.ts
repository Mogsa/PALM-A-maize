import type { Dispatch } from "react";
import { api, CLIP_DPI } from "../api/client";
import type { BoardAction } from "../model/boardReducer";
import { firstLayout, splitIntoTray, templateLayout } from "../model/tray";
import type { Board, BoardNode, Source } from "../model/types";

export const CLIP_FAILED_MESSAGE = (count: number) =>
  `${count} figure image${count === 1 ? "" : "s"} could not be made. Cut ${count === 1 ? "it" : "them"} again from the paper.`;

/** Off for now (owner, 29 Sep 2026): a new board opens with the template only. "Add missing sections" in ⌘K
 *  still fills a tray on demand. Set true to bring back D15's first open. */
const TRAY_ON_FIRST_OPEN = false;

/** First open (D15): every section and figure from the server, and the template, laid out. Writes nothing. */
export async function planFirstOpen(paperId: string, source: Source): Promise<BoardNode[]> {
  if (!TRAY_ON_FIRST_OPEN) return templateLayout(await api.getTemplate());
  const [{ nodes: drafts }, template] = await Promise.all([api.split(paperId), api.getTemplate()]);
  return firstLayout(drafts, template, source);
}

/** Split (D16) reads the board as saved, so pending changes are saved first (addendum 6). */
export async function planSplit(paperId: string, source: Source, board: () => Board, flush: () => Promise<void>): Promise<BoardNode[]> {
  await flush();
  const { nodes: drafts } = await api.split(paperId);
  return drafts.length ? splitIntoTray(board(), drafts, source) : [];
}

/** Clip files are outside undo (addendum 4.7, 4.9): each lands with setFigureClip. Returns the ids that failed. */
export async function storeFigureClips(paperId: string, nodes: BoardNode[], dispatch: Dispatch<BoardAction>): Promise<string[]> {
  const failed: string[] = [];
  for (const node of nodes) {
    if (node.type !== "figure" || node.data.clip) continue;
    try {
      const { clip, clip_size } = await api.putClip(paperId, node.id, node.data.region.rects[0], CLIP_DPI);
      dispatch({ type: "setFigureClip", id: node.id, clip, clip_size });
    } catch (error) {
      console.error(`Could not store the clip for ${node.id}`, error);
      failed.push(node.id);
    }
  }
  return failed;
}
