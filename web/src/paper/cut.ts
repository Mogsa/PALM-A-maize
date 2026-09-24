import { api, CLIP_DPI } from "../api/client";
import { CHUNK_WIDTH, nextChunkPosition } from "../board/layout";
import { newId } from "../model/ids";
import type { Board, BoardNode, Selection, SelectionMode, Source } from "../model/types";
import { pairedFigure } from "./figures";

export type CutRequest = { mode: SelectionMode; sectionId?: string };

/** A cut becomes a piece (SPEC 4). A text cut is a chunk showing the server's blocks (D2); a rectangle cut is a figure
 *  whose clip is stored under its own new id (addendum 6, "area"). */
export async function makeCut(paperId: string, source: Source, board: Board, selection: Selection, request: CutRequest): Promise<BoardNode> {
  const id = newId("n");
  const position = nextChunkPosition(board.nodes);
  if (request.mode === "area") {
    const at = selection.rects[0];
    const { clip, clip_size } = await api.putClip(paperId, id, at, CLIP_DPI);
    const figure = pairedFigure(source, at);
    return { id, type: "figure", position, width: CHUNK_WIDTH,
      data: { tags: [], collapsed: false, region: selection.chunk, clip, clip_size, caption: figure?.caption ?? "", user_sized: false, source_id: figure?.id ?? null } };
  }
  return { id, type: "chunk", position, width: CHUNK_WIDTH,
    data: { tags: [], collapsed: false, region: selection.chunk, blocks: selection.blocks, user_sized: false, source_id: request.sectionId ?? null } };
}
