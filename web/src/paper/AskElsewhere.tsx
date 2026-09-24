import { useState } from "react";
import { newEdge } from "../model/links";
import { newNote } from "../model/notes";
import { spotForNoteOn } from "../model/placement";
import { sectionAt } from "../model/sections";
import type { Highlight } from "../model/types";
import { useBoard } from "../state/BoardProvider";
import { buildAskPrompt, sentenceAround } from "./ask";

export const COPIED_MESSAGE = "Prompt copied. Paste it into the AI you use, then paste its answer into the AI note.";
export const COPY_FAILED_MESSAGE = "Could not copy the prompt. Copy it from here:";

/** Copies a prompt and makes an empty AI note connected to the mark (D14). The tool itself calls nothing. */
export function AskElsewhere({ highlight }: { highlight: Highlight }) {
  const { state, dispatch, source } = useBoard();
  const [asked, setAsked] = useState<{ copied: boolean; prompt: string } | null>(null);
  const ask = async () => {
    const at = highlight.anchor.rects[0];
    const pageText = source.page_text.find((p) => p.page === at.page)?.text ?? "";
    const prompt = buildAskPrompt({
      marked: highlight.anchor.quote.exact, sentence: sentenceAround(pageText, highlight.anchor.quote.exact),
      section: sectionAt(source, at)?.text ?? "", goal: state.board.goal,
    });
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
      <button className="action" onClick={() => void ask()} title="Copy a prompt for an AI, and make a note marked AI for its answer">Ask elsewhere</button>
      {asked && (
        <div className="ask-result" role="status">
          {asked.copied ? COPIED_MESSAGE : COPY_FAILED_MESSAGE}
          {!asked.copied && <textarea readOnly value={asked.prompt} aria-label="Prompt" />}
        </div>
      )}
    </>
  );
}
