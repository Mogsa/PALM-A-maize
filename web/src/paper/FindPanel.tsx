import { useCallback, useMemo, useRef, useState } from "react";
import { sectionRef } from "../model/sections";
import type { PageRect } from "../model/types";
import { useBoard } from "../state/BoardProvider";
import { rankFindHits } from "./definition";
import { FIND_MAX_HITS, findInPaper, nthOnPage, type FindHit } from "./find";
import type { FindMark } from "./useFindMark";

export const FIND_QUERY_MAX = 80;

/** Find's state: the words searched for, and the hit last picked, which is marked on its page. `onRun` hears of a find
 *  run, for the activity log: opened with words (from a selection or a card), or a result picked; once per query, since
 *  the list updates at every keystroke. */
export function useFind(jumpTo: (at: PageRect) => void, onRun: (text: string) => void = () => undefined) {
  const [query, setQuery] = useState<string | null>(null);
  const [findMark, setFindMark] = useState<FindMark | null>(null);
  const lastRun = useRef<string | null>(null);
  const onRunRef = useRef(onRun);
  onRunRef.current = onRun;
  const run = useCallback((text: string) => {
    if (!text.trim() || text === lastRun.current) return;
    lastRun.current = text;
    onRunRef.current(text);
  }, []);
  const open = useCallback((text: string) => {
    const words = text.replace(/\s+/g, " ").trim().slice(0, FIND_QUERY_MAX);
    setQuery(words);
    run(words);
  }, [run]);
  return {
    query, findMark, open,
    edit: (text: string) => setQuery(text.slice(0, FIND_QUERY_MAX)),
    pick: (hit: FindHit, nth: number) => {
      if (query !== null) run(query);
      setFindMark({ page: hit.page, query: hit.match, nth });
      jumpTo({ page: hit.page, rect: [0, 0, 0, 0] });
    },
    close: () => { setQuery(null); setFindMark(null); lastRun.current = null; },
  };
}

/** Every place the words appear (D13), with page, section and a few words either side. Likely definitions come first,
 *  badged (D25); the rest in paper order. */
export function FindPanel({ query, onQuery, onPick, onClose }: { query: string; onQuery: (text: string) => void; onPick: (hit: FindHit, nth: number) => void; onClose: () => void }) {
  const { source } = useBoard();
  const hits = useMemo(() => findInPaper(query, source), [query, source]);
  const ranked = useMemo(() => rankFindHits(hits, source), [hits, source]);
  const count = hits.length === FIND_MAX_HITS ? `${FIND_MAX_HITS}+` : String(hits.length);
  return (
    <aside className="find-panel" aria-label="Find in paper">
      <header>
        <input className="find-query" type="text" aria-label="Find words" value={query} autoFocus placeholder="Words to find"
               onChange={(e) => onQuery(e.target.value)} />
        <span>{count} place{hits.length === 1 ? "" : "s"}</span>
        <button className="quiet close" aria-label="Close" onClick={onClose}>×</button></header>
      <ul>
        {ranked.map(({ hit, likely, rules }) => (
          <li key={`${hit.page}-${hit.start}`}>
            <button type="button" onClick={() => onPick(hit, nthOnPage(hits, hit))}>
              <span className="where">p{hit.page + 1}{hit.section ? ` · ${sectionRef(hit.section)}` : ""}
                {likely && <span className="definition-badge" title={`The sentence reads like a definition: ${rules.join(", ")}`}>likely definition</span>}</span>
              …{hit.before} <mark>{hit.match}</mark> {hit.after}…
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
