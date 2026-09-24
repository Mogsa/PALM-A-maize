import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { Question } from "../model/types";
import { useBoard } from "../state/BoardProvider";

export const QUESTIONS_FAILED_MESSAGE = "Could not load the question list.";
export const QUESTION_CHARS = 90;

/** What is not yet understood (SPEC 5.2): the server's list, never recomputed here. Only a note of the reader's own
 *  clears an entry (D14), so an AI answer leaves it on the list. */
export function QuestionList({ onPick }: { onPick: (question: Question) => void }) {
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
  return (
    <section className="question-list" aria-label="Not yet understood">
      <h3>Not yet understood</h3>
      {error && <p className="panel-error" role="alert">{error}</p>}
      {questions?.length === 0 && <p className="hint">Nothing tagged <i>question</i> is waiting for a note of yours.</p>}
      <ul>
        {questions?.map((q) => (
          <li key={q.id}><button type="button" onClick={() => onPick(q)}><span className="kind">{q.kind}</span> {q.text.slice(0, QUESTION_CHARS)}</button></li>
        ))}
      </ul>
    </section>
  );
}
