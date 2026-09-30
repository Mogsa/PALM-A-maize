import { useMemo } from "react";
import type { Highlight, PageRect } from "../model/types";
import { termCard } from "../paper/term";
import { useBoard } from "../state/BoardProvider";
import { useTags } from "../state/TagsProvider";
import { useAi } from "./AiProvider";
import { aiEntryFor, cardParts, keepTerm, type AiPart } from "./terms";
import { likelyDefinitionRange, useDefine } from "./useDefine";

/** The AI part of a term card (spec B4): the explanation, badged AI, with a "based on" link to each ground. */
export function AiPartView({ part, onGo }: { part: AiPart; onGo: (at: PageRect) => void }) {
  return (
    <section className="term-part ai">
      <div className="citation-label"><span className="ai-badge">AI</span></div>
      <p className="citation-text">{part.explanation}</p>
      <div className="popover-actions">
        {part.grounds.filter((g) => g.at).map((g, i) => (
          <button key={i} type="button" className="quiet" onClick={() => onGo(g.at!)} title={g.quote}>based on p{g.at!.page + 1} ↗</button>
        ))}
      </div>
    </section>
  );
}

function DefineButton({ term, at }: { term: string; at: PageRect }) {
  const { source } = useBoard();
  const { text, busy, error, define } = useDefine();
  if (error) return <p className="hint">{error}</p>;
  if (busy || text) return <p className="citation-text streaming"><span className="ai-badge">AI</span> {text}</p>;
  return (
    <button type="button" className="action" onClick={() => void define({ word: term, page: at.page, rect: at.rect, definition: likelyDefinitionRange(term, source) })}>
      Define
    </button>
  );
}

type Props = { term: string; at: PageRect | null; onGo: (at: PageRect) => void; onOpenNote: (noteId: string) => void };

/** The card of an AI-underlined word the reader has not marked: in this paper, then AI; Keep makes it theirs. */
export function AiTermBody({ term, at, onGo }: Props) {
  const { paperId, source, state, dispatch, activity } = useBoard();
  const { tags } = useTags();
  const { ai } = useAi();
  const probe = useMemo(() => ({ id: "", tags: [], anchor: { quote: { exact: term, prefix: "", suffix: "" }, rects: at ? [at] : [], state: "ok" } }) as unknown as Highlight, [term, at]);
  const parts = useMemo(() => cardParts(termCard(state.board, source, probe), aiEntryFor(ai, term)), [state.board, source, probe, ai, term]);
  const keep = async () => {
    if (!at) return;
    dispatch({ type: "addHighlight", highlight: await keepTerm(paperId, at, tags) });
    activity.log("ai", "keep", { slot: null, text: term });   // after it is kept; an AI term has no slot
  };
  return (
    <>
      {parts.map((part) => {
        if (part.kind === "ai") return <AiPartView key="ai" part={part} onGo={onGo} />;
        if (part.kind !== "definition") return null;
        return (
          <section key="definition" className="term-part">
            <div className="citation-label">In this paper <span className="where">p{part.page + 1}{part.section ? ` · ${part.section}` : ""}</span></div>
            <p className="citation-text">{part.sentence}</p>
          </section>
        );
      })}
      {!parts.some((p) => p.kind === "ai") && at && <DefineButton term={term} at={at} />}
      {at && <div className="popover-actions"><button type="button" className="action" onClick={() => void keep()} title="Make this a term mark of your own">Keep</button></div>}
    </>
  );
}
