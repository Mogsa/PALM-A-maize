import { firstLine } from "../model/notes";
import type { Board, Source } from "../model/types";
import { useNote } from "../state/BoardProvider";
import { marginItems, stackTops, type JumpTarget, type MarginItem } from "./margin";

export const MARGIN_NOTE_CHARS = 120;

type Props = { page: number; scale: number; board: Board; source: Source; onJump: (target: JumpTarget) => void; onOpenNote: (noteId: string) => void };

function MarginNote({ item, top, onOpen }: { item: Extract<MarginItem, { kind: "note" }>; top: number; onOpen: (id: string) => void }) {
  const { text } = useNote(item.noteId);
  return (
    <button type="button" className={`margin-note ${item.origin}`} data-note-id={item.noteId} style={{ top }} onClick={() => onOpen(item.noteId)} title="Open on the board">
      {item.origin === "ai" && <span className="ai-label">AI</span>}
      {firstLine(text ?? "", MARGIN_NOTE_CHARS) || "empty note"}
    </button>
  );
}

/** Beside each mark's first line on this page: its notes and its jump chips (D12). */
export function Margin({ page, scale, board, source, onJump, onOpenNote }: Props) {
  const rows = board.highlights
    .filter((h) => h.anchor.rects[0]?.page === page)
    .flatMap((h) => marginItems(board, source, h.id).map((item) => ({ item, key: `${h.id}:${item.key}`, top: h.anchor.rects[0].rect[1] * scale })))
    .sort((a, b) => a.top - b.top);
  const tops = stackTops(rows.map((r) => r.top));
  return (
    <div className="margin">
      {rows.map(({ item, key }, i) => (item.kind === "note"
        ? <MarginNote key={key} item={item} top={tops[i]} onOpen={onOpenNote} />
        : <button key={key} type="button" className="margin-chip" style={{ top: tops[i] }} onClick={() => onJump(item.target)}>{item.label}</button>))}
    </div>
  );
}
