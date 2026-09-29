import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { Question } from "../model/types";
import { useBoard } from "../state/BoardProvider";

export const QUESTIONS_FAILED_MESSAGE = "Could not load the question list.";

/** The server's question list (SPEC 5.2), fetched again whenever the board is saved. */
export function useQuestions() {
  const { paperId, state } = useBoard();
  const version = state.board.version;
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    api.getQuestions(paperId).then(
      (list) => { if (live) { setQuestions(list); setError(null); } },
      (failure: unknown) => { console.error(QUESTIONS_FAILED_MESSAGE, failure); if (live) setError(QUESTIONS_FAILED_MESSAGE); });
    return () => { live = false; };
  }, [paperId, version]);
  return { questions, error };
}
