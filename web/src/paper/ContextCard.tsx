import { api } from "../api/client";
import type { PageRect } from "../model/types";
import { useBoard } from "../state/BoardProvider";
import { CitationCard } from "./CitationCard";
import type { HoverCard, OpenCard } from "./useHoverCard";

type Props = { card: OpenCard; hover: HoverCard; onGo: (at: PageRect) => void };

/** The one context card, in both views (D24, D26): the paper's words or clip at what was hovered. Go there closes it. */
export function ContextCard({ card, hover, onGo }: Props) {
  const { paperId } = useBoard();
  const { content } = card;
  if (content.kind !== "words") return null;
  return (
    <CitationCard at={card.at} text={content.text} failed={content.failed} clip={content.clip && api.renderUrl(paperId, content.clip)}
                  onGo={() => { onGo(content.go); hover.close(); }} {...hover.cardHandlers} />
  );
}
