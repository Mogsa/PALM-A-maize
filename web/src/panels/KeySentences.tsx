import { useAi } from "../ai/AiProvider";
import type { KeySentence } from "../ai/keySentences";
import { newId } from "../model/ids";
import type { Highlight } from "../model/types";
import { useBoard } from "../state/BoardProvider";

/** Keep (spec): the sentence becomes a plain highlight of the reader's own on the same lines; no tag, so it is theirs
 *  to tag. The AI layer itself never writes to the board: only this button does, when pressed. */
const keptHighlight = (k: KeySentence): Highlight => ({
  id: newId("h"), tags: [],
  anchor: { rects: k.lines, quote: { exact: k.quote, prefix: "", suffix: "" }, position: 0, state: "anchored" },
});

/** Kept already: a highlight of the reader's own with the same words on the same first line. */
const isKept = (k: KeySentence, highlights: Highlight[]) => highlights.some((h) => h.anchor.quote.exact === k.quote
  && h.anchor.rects[0]?.page === k.lines[0]?.page);

function Entry({ sentence }: { sentence: KeySentence }) {
  const { goTo } = useAi();
  const { dispatch, state } = useBoard();
  const where = sentence.lines[0] ?? sentence.at;
  return (
    <li>
      <button type="button" className="sentence" disabled={!where} onClick={() => where && goTo(where)} title="Go to it in the paper">
        <span className="quote">{sentence.quote}</span> <span className="where">p. {sentence.page + 1}</span>
      </button>
      {/* Without its lines there is nothing to mark: Keep would make a highlight with no place on the page. */}
      {sentence.lines.length > 0 && isKept(sentence, state.board.highlights) && <span className="kept">Kept</span>}
      {sentence.lines.length > 0 && !isKept(sentence, state.board.highlights) && (
        <button type="button" className="quiet keep" onClick={() => dispatch({ type: "addHighlight", highlight: keptHighlight(sentence) })}
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
