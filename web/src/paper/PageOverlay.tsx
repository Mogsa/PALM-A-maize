import type { AiUnderline } from "../ai/terms";
import type { Board, Rect, Source, Tag } from "../model/types";
import { useTags } from "../state/TagsProvider";
import { mainTagColour } from "../tags/mainTag";
import { CutRuler } from "./CutRuler";
import { Margin } from "./PageMargin";
import type { JumpTarget } from "./margin";

type Props = {
  page: number; scale: number; board: Board; source: Source;
  aiLines?: AiUnderline[];
  onOutlineClick: (nodeId: string) => void; onJump: (target: JumpTarget) => void; onOpenNote: (noteId: string) => void;
};

const px = (rect: Rect, scale: number) => ({
  left: rect[0] * scale, top: rect[1] * scale, width: (rect[2] - rect[0]) * scale, height: (rect[3] - rect[1]) * scale,
});

/** The inline colour of a mark with a main tag; none leaves the stylesheet's plain yellow. */
export const markColour = (tags: string[], byId: ReadonlyMap<string, Tag>): React.CSSProperties => {
  const colour = mainTagColour(tags, byId);
  return colour ? ({ "--mark-colour": colour } as React.CSSProperties) : {};
};

/** A mark's extra tags: one small dot each, named on hover. A deleted tag is skipped. */
function MarkExtras({ ids }: { ids: string[] }) {
  const { byId } = useTags();
  const known = ids.flatMap((id) => byId.get(id) ?? []);
  return <span className="mark-extras">{known.map((t) => <span key={t.id} className="mark-extra" title={t.name} style={{ background: t.colour }} />)}</span>;
}

/** Marks and the cut ruler for one page. The overlay is pointer-events: none, so a drag anywhere over a page still
 *  selects the text underneath (fix round 1, finding 2); the ruler sits in the margin, off the text. */
export function PageOverlay({ page, scale, board, source, aiLines = [], onOutlineClick, onJump, onOpenNote }: Props) {
  const { byId } = useTags();
  return (
    <div className="overlay">
      <CutRuler page={page} scale={scale} board={board} source={source} onOpen={onOutlineClick} />
      {/* A highlight is painted line by line, each of its rects on this page (addendum 5.1), in its main tag's colour;
          its extra tags are small chips after its first line (spec A2). */}
      {board.highlights.flatMap((h) => h.anchor.rects.filter((r) => r.page === page).map((r, i) => (
        <div key={`${h.id}-${i}`} className={`mark ${h.anchor.state}`} data-highlight-id={h.id} title={h.anchor.quote.exact.slice(0, 80)}
             style={{ ...px(r.rect, scale), ...markColour(h.tags, byId) }}>
          {i === 0 && h.tags.length > 1 && <MarkExtras ids={h.tags.slice(1)} />}
        </div>
      )))}
      {aiLines.map((l, i) => <div key={`ai-${i}`} className="ai-term" style={px(l.at.rect, scale)} title="AI term" />)}
      <Margin page={page} scale={scale} board={board} source={source} onJump={onJump} onOpenNote={onOpenNote} />
    </div>
  );
}
