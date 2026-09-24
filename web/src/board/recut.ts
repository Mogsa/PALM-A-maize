import type { Reshape } from "../model/boardReducer";
import { newId } from "../model/ids";
import type { ChunkNode, JoinResult, Piece } from "../model/types";
import { CHUNK_WIDTH, GAP } from "./layout";

/** A piece takes over a chunk's text: its own region and blocks, sized to its text again (addendum 4.10). */
function refilled(chunk: ChunkNode, piece: Piece, tags = chunk.data.tags, sourceId = chunk.data.source_id): ChunkNode {
  return { ...chunk, height: undefined, data: { ...chunk.data, region: piece.data.region, blocks: piece.data.blocks, user_sized: false, tags, source_id: sourceId } };
}

/** Split here or Cut out on the board: the first piece is the chunk itself, keeping its id, place, parent, width, tags,
 *  collapse and source_id, so its connections stay; each later piece is a new chunk to the right of the one before,
 *  GAP apart, with the same parent, width, tags and collapse and no source_id. Null when there is nothing to divide. */
export function recutPlan(chunk: ChunkNode, pieces: Piece[]): Reshape | null {
  if (pieces.length < 2) return null;
  const width = chunk.width ?? CHUNK_WIDTH;
  const add = pieces.slice(1).map((piece, i): ChunkNode => ({
    id: newId("n"), type: "chunk", width, ...(chunk.parentId ? { parentId: chunk.parentId } : {}),
    position: { x: chunk.position.x + (i + 1) * (width + GAP), y: chunk.position.y },
    data: { tags: [...chunk.data.tags], collapsed: chunk.data.collapsed, region: piece.data.region, blocks: piece.data.blocks, user_sized: false },
  }));
  return { keep: refilled(chunk, pieces[0]), add };
}

/** Join on the board: `chunks` in the order their regions were sent. The one first in paper order is kept, with the
 *  joined region and blocks, every chunk's tags in paper order, and the first source_id in paper order; the others go,
 *  and the reducer moves their connections to it. */
export function joinPlan(chunks: ChunkNode[], { node, order }: JoinResult): Reshape {
  const inOrder = order.map((i) => chunks[i]);
  const tags = [...new Set(inOrder.flatMap((c) => c.data.tags))];
  const sourceId = inOrder.map((c) => c.data.source_id).find(Boolean) ?? null;
  return { keep: refilled(inOrder[0], node, tags, sourceId), removeIds: inOrder.slice(1).map((c) => c.id) };
}
