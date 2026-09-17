import { useEffect, useState } from "react";
import { api } from "./api/client";
import { PaperView } from "./paper/PaperView";
import type { Board, PageRect, PaperSummary, Source } from "./model/types";
import "./styles.css";

export default function App() {
  const [papers, setPapers] = useState<PaperSummary[]>([]);
  const [paperId, setPaperId] = useState<string | null>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [board, setBoard] = useState<Board | null>(null);
  const [focus, setFocus] = useState<PageRect | null>(null);

  useEffect(() => { api.listPapers().then(setPapers); }, []);
  useEffect(() => {
    if (!paperId) return;
    Promise.all([api.getSource(paperId), api.getBoard(paperId)]).then(([s, b]) => { setSource(s); setBoard(b); });
  }, [paperId]);

  return (
    <div className="app">
      <div className="topbar">
        <select value={paperId ?? ""} onChange={(e) => setPaperId(e.target.value || null)}>
          <option value="">Choose a paper</option>
          {papers.map((p) => <option key={p.paper_id} value={p.paper_id}>{p.title}</option>)}
        </select>
      </div>
      {paperId && source && board && (
        <PaperView paperId={paperId} source={source} board={board} focus={focus}
                   onSelect={(rects, _box, exact) => console.log("selected", rects, "exact", exact)}
                   onOutlineClick={(id) => console.log("outline", id)} />
      )}
    </div>
  );
}
