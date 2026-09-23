import { GAP, nextChunkPosition } from "../board/layout";
import { highlightsIn } from "./geometry";
import { absoluteIn, type XY } from "./reparent";
import type { Board, BoardNode } from "./types";

export type Spot = { position: XY };
export const FALLBACK_WIDTH = 320;

/** To the right of a node, at the top level. Never inside the node's group: a child outside its group's box
 *  would break the drop rule (addendum 4.2). */
export function spotBeside(nodes: BoardNode[], id: string): Spot | null {
  const node = nodes.find((n) => n.id === id);
  if (!node) return null;
  const at = absoluteIn(nodes)(id);
  const width = node.width ?? node.measured?.width ?? node.initialWidth ?? FALLBACK_WIDTH;
  return { position: { x: at.x + width + GAP, y: at.y } };
}

/** Where a note written on a mark lands on the board: beside the first chunk holding the mark, else under everything. */
export function spotForNoteOn(board: Board, highlightId: string): Spot {
  const mark = board.highlights.find((h) => h.id === highlightId);
  const holder = mark && board.nodes.find((n) => (n.type === "chunk" || n.type === "figure") && highlightsIn([mark], n.data.region).length > 0);
  return (holder && spotBeside(board.nodes, holder.id)) || { position: nextChunkPosition(board.nodes) };
}
