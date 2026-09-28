import { useMemo } from "react";
import { api, CLIP_DPI } from "../../api/client";
import { useAi } from "../../ai/AiProvider";
import { splitTerms } from "../../ai/splitTerms";
import type { Source } from "../../model/types";
import { markColour } from "../../paper/PageOverlay";
import { splitReferences, type ReferencePart } from "../../paper/references";
import { useBoard } from "../../state/BoardProvider";
import { useTags } from "../../state/TagsProvider";
import type { PaintedBlock } from "../marks";

/** GET /render pads every clip by this much (addendum 6); the image is that much bigger than the region. */
export const CLIP_PAD_PT = 4;
export const clipPx = (pt: number) => Math.round(((pt + 2 * CLIP_PAD_PT) * CLIP_DPI) / 72);

type Run = { text: string; highlightId: string | null; parts: ReferencePart[] };

/** Each plain run cut at the references the paper can show (D26); a mark's words are left whole. */
function withReferences(painted: PaintedBlock[], source: Source): { block: PaintedBlock["block"]; runs: Run[] }[] {
  return painted.map(({ block, runs }) => ({
    block, runs: runs.map((run) => ({ ...run, parts: run.highlightId ? [] : splitReferences(run.text, source) })),
  }));
}

function Plain({ parts, terms }: { parts: ReferencePart[]; terms: string[] }) {
  return (
    <span>
      {parts.map((part, k) => (part.ref
        ? <span key={k} className="ref" tabIndex={0} data-ref-kind={part.ref.kind} data-ref-key={part.ref.key}>{part.text}</span>
        : splitTerms(part.text, terms).map((piece, j) => (piece.term
          ? <span key={`${k}-${j}`} className="ai-term" tabIndex={0} data-ai-term={piece.term}>{piece.text}</span>
          : <span key={`${k}-${j}`}>{piece.text}</span>))))}
    </span>
  );
}

/** A chunk as the page has it (D2): text as text with the marks painted, formulas, figures and tables as images of the
 *  paper as printed. Width and height are given so a loading image reserves its space and the card does not jump.
 *  A reference the paper can show is underlined, and hovering it shows the paper's own words there (D26). */
export function ChunkBody({ painted, dimmed, tagsOf }: { painted: PaintedBlock[]; dimmed: (highlightId: string) => boolean; tagsOf: (highlightId: string) => string[] }) {
  const { paperId, source } = useBoard();
  const { byId } = useTags();
  const { ai } = useAi();
  const terms = useMemo(() => ai?.reader?.terms.map((t) => t.term) ?? [], [ai]);
  const blocks = useMemo(() => withReferences(painted, source), [painted, source]);
  return (
    <>
      {blocks.map(({ block, runs }, i) => (block.kind === "clip"
        ? <img key={i} className="block-clip" src={api.renderUrl(paperId, { page: block.page, rect: block.rect })}
               width={clipPx(block.rect[2] - block.rect[0])} height={clipPx(block.rect[3] - block.rect[1])}
               alt={block.label ?? "part of the paper"} loading="lazy" draggable={false} />
        : <p key={i} className="block-text nodrag">
            {runs.map((run, j) => (run.highlightId
              ? <mark key={j} data-highlight-id={run.highlightId} className={dimmed(run.highlightId) ? "dim" : undefined}
                      style={markColour(tagsOf(run.highlightId), byId)}>{run.text}</mark>
              : <Plain key={j} parts={run.parts} terms={terms} />))}
          </p>))}
    </>
  );
}
