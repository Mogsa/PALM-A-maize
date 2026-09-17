import type { BoardNode } from "../model/types";

export const MARGIN = 40;
export const GAP = 24;
export const CHUNK_WIDTH = 320;
export const DEFAULT_CHUNK_HEIGHT = 120;

/** A new chunk lands in a column on the left, under the lowest top-level node. The
 *  tool never rearranges anything after that (SPEC.md section 4). */
export function nextChunkPosition(nodes: BoardNode[]): { x: number; y: number } {
  const topLevel = nodes.filter((n) => !n.parentId);
  if (!topLevel.length) return { x: MARGIN, y: MARGIN };
  const bottom = Math.max(...topLevel.map((n) => n.position.y + (n.height ?? n.initialHeight ?? DEFAULT_CHUNK_HEIGHT)));
  return { x: MARGIN, y: bottom + GAP };
}
