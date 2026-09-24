import { api, CLIP_DPI } from "../../api/client";
import { useBoard } from "../../state/BoardProvider";
import type { PaintedBlock } from "../marks";

/** GET /render pads every clip by this much (addendum 6); the image is that much bigger than the region. */
export const CLIP_PAD_PT = 4;
export const clipPx = (pt: number) => Math.round(((pt + 2 * CLIP_PAD_PT) * CLIP_DPI) / 72);

/** A chunk as the page has it (D2): text as text with the marks painted, formulas, figures and tables as images of the
 *  paper as printed. Width and height are given so a loading image reserves its space and the card does not jump. */
export function ChunkBody({ painted, dimmed }: { painted: PaintedBlock[]; dimmed: (highlightId: string) => boolean }) {
  const { paperId } = useBoard();
  return (
    <>
      {painted.map(({ block, runs }, i) => (block.kind === "clip"
        ? <img key={i} className="block-clip" src={api.renderUrl(paperId, { page: block.page, rect: block.rect })}
               width={clipPx(block.rect[2] - block.rect[0])} height={clipPx(block.rect[3] - block.rect[1])}
               alt={block.label ?? "part of the paper"} loading="lazy" draggable={false} />
        : <p key={i} className="block-text nodrag">
            {runs.map((run, j) => (run.highlightId
              ? <mark key={j} data-highlight-id={run.highlightId} className={dimmed(run.highlightId) ? "dim" : undefined}>{run.text}</mark>
              : <span key={j}>{run.text}</span>))}
          </p>))}
    </>
  );
}
