import { useEffect, useState } from "react";
import { api } from "./api/client";
import { PaperScreen } from "./PaperScreen";
import { BoardProvider, useBoard } from "./state/BoardProvider";
import type { PageRect, PaperSummary } from "./model/types";
import "./styles.css";

function Notice() {
  const { notice, state } = useBoard();
  return <span className="notice">{notice ?? (state.dirty ? "Unsaved" : `Saved v${state.board.version}`)}</span>;
}

export default function App() {
  const [papers, setPapers] = useState<PaperSummary[]>([]);
  const [paperId, setPaperId] = useState<string | null>(null);
  const [focus, setFocus] = useState<PageRect | null>(null);
  useEffect(() => { api.listPapers().then(setPapers); }, []);

  return (
    <div className="app">
      {paperId ? (
        <BoardProvider key={paperId} paperId={paperId}>
          <div className="topbar">
            <select value={paperId} onChange={(e) => setPaperId(e.target.value || null)}>
              {papers.map((p) => <option key={p.paper_id} value={p.paper_id}>{p.title}</option>)}
            </select>
            <Notice />
          </div>
          <PaperScreen focus={focus} onOpenOnBoard={(id) => console.log("open on board", id)} />
        </BoardProvider>
      ) : (
        <div className="topbar">
          <select value="" onChange={(e) => setPaperId(e.target.value || null)}>
            <option value="">Choose a paper</option>
            {papers.map((p) => <option key={p.paper_id} value={p.paper_id}>{p.title}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}
