import { linesInside } from "../model/geometry";
import { notesConnectedTo } from "../model/links";
import { trayOrder } from "../model/paperOrder";
import { sectionLabel } from "../model/sections";
import { trayRow } from "../model/tray";
import type { Board, BoardNode, ChunkNode, PageRect, Section, Source } from "../model/types";

export type GhostRow = { sectionId: string; y: number; text: string; nodeId: string | null; headingRect: PageRect };

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

function where(nodes: BoardNode[], chunk: ChunkNode | undefined): string {
  if (!chunk) return "not on the board";
  const parent = chunk.parentId ? nodes.find((n) => n.id === chunk.parentId) : undefined;
  if (parent?.type === "group") return `→ in ${parent.data.name || "a group"}`;
  return "→ on the board";
}

function row(board: Board, section: Section, y: number): GhostRow {
  const chunk = board.nodes.find((n): n is ChunkNode => n.type === "chunk" && n.data.source_id === section.id);
  const marks = board.highlights.filter((h) => linesInside(h, section.extent).length > 0);
  const notes = notesConnectedTo(board, [...marks.map((m) => m.id), ...(chunk ? [chunk.id] : [])]).length;
  const text = `${sectionLabel(section)} ${where(board.nodes, chunk)} · ${plural(marks.length, "mark")} · ${plural(notes, "note")}`;
  return { sectionId: section.id, y, text, nodeId: chunk?.id ?? null, headingRect: section.heading_rect };
}

/** A faint row in the tray for each section whose chunk is not among its children (addendum 4.9). Derived at render,
 *  never stored; figures have none. Marks are counted by the section's extent, as a chunk finds its marks. */
export function ghostRows(board: Board, source: Source, trayId: string): GhostRow[] {
  const order = trayOrder(source);
  const inTray = new Set(board.nodes.flatMap((n) => (n.parentId === trayId && n.type === "chunk" && n.data.source_id ? [n.data.source_id] : [])));
  return source.sections.filter((s) => !inTray.has(s.id)).map((s) => row(board, s, trayRow(order.indexOf(s.id)).y));
}
