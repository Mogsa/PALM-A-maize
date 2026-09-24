import { useMemo, useState } from "react";
import { sectionRef } from "../model/sections";
import type { PageRect } from "../model/types";
import { useBoard } from "../state/BoardProvider";
import { FIND_MAX_HITS, findInPaper, type FindHit } from "./find";
import type { FindMark } from "./useFindMark";

export const FIND_QUERY_MAX = 80;

/** Find's state: the words searched for, and the hit last picked, which is marked on its page. */
export function useFind(jumpTo: (at: PageRect) => void) {
  const [query, setQuery] = useState<string | null>(null);
  const [findMark, setFindMark] = useState<FindMark | null>(null);
  return {
    query, findMark,
    open: (text: string) => setQuery(text.replace(/\s+/g, " ").trim().slice(0, FIND_QUERY_MAX)),
    pick: (hit: FindHit) => { setFindMark({ page: hit.page, query: hit.match }); jumpTo({ page: hit.page, rect: [0, 0, 0, 0] }); },
    close: () => { setQuery(null); setFindMark(null); },
  };
}

/** Every place the words appear (D13), with page, section and a few words either side. */
export function FindPanel({ query, onPick, onClose }: { query: string; onPick: (hit: FindHit) => void; onClose: () => void }) {
  const { source } = useBoard();
  const hits = useMemo(() => findInPaper(query, source), [query, source]);
  const count = hits.length === FIND_MAX_HITS ? `${FIND_MAX_HITS}+` : String(hits.length);
  return (
    <aside className="find-panel" aria-label="Find in paper">
      <header><b>“{query}”</b> <span>{count} place{hits.length === 1 ? "" : "s"}</span>
        <button className="quiet close" aria-label="Close" onClick={onClose}>×</button></header>
      <ul>
        {hits.map((hit) => (
          <li key={`${hit.page}-${hit.start}`}>
            <button type="button" onClick={() => onPick(hit)}>
              <span className="where">p{hit.page + 1}{hit.section ? ` · ${sectionRef(hit.section)}` : ""}</span>
              …{hit.before} <mark>{hit.match}</mark> {hit.after}…
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
