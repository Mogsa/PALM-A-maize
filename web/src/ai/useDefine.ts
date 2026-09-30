import { useState } from "react";
import { api } from "../api/client";
import type { Source } from "../model/types";
import { rankFindHits } from "../paper/definition";
import { findInPaper } from "../paper/find";
import { useBoard } from "../state/BoardProvider";
import { useAi } from "./AiProvider";
import { partialExplanation } from "./partial";
import { wordKey } from "./terms";
import type { DefineRequest } from "./types";

/** Where D25 finds the word's likely definition, as offsets into page_text, or null. */
export function likelyDefinitionRange(word: string, source: Source): DefineRequest["definition"] {
  const best = rankFindHits(findInPaper(word, source), source)[0];
  return best?.likely ? { page: best.hit.page, start: best.hit.start, end: best.hit.end } : null;
}

/** One quick definition (spec B3b): streamed into `text`, then kept in ai.json and in AI state. */
export function useDefine() {
  const { paperId, activity } = useBoard();
  const { addDefinition } = useAi();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const define = async (req: DefineRequest) => {
    activity.log("ai", "define", { word: req.word });
    setBusy(true); setError(null); setText("");
    let buffer = "";
    try {
      const result = await api.define(paperId, req, (delta) => { buffer += delta; setText(partialExplanation(buffer)); });
      addDefinition(wordKey(req.word), result);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "AI help could not run.");
    } finally {
      setBusy(false);
    }
  };
  return { text, busy, error, define };
}
