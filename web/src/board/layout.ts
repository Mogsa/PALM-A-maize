import type { BoardNode } from "../model/types";

export const MARGIN = 40;
export const GAP = 24;
export const CHUNK_WIDTH = 320;
/** The height a chunk is assumed to have before React Flow has measured it: the head (about 26 px)
 *  plus a full body (`.node-body` max-height 320 px, 12 px padding) and the node border. A chunk is
 *  never taller than this unless the reader resizes it, which stores `height`; an estimate that is too
 *  big only leaves a gap, one too small stacks the next chunk on top of this one. */
export const DEFAULT_CHUNK_HEIGHT = 360;

/** A new chunk lands in a column on the left, under the lowest top-level node. A node's height is its
 *  stored one (the reader sized it), else what React Flow measured (runtime only, never saved), else the
 *  estimate above. The tool never rearranges anything after that (SPEC.md section 4). */
export function nextChunkPosition(nodes: BoardNode[]): { x: number; y: number } {
  const topLevel = nodes.filter((n) => !n.parentId);
  if (!topLevel.length) return { x: MARGIN, y: MARGIN };
  const bottom = Math.max(...topLevel.map((n) => n.position.y + (n.height ?? n.measured?.height ?? DEFAULT_CHUNK_HEIGHT)));
  return { x: MARGIN, y: bottom + GAP };
}
