import { useRef, useState } from "react";
import { useAi } from "../ai/AiProvider";
import type { KeySentence } from "../ai/keySentences";
import { overlaps } from "../ai/terms";
import { api } from "../api/client";
import { newId } from "../model/ids";
import type { Highlight } from "../model/types";
import { useBoard } from "../state/BoardProvider";

/** Keep (spec): the sentence becomes a plain highlight of the reader's own on the same lines; no tag, so it is theirs
 *  to tag. Its anchor is read from the paper, as the glossary's Keep and a selection's are: the printed words, their
 *  prefix, suffix and position, never the AI's copy of them. The AI layer itself never writes to the board: only this
 *  button does, when pressed. */
async function keptHighlight(paperId: string, k: KeySentence): Promise<Highlight> {
  const selection = await api.postText(paperId, k.lines, false, "text", k.lines);
  return { id: newId("h"), tags: [], anchor: selection.highlight };
}

/** Kept already: a highlight of the reader's own that starts on this sentence's first line and ends on its last. By
 *  place, not words: the kept highlight holds the printed words, which may differ from the AI's quote. */
const isKept = (k: KeySentence, highlights: Highlight[]) => highlights.some(({ anchor: { rects } }) =>
  rects.length > 0 && overlaps(rects[0], k.lines[0]) && overlaps(rects[rects.length - 1], k.lines[k.lines.length - 1]));

function Entry({ sentence }: { sentence: KeySentence }) {
  const { goTo } = useAi();
  const { paperId, dispatch, state, activity } = useBoard();
  const [keeping, setKeeping] = useState(false);
  const keepingNow = useRef(false);   // a ref too: two clicks before the next render would both see the old state
  const where = sentence.lines[0] ?? sentence.at;
  const keep = async () => {
    if (keepingNow.current) return;
    keepingNow.current = true;
    setKeeping(true);
    try {
      dispatch({ type: "addHighlight", highlight: await keptHighlight(paperId, sentence) });
      activity.log("ai", "keep", { slot: sentence.slot, text: sentence.quote });   // only once it is kept
    } catch (error) {
      console.error("Could not keep the key sentence", error);
    } finally {
      keepingNow.current = false;
      setKeeping(false);
    }
  };
  // Without its lines there is nothing to mark: Keep would make a highlight with no place on the page.
  const kept = sentence.lines.length > 0 && isKept(sentence, state.board.highlights);
  return (
    <li>
      <button type="button" className="sentence" disabled={!where} onClick={() => { if (!where) return; activity.log("ai", "jump", { slot: sentence.slot, text: sentence.quote }); goTo(where); }} title="Go to it in the paper">
        <span className="quote">{sentence.quote}</span> <span className="where">p. {sentence.page + 1}</span>
      </button>
      {kept && <span className="kept">Kept</span>}
      {sentence.lines.length > 0 && !kept && (
        <button type="button" className="quiet keep" disabled={keeping} onClick={() => void keep()}
                title="Make it a highlight of your own">Keep</button>
      )}
    </li>
  );
}

/** The paper's key sentences by slot, in the template's order (spec): a summary in the author's own words, every
 *  line a jump to where it is. */
export function KeySentences() {
  const { keySentences } = useAi();
  return (
    <section className="key-sentences" aria-label="Key sentences">
      <h3>Key sentences <span className="ai-badge">AI</span></h3>
      {!keySentences.length && <p className="hint">Turn on AI help and the paper's key sentences are listed here.</p>}
      {keySentences.map((g) => (
        <div key={g.slot} className="slot-group">
          <h4 className="slot-head" style={{ "--key-colour": g.colour } as React.CSSProperties}>{g.slot}</h4>
          <ul>{g.sentences.map((s, i) => <Entry key={i} sentence={s} />)}</ul>
        </div>
      ))}
    </section>
  );
}
