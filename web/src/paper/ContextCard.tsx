import { api } from "../api/client";
import { AiTermBody } from "../ai/AiTermBody";
import { reflow } from "../board/marks";
import type { PageRect } from "../model/types";
import { useBoard } from "../state/BoardProvider";
import { CitationCard } from "./CitationCard";
import { termOf } from "./term";
import { TermBody } from "./TermBody";
import type { HoverCard, OpenCard } from "./useHoverCard";

type Props = { card: OpenCard; hover: HoverCard; onGo: (at: PageRect) => void; onOpenNote: (noteId: string) => void };

/** The one context card, in both views: the paper's words or clip at what was hovered (D24, D26), or a term's
 *  definitions (D27). The words read as prose, as a chunk's do (reflow). Going anywhere from it closes it. */
export function ContextCard({ card, hover, onGo, onOpenNote }: Props) {
  const { paperId, state, words } = useBoard();
  const { content } = card;
  const go = (at: PageRect) => { onGo(at); hover.close(); };
  if (content.kind === "words") {
    return (
      <CitationCard at={card.at} text={content.text && reflow(content.text, words)} failed={content.failed} clip={content.clip && api.renderUrl(paperId, content.clip)}
                    onGo={() => go(content.go)} {...hover.cardHandlers} />
    );
  }
  if (content.kind === "aiTerm") {
    return (
      <CitationCard at={card.at} label={content.term} {...hover.cardHandlers}>
        <AiTermBody term={content.term} at={content.at} onGo={go} onOpenNote={(id) => { onOpenNote(id); hover.close(); }} />
      </CitationCard>
    );
  }
  const highlight = state.board.highlights.find((h) => h.id === content.highlightId);
  if (!highlight) return null;
  return (
    <CitationCard at={card.at} label={termOf(highlight)} {...hover.cardHandlers}>
      <TermBody highlight={highlight} onGo={go} onOpenNote={(id) => { onOpenNote(id); hover.close(); }} />
    </CitationCard>
  );
}
