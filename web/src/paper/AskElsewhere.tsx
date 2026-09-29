import { useState } from "react";
import { newEdge } from "../model/links";
import { newNote } from "../model/notes";
import { spotForNoteOn } from "../model/placement";
import { sectionAt } from "../model/sections";
import type { Highlight } from "../model/types";
import { useBoard } from "../state/BoardProvider";
import { useTags } from "../state/TagsProvider";
import { buildAskPrompt, buildJargonPrompt, sentenceAround } from "./ask";
import { isTerm, termOf, termTagIds } from "./term";

export const COPIED_MESSAGE = "Prompt copied. Paste it into the AI you use, then paste its answer into the AI note.";
export const COPY_FAILED_MESSAGE = "Could not copy the prompt. Copy it from here:";

/** Copies a prompt and makes an empty AI note connected to the mark (D14). The tool itself calls nothing. A mark tagged
 *  term copies the jargon prompt instead, as Look up elsewhere (D27). */
export function AskElsewhere({ highlight }: { highlight: Highlight }) {
  const { state, dispatch, source } = useBoard();
  const term = isTerm(highlight, termTagIds(useTags().tags));
  const [asked, setAsked] = useState<{ copied: boolean; prompt: string } | null>(null);
  const ask = async () => {
    const at = highlight.anchor.rects[0];
    const pageText = source.page_text.find((p) => p.page === at.page)?.text ?? "";
    const sentence = sentenceAround(pageText, highlight.anchor.quote.exact, highlight.anchor.quote);
    const prompt = term
      ? buildJargonPrompt({ term: termOf(highlight), sentence })
      : buildAskPrompt({ marked: highlight.anchor.quote.exact, sentence, section: sectionAt(source, at)?.text ?? "", goal: state.board.goal });
    const note = newNote({ ...spotForNoteOn(state.board, highlight.id), origin: "ai" });
    dispatch({ type: "add", nodes: [note], edges: [newEdge(highlight.id, note.id)] });
    try {
      await navigator.clipboard.writeText(prompt);
      setAsked({ copied: true, prompt });
    } catch (failure) {
      console.error(COPY_FAILED_MESSAGE, failure);
      setAsked({ copied: false, prompt });
    }
  };
  return (
    <>
      <button className="action" onClick={() => void ask()} title="Copy a prompt for an AI, and make a note marked AI for its answer">
        {term ? "Look up elsewhere" : "Ask elsewhere"}
      </button>
      {asked && (
        <div className="ask-result" role="status">
          {asked.copied ? COPIED_MESSAGE : COPY_FAILED_MESSAGE}
          {!asked.copied && <textarea readOnly value={asked.prompt} aria-label="Prompt" />}
        </div>
      )}
    </>
  );
}
