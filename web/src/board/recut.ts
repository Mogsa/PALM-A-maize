import type { Reshape } from "../model/boardReducer";
import { newId } from "../model/ids";
import type { XY } from "../model/reparent";
import type { ChunkNode, JoinResult, Piece, QuoteSelector } from "../model/types";
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

const squeeze = (text: string) => text.replace(/\s+/g, " ").trim();
/** How much of the selection is matched against a piece's text: enough to tell pieces apart. */
const MATCH_CHARS = 40;

/** Which of Cut out's pieces holds the selected words: the one whose text holds them, else the middle of three
 *  (before, selection, after), else the first (a selection at the chunk's start or end). */
export function pieceIndexOf(pieces: Piece[], quote: QuoteSelector): number {
  const needle = squeeze(quote.exact).slice(0, MATCH_CHARS);
  const found = pieces.findIndex((p) => squeeze(p.data.blocks.map((b) => (b.kind === "text" ? b.text : "")).join(" ")).includes(needle));
  if (found >= 0) return found;
  return pieces.length === 3 ? 1 : 0;
}

/** The plan with piece `index` moved to `at` (board coordinates), out of any group: a drop lands where it is let go. */
export function placePiece(plan: Reshape, index: number, at: XY): Reshape {
  const moved = (node: ChunkNode): ChunkNode => {
    const { parentId: _parent, ...rest } = node;   // eslint-disable-line @typescript-eslint/no-unused-vars
    return { ...rest, position: at };
  };
  if (index === 0) return { ...plan, keep: moved(plan.keep) };
  return { ...plan, add: (plan.add ?? []).map((n, i) => (i === index - 1 ? moved(n) : n)) };
}
