import { useEffect, useRef, useState } from "react";
import { api } from "./api/client";
import { BoardView } from "./board/BoardView";
import type { PageRect, PaperSummary, Question, View } from "./model/types";
import { ExportDialog } from "./panels/ExportDialog";
import { Glossary } from "./panels/Glossary";
import { QuestionList } from "./panels/QuestionList";
import { TemplateEditor } from "./panels/TemplateEditor";
import { useUndoKeys } from "./panels/undoKeys";
import { clampSplit } from "./model/paperView";
import { PaperPicker } from "./PaperPicker";
import { PaperScreen } from "./PaperScreen";
import { bothColumns, SplitDivider } from "./SplitDivider";
import { BoardProvider, useBoard } from "./state/BoardProvider";
import { FilterBar } from "./tags/FilterBar";
import { TagManager } from "./tags/TagManager";
import "./styles.css";

export type Panel = "questions" | "glossary" | "export" | "tags" | "template";

function Notice() {
  const { notice, state } = useBoard();
  const tone = notice ? "warn" : state.dirty ? "unsaved" : "";
  return <span className={`notice ${tone}`}>{notice ?? (state.dirty ? "Unsaved" : `Saved v${state.board.version}`)}</span>;
}

function PanelButton({ panel, open, label, onToggle }: { panel: Panel; open: Panel | null; label: string; onToggle: (p: Panel) => void }) {
  return <button type="button" className="panel-button" aria-pressed={open === panel} onClick={() => onToggle(panel)}>{label}</button>;
}

type SidePanelProps = { panel: Panel; onQuestion: (question: Question) => void; onJump: (at: PageRect) => void; onOpenNote: (noteId: string) => void };

/** The side panel's contents: one panel at a time, beside whichever view is open. */
function SidePanel({ panel, onQuestion, onJump, onOpenNote }: SidePanelProps) {
  switch (panel) {
    case "questions": return <QuestionList onPick={onQuestion} />;
    case "glossary": return <Glossary onJump={onJump} onOpenNote={onOpenNote} />;
    case "export": return <ExportDialog />;
    case "tags": return <TagManager />;
    case "template": return <TemplateEditor />;
  }
}

type ShellProps = { papers: PaperSummary[]; paperId: string; onChoose: (id: string) => void; onAdded: (id: string) => void };

/** Everything that depends on the open board. The view is the board's (D5): the one you left is the one that opens. */
function Shell({ papers, paperId, onChoose, onAdded }: ShellProps) {
  const { state, dispatch, view: { view, split: savedSplit }, setView } = useBoard();
  const views = useRef<HTMLDivElement>(null);
  const split = clampSplit(savedSplit);
  const [focusNode, setFocusNode] = useState<string | null>(null);
  const [focusRect, setFocusRect] = useState<PageRect | null>(null);
  const [panel, setPanel] = useState<Panel | null>(null);
  useUndoKeys(dispatch);
  const show = (next: View) => setView({ view: next });
  // In the both view each side is already in sight: going to the other only scrolls it there.
  const openOnBoard = (id: string) => { setFocusNode(id); if (view !== "both") show("board"); };
  // A fresh object every time, so the paper scrolls again even for the same rect.
  const openInPaper = (rect: PageRect) => { setFocusRect({ ...rect }); if (view !== "both") show("paper"); };
  /** A highlight opens in the paper, anything else on the board. */
  const onQuestion = (q: Question) => {
    if (q.kind !== "highlight") return openOnBoard(q.id);
    const rect = state.board.highlights.find((h) => h.id === q.id)?.anchor.rects[0];
    if (rect) openInPaper(rect);
  };
  const toggle = (p: Panel) => setPanel((current) => (current === p ? null : p));
  return (
    <>
      <div className="topbar">
        <span className="wordmark">Paper Board</span>
        <div className="paper-title"><PaperPicker papers={papers} value={paperId} onChange={onChoose} onAdded={onAdded} /></div>
        <div className="segmented" role="group" aria-label="View">
          <button aria-pressed={view === "paper"} onClick={() => show("paper")}>Paper</button>
          <button aria-pressed={view === "both"} onClick={() => show("both")}>Both</button>
          <button aria-pressed={view === "board"} onClick={() => show("board")}>Board</button>
        </div>
        <div className="panel-buttons">
          <PanelButton panel="questions" open={panel} label="Questions" onToggle={toggle} />
          <PanelButton panel="glossary" open={panel} label="Glossary" onToggle={toggle} />
          <PanelButton panel="export" open={panel} label="Export" onToggle={toggle} />
          <PanelButton panel="tags" open={panel} label="Tags" onToggle={toggle} />
          <PanelButton panel="template" open={panel} label="Template" onToggle={toggle} />
        </div>
        <Notice />
      </div>
      <div className="subbar">
        <input className="goal" aria-label="Reading goal" placeholder="Why am I reading this?" value={state.board.goal}
               onChange={(e) => dispatch({ type: "setGoal", goal: e.target.value })} />
        <FilterBar />
      </div>
      <div className="workspace">
        {/* Both views stay mounted and the inactive one is only hidden: switching never moves anything (SPEC 4). */}
        <div ref={views} className={`views ${view === "both" ? "both" : ""}`} style={view === "both" ? { gridTemplateColumns: bothColumns(split) } : undefined}>
          <div className={`view paper-pane ${view === "board" ? "inactive" : ""}`}>
            <PaperScreen focus={focusRect} onFocusHandled={() => setFocusRect(null)} onOpenOnBoard={openOnBoard} />
          </div>
          <div className={`view board-pane ${view === "paper" ? "inactive" : ""}`}>
            <BoardView active={view !== "paper"} focusNode={focusNode} onFocusHandled={() => setFocusNode(null)} onOpenInPaper={openInPaper} />
          </div>
          {view === "both" && <SplitDivider views={views} split={split} onCommit={(next) => setView({ split: next })} />}
        </div>
        {panel && <aside className="panel"><SidePanel panel={panel} onQuestion={onQuestion} onJump={openInPaper} onOpenNote={openOnBoard} /></aside>}
      </div>
    </>
  );
}

export default function App() {
  const [papers, setPapers] = useState<PaperSummary[]>([]);
  const [paperId, setPaperId] = useState<string | null>(null);
  useEffect(() => { api.listPapers().then(setPapers, (error: unknown) => console.error("Could not list the papers", error)); }, []);
  const choose = (id: string) => setPaperId(id || null);
  // A re-upload of the open paper must open it afresh, so the board key counts uploads too.
  const [uploads, setUploads] = useState(0);
  const added = (id: string) => {
    api.listPapers().then(setPapers, (error: unknown) => console.error("Could not list the papers", error));
    setUploads((n) => n + 1);
    setPaperId(id);
  };

  if (!paperId) {
    return (
      <div className="app">
        <div className="topbar"><span className="wordmark">Paper Board</span></div>
        <div className="start">
          <h1>Choose a paper</h1>
          <p>Read it, mark it, cut it into pieces, and lay the pieces out.</p>
          <PaperPicker papers={papers} value="" onChange={choose} onAdded={added} />
          <p className="how">Add one with <em>Add paper…</em> at the end of the list.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <BoardProvider key={`${paperId}:${uploads}`} paperId={paperId}>
        <Shell papers={papers} paperId={paperId} onChoose={choose} onAdded={added} />
      </BoardProvider>
    </div>
  );
}
