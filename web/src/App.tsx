import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api/client";
import { AiProvider, useAi } from "./ai/AiProvider";
import { AiStatus } from "./ai/AiStatus";
import { aiGlossary, type AiGlossaryEntry } from "./ai/terms";
import { BoardView } from "./board/BoardView";
import type { PageRect, PaperSummary, Question, View } from "./model/types";
import { CommandPalette } from "./commands/CommandPalette";
import { extraCommands } from "./commands/registry";
import { shellCommands, type Panel } from "./commands/shellCommands";
import { ShortcutsSheet } from "./commands/ShortcutsSheet";
import { useCommandKeys } from "./commands/useCommandKeys";
import { useSplit } from "./commands/useSplit";
import { activityCommands } from "./activity/commands";
import { Activity } from "./panels/Activity";
import { CountedButton, sentenceCount } from "./panels/CountedButton";
import { ExportDialog } from "./panels/ExportDialog";
import { Glossary } from "./panels/Glossary";
import { KeySentences } from "./panels/KeySentences";
import { QuestionList } from "./panels/QuestionList";
import { useQuestions } from "./panels/useQuestions";
import { TemplateEditor } from "./panels/TemplateEditor";
import { useUndoKeys } from "./panels/undoKeys";
import { anyTagged } from "./model/filter";
import { clampSplit } from "./model/paperView";
import { glossary, termTagIds } from "./paper/term";
import { PaperPicker } from "./PaperPicker";
import { PaperScreen } from "./PaperScreen";
import { bothColumns, SplitDivider } from "./SplitDivider";
import { BoardProvider, useBoard } from "./state/BoardProvider";
import { useTags } from "./state/TagsProvider";
import { FilterBar } from "./tags/FilterBar";
import { TagManager } from "./tags/TagManager";
import "./styles.css";


function Notice() {
  const { notice, state } = useBoard();
  const tone = notice ? "warn" : state.dirty ? "unsaved" : "";
  return <span className={`notice ${tone}`}>{notice ?? (state.dirty ? "Unsaved" : `Saved v${state.board.version}`)}</span>;
}

type SidePanelProps = {
  panel: Panel; onQuestion: (question: Question) => void; onJump: (at: PageRect) => void; onOpenNote: (noteId: string) => void;
  aiTerms: AiGlossaryEntry[];
};

/** The side panel's contents: one panel at a time, beside whichever view is open. */
function SidePanel({ panel, onQuestion, onJump, onOpenNote, aiTerms }: SidePanelProps) {
  switch (panel) {
    case "questions": return <QuestionList onPick={onQuestion} />;
    case "glossary": return <Glossary onJump={onJump} onOpenNote={onOpenNote} aiTerms={aiTerms} />;
    case "keySentences": return <KeySentences />;
    case "export": return <ExportDialog />;
    case "tags": return <TagManager />;
    case "template": return <TemplateEditor />;
    case "activity": return <Activity />;
  }
}

type ShellProps = { papers: PaperSummary[]; paperId: string; onChoose: (id: string) => void; onAdded: (id: string) => void };

/** Everything that depends on the open board. The view is the board's (D5): the one you left is the one that opens.
 *  A thin wrapper so `openInPaper` exists before AiProvider (its `goTo`) is mounted. */
function Shell({ papers, paperId, onChoose, onAdded }: ShellProps) {
  const { view: { view }, setView } = useBoard();
  const [focusRect, setFocusRect] = useState<PageRect | null>(null);
  const show = (next: View) => setView({ view: next });
  // A fresh object every time, so the paper scrolls again even for the same rect.
  const openInPaper = useCallback((rect: PageRect) => { setFocusRect({ ...rect }); if (view !== "both") show("paper"); }, [view]);   // eslint-disable-line react-hooks/exhaustive-deps -- show only calls setView
  return (
    <AiProvider goTo={openInPaper}>
      <ShellBody papers={papers} paperId={paperId} onChoose={onChoose} onAdded={onAdded}
                 focusRect={focusRect} setFocusRect={setFocusRect} openInPaper={openInPaper} />
    </AiProvider>
  );
}

type ShellBodyProps = ShellProps & {
  focusRect: PageRect | null; setFocusRect: (r: PageRect | null) => void; openInPaper: (rect: PageRect) => void;
};

function ShellBody({ papers, paperId, onChoose, onAdded, focusRect, setFocusRect, openInPaper }: ShellBodyProps) {
  const { state, dispatch, view: { view, split: savedSplit }, setView } = useBoard();
  const views = useRef<HTMLDivElement>(null);
  const split = clampSplit(savedSplit);
  const [focusNode, setFocusNode] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [noteRequests, setNoteRequests] = useState(0);
  const [findRequest, setFindRequest] = useState<{ text: string } | null>(null);
  /** Find in paper from anywhere: the paper is shown first when the board alone is. */
  const requestFind = useCallback((text: string) => { setFindRequest({ text }); if (view === "board") show("paper"); }, [view]);   // eslint-disable-line react-hooks/exhaustive-deps -- show only calls setView
  const findHandled = useCallback(() => setFindRequest(null), []);
  useUndoKeys(dispatch);
  const board = useBoard();
  const { tags } = useTags();
  const { questions } = useQuestions();
  const { ai, keySentences } = useAi();   // null and none when stale
  const readerTerms = useMemo(() => glossary(state.board, termTagIds(tags)), [state.board, tags]);
  const aiTerms = useMemo(() => aiGlossary(ai, readerTerms.map((e) => e.term)), [ai, readerTerms]);
  const terms = readerTerms.length + aiTerms.length;
  const [palette, setPalette] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);
  const splitAction = useSplit();
  const openPalette = useCallback(() => setPalette(true), []);
  const openShortcuts = useCallback(() => setShortcuts(true), []);
  useCommandKeys({ onPalette: openPalette, onShortcuts: openShortcuts });
  const show = (next: View) => setView({ view: next });
  // In the both view each side is already in sight: going to the other only scrolls it there.
  const openOnBoard = (id: string) => { setFocusNode(id); if (view !== "both") show("board"); };
  /** A highlight opens in the paper, anything else on the board. */
  const onQuestion = (q: Question) => {
    if (q.kind !== "highlight") return openOnBoard(q.id);
    const rect = state.board.highlights.find((h) => h.id === q.id)?.anchor.rects[0];
    if (rect) openInPaper(rect);
  };
  const toggle = (p: Panel) => setPanel((current) => (current === p ? null : p));
  const { activity } = board;
  useEffect(() => { if (panel === "keySentences") activity.log("ai", "key-sentences"); }, [panel, activity]);
  /** A new note is made on the board: from the paper alone, the board is shown first. */
  const newNote = () => { if (view === "paper") show("board"); setNoteRequests((n) => n + 1); };
  const commands = [
    ...shellCommands({ openPanel: (p) => setPanel(p), newNote, find: () => requestFind(""), split: () => void splitAction.run(), shortcuts: openShortcuts }),
    ...activityCommands({ on: board.view.log, setOn: (log) => setView({ log }), open: () => setPanel("activity") }),
    ...extraCommands(board),
  ];
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
        <input className="goal" aria-label="Reading goal" placeholder="Why am I reading this?" value={state.board.goal}
               onChange={(e) => dispatch({ type: "setGoal", goal: e.target.value })} />
        <AiStatus />
        <div className="panel-buttons">
          <CountedButton panel="questions" open={panel} label="Questions" count={questions?.length ?? 0} onToggle={toggle} />
          <CountedButton panel="glossary" open={panel} label="Glossary" count={terms} onToggle={toggle} />
          <CountedButton panel="keySentences" open={panel} label="Key sentences" count={sentenceCount(keySentences)} onToggle={toggle} />
          <button type="button" className="panel-button kbd" aria-label="Commands (⌘K)" title="All commands" onClick={openPalette}>⌘K</button>
          {splitAction.said && <span className="tool-note" role="status">{splitAction.said}</span>}
        </div>
        <Notice />
      </div>
      {/* The tag filter only once something carries a tag: until then there is nothing to filter by. */}
      {anyTagged(state.board) && <div className="subbar"><FilterBar /></div>}
      <div className="workspace">
        {/* Both views stay mounted and the inactive one is only hidden: switching never moves anything (SPEC 4). */}
        <div ref={views} className={`views ${view === "both" ? "both" : ""}`} style={view === "both" ? { gridTemplateColumns: bothColumns(split) } : undefined}>
          <div className={`view paper-pane ${view === "board" ? "inactive" : ""}`}>
            <PaperScreen focus={focusRect} onFocusHandled={() => setFocusRect(null)} onOpenOnBoard={openOnBoard}
                         findRequest={findRequest} onFindHandled={findHandled} />
          </div>
          <div className={`view board-pane ${view === "paper" ? "inactive" : ""}`}>
            <BoardView active={view !== "paper"} noteRequests={noteRequests} focusNode={focusNode} onFocusHandled={() => setFocusNode(null)}
                       onOpenInPaper={openInPaper} onFind={requestFind} />
          </div>
          {view === "both" && <SplitDivider views={views} split={split} onCommit={(next) => setView({ split: next })} />}
        </div>
        {panel && <aside className="panel"><SidePanel panel={panel} onQuestion={onQuestion} onJump={openInPaper} onOpenNote={openOnBoard} aiTerms={aiTerms} /></aside>}
      </div>
      {palette && <CommandPalette commands={commands} onClose={() => setPalette(false)} />}
      {shortcuts && <ShortcutsSheet onClose={() => setShortcuts(false)} />}
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
