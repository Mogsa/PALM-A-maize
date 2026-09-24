import { sectionAt, sectionRef } from "../model/sections";
import type { Board, NoteOrigin, PageRect, Source } from "../model/types";

export const CHIP_WORDS = 3;
export const MARGIN_ITEM_PX = 26;
export const MARGIN_GAP_PX = 6;

export type JumpTarget = { paper: PageRect } | { board: string };
export type MarginItem =
  | { kind: "note"; key: string; noteId: string; origin: NoteOrigin }
  | { kind: "chip"; key: string; label: string; target: JumpTarget };

export function firstWords(text: string, count = CHIP_WORDS): string {
  return text.trim().split(/\s+/).slice(0, count).join(" ");
}

function chip(key: string, source: Source, at: PageRect, text: string): MarginItem {
  const section = sectionAt(source, at);
  return { kind: "chip", key, label: `→ ${section ? `${sectionRef(section)} ` : ""}${firstWords(text)}`, target: { paper: at } };
}

/** The margin item for the other end of an edge, or null when that end no longer exists. */
function otherEnd(board: Board, source: Source, id: string, key: string): MarginItem | null {
  const mark = board.highlights.find((h) => h.id === id);
  if (mark) return chip(key, source, mark.anchor.rects[0], mark.anchor.quote.exact);
  const node = board.nodes.find((n) => n.id === id);
  if (!node) return null;
  if (node.type === "note") return { kind: "note", key, noteId: node.id, origin: node.data.origin ?? "reader" };
  if (node.type === "group") return { kind: "chip", key, label: `→ ${node.data.name || "a group"}`, target: { board: node.id } };
  return chip(key, source, node.data.region.rects[0], node.data.region.start.exact);
}

/** Every connection with an end on this mark, whether or not the board draws it: a note as the note, anything else as a
 *  chip naming the other end, in edge order. An end that no longer exists is skipped. */
export function marginItems(board: Board, source: Source, highlightId: string): MarginItem[] {
  return board.edges.flatMap((edge) => {
    const other = edge.from === highlightId ? edge.to : edge.to === highlightId ? edge.from : null;
    const item = other ? otherEnd(board, source, other, edge.id) : null;
    return item ? [item] : [];
  });
}

/** Tops in ascending order, each pushed down to clear the one before it. */
export function stackTops(tops: number[], step = MARGIN_ITEM_PX + MARGIN_GAP_PX): number[] {
  let floor = -Infinity;
  return tops.map((top) => { const at = Math.max(top, floor); floor = at + step; return at; });
}
