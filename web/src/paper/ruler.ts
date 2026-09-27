import { sectionRef } from "../model/sections";
import { findTray } from "../model/tray";
import type { AnchorState, Board, ChunkNode, FigureNode, Source } from "../model/types";

/** A reader's cut is named by this many of its first words. */
const NAME_WORDS = 3;

/** One piece's stretch of the ruler on one page, in page points: from its first line to its last there. */
export type Stretch = {
  nodeId: string;
  top: number;
  bottom: number;
  /** Still in the tray (faint), or out of it: placed, or a reader's cut (solid). */
  tray: boolean;
  /** The piece's short name, for its tooltip. */
  name: string;
  state: AnchorState;
};

/** A page's ruler: the stretches in drawing order (tray first, so a solid one over it wins) and a tick, in points,
 *  at every place a piece really starts or ends on this page (not where it only runs over the page break). */
export type Ruler = { stretches: Stretch[]; ticks: number[] };

type Piece = ChunkNode | FigureNode;

function shortName(piece: Piece, source: Source): string {
  if (piece.type === "figure") return source.figures.find((f) => f.id === piece.data.source_id)?.label ?? piece.data.caption.split(/[:.]/)[0] ?? "Figure";
  const section = source.sections.find((s) => s.id === piece.data.source_id);
  if (section) return sectionRef(section);
  const words = piece.data.region.start.exact.trim().split(/\s+/);
  return words.length > NAME_WORDS ? `${words.slice(0, NAME_WORDS).join(" ")}…` : words.join(" ");
}

function stretchOf(piece: Piece, source: Source, page: number, trayId: string | undefined) {
  const here = piece.data.region.rects.filter((r) => r.page === page);
  const pages = piece.data.region.rects.map((r) => r.page);
  const stretch: Stretch = {
    nodeId: piece.id,
    top: Math.min(...here.map((r) => r.rect[1])),
    bottom: Math.max(...here.map((r) => r.rect[3])),
    tray: trayId !== undefined && piece.parentId === trayId,
    name: shortName(piece, source),
    state: piece.data.region.state,
  };
  const ticks = [...(Math.min(...pages) === page ? [stretch.top] : []), ...(Math.max(...pages) === page ? [stretch.bottom] : [])];
  return { stretch, ticks };
}

/** Where the paper has been cut on `page`, from where to where. */
export function pageRuler(board: Board, source: Source, page: number): Ruler {
  const trayId = findTray(board.nodes)?.id;
  const pieces = board.nodes.filter((n): n is Piece => (n.type === "chunk" || n.type === "figure") && n.data.region.rects.some((r) => r.page === page));
  const drawn = pieces.map((piece) => stretchOf(piece, source, page, trayId));
  return {
    stretches: [...drawn.filter((d) => d.stretch.tray), ...drawn.filter((d) => !d.stretch.tray)].map((d) => d.stretch),
    ticks: [...new Set(drawn.flatMap((d) => d.ticks))].sort((a, b) => a - b),
  };
}
