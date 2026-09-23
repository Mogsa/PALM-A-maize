import { useEffect, useState } from "react";
import { api } from "./api/client";
import { BoardView } from "./board/BoardView";
import { PaperScreen } from "./PaperScreen";
import { BoardProvider, useBoard } from "./state/BoardProvider";
import type { PageRect, PaperSummary } from "./model/types";
import "./styles.css";

function Notice() {
  const { notice, state } = useBoard();
  const tone = notice ? "warn" : state.dirty ? "unsaved" : "";
  return <span className={`notice ${tone}`}>{notice ?? (state.dirty ? "Unsaved" : `Saved v${state.board.version}`)}</span>;
}

function PaperPicker({ papers, value, onChange }: { papers: PaperSummary[]; value: string; onChange: (id: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Paper">
      {value === "" && <option value="">Choose a paper</option>}
      {papers.map((p) => <option key={p.paper_id} value={p.paper_id}>{p.title}</option>)}
    </select>
  );
}

export default function App() {
  const [papers, setPapers] = useState<PaperSummary[]>([]);
  const [paperId, setPaperId] = useState<string | null>(null);
  const [view, setView] = useState<"paper" | "board">("paper");
  const [focusNode, setFocusNode] = useState<string | null>(null);
  const [focusRect, setFocusRect] = useState<PageRect | null>(null);
  useEffect(() => { api.listPapers().then(setPapers); }, []);

  const choose = (id: string) => { setFocusRect(null); setFocusNode(null); setPaperId(id || null); };

  if (!paperId) {
    return (
      <div className="app">
        <div className="topbar"><span className="wordmark">Paper Board</span></div>
        <div className="start">
          <h1>Choose a paper</h1>
          <p>Read it, mark it, cut it into pieces, and lay the pieces out.</p>
          <PaperPicker papers={papers} value="" onChange={choose} />
          <p className="how">Add a paper with <code>paperboard extract paper.pdf --out ~/paperboard-data/papers</code></p>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <BoardProvider key={paperId} paperId={paperId}>
        <div className="topbar">
          <span className="wordmark">Paper Board</span>
          <div className="paper-title"><PaperPicker papers={papers} value={paperId} onChange={choose} /></div>
          <div className="segmented" role="group" aria-label="View">
            <button aria-pressed={view === "paper"} onClick={() => setView("paper")}>Paper</button>
            <button aria-pressed={view === "board"} onClick={() => setView("board")}>Board</button>
          </div>
          <Notice />
        </div>
        {/* A fresh focusRect every time, so the paper view scrolls again even for the same chunk. */}
        {view === "paper"
          ? <PaperScreen focus={focusRect} onFocusHandled={() => setFocusRect(null)} onOpenOnBoard={(id) => { setFocusNode(id); setView("board"); }} />
          : <BoardView focusNode={focusNode} onFocusHandled={() => setFocusNode(null)} onOpenInPaper={(rect) => { setFocusRect({ ...rect }); setView("paper"); }} />}
      </BoardProvider>
    </div>
  );
}
