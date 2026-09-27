import { sectionRef } from "../model/sections";
import { findTray } from "../model/tray";
import type { AnchorState, Board, ChunkNode, FigureNode, Source } from "../model/types";

/** A reader's cut is named by this many of its first words. */
const NAME_WORDS = 3;

/** One piece's bracket on one page, in page points: from its first line to its last there. */
export type Bracket = {
  nodeId: string;
  top: number;
  bottom: number;
  /** Side by side with the pieces it overlaps: 0 is nearest the page. */
  lane: number;
  /** Still in the tray (grey), or placed on the board (coloured). */
  tray: boolean;
  /** The piece's short name, on the page where it starts; null where it only continues. */
  label: string | null;
  /** The piece goes on past this page. */
  continues: boolean;
  state: AnchorState;
};

type Piece = ChunkNode | FigureNode;

function shortName(piece: Piece, source: Source): string {
  if (piece.type === "figure") return source.figures.find((f) => f.id === piece.data.source_id)?.label ?? piece.data.caption.split(/[:.]/)[0] ?? "Figure";
  const section = source.sections.find((s) => s.id === piece.data.source_id);
  if (section) return sectionRef(section);
  const words = piece.data.region.start.exact.trim().split(/\s+/);
  return words.length > NAME_WORDS ? `${words.slice(0, NAME_WORDS).join(" ")}…` : words.join(" ");
}

/** Lanes by first fit, top to bottom: a bracket takes the lowest lane free where it starts. */
function assignLanes(spans: { top: number; bottom: number }[]): number[] {
  const order = spans.map((_, i) => i).sort((a, b) => spans[a].top - spans[b].top);
  const laneEnds: number[] = [];
  const lanes: number[] = new Array(spans.length);
  for (const i of order) {
    let lane = laneEnds.findIndex((end) => end < spans[i].top);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = spans[i].bottom;
    lanes[i] = lane;
  }
  return lanes;
}

/** Every piece's bracket on `page`, in the board's order: where the paper has been cut, from where to where. */
export function pageBrackets(board: Board, source: Source, page: number): Bracket[] {
  const trayId = findTray(board.nodes)?.id;
  const pieces = board.nodes.filter((n): n is Piece => (n.type === "chunk" || n.type === "figure") && n.data.region.rects.some((r) => r.page === page));
  const spans = pieces.map((piece) => {
    const here = piece.data.region.rects.filter((r) => r.page === page);
    const pages = piece.data.region.rects.map((r) => r.page);
    return {
      nodeId: piece.id,
      top: Math.min(...here.map((r) => r.rect[1])),
      bottom: Math.max(...here.map((r) => r.rect[3])),
      tray: trayId !== undefined && piece.parentId === trayId,
      label: Math.min(...pages) === page ? shortName(piece, source) : null,
      continues: Math.max(...pages) > page,
      state: piece.data.region.state,
    };
  });
  const lanes = assignLanes(spans);
  return spans.map((span, i) => ({ ...span, lane: lanes[i] }));
}
