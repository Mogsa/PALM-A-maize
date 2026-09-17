import { createContext, useContext, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { api } from "../api/client";
import { boardReducer, initialBoardState, type BoardAction, type BoardState } from "../model/boardReducer";
import type { Source } from "../model/types";
import { createPersistence } from "./persistence";

type Ctx = { state: BoardState; dispatch: React.Dispatch<BoardAction>; source: Source; notice: string | null; paperId: string };
const BoardContext = createContext<Ctx | null>(null);

export function BoardProvider({ paperId, children }: { paperId: string; children: React.ReactNode }) {
  const [state, dispatch] = useReducer(boardReducer, initialBoardState);
  const [source, setSource] = useState<Source | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const persistence = useRef<ReturnType<typeof createPersistence> | null>(null);

  useEffect(() => {
    let live = true;
    Promise.all([api.getSource(paperId), api.getBoard(paperId)]).then(([s, b]) => {
      if (!live) return;
      setSource(s);
      dispatch({ type: "load", board: b });
    });
    // Callbacks are bound to this paper. After cleanup they are ignored, so a late save of this paper
    // cannot change the state of the next one; the save itself still goes to this paper's route.
    const persist = createPersistence({
      save: (board, version) => api.putBoard(paperId, board, version),
      reload: () => api.getBoard(paperId),
      onSaved: (version, revision) => { if (live) { setNotice(null); dispatch({ type: "saved", version, revision }); } },
      onReload: (board) => { if (live) dispatch({ type: "load", board }); },
      onConflict: (message) => { if (live) setNotice(message); },
      onError: (message) => { if (live) setNotice(message); },
    });
    persistence.current = persist;
    // A flush alone cannot survive the tab closing: its PUT waits behind a microtask or a save in flight,
    // and the browser aborts it. So while anything is unsaved, ask the browser to show its leave prompt,
    // which holds the page long enough for the flush to land. (keepalive is no answer: 64 KB body cap.)
    const flushOnLeave = (event: BeforeUnloadEvent) => {
      if (!persist.hasUnsaved()) return;
      event.preventDefault();
      event.returnValue = "";   // older browsers show the prompt only when returnValue is set
      void persist.flush();
    };
    window.addEventListener("beforeunload", flushOnLeave);
    return () => {
      live = false;
      window.removeEventListener("beforeunload", flushOnLeave);
      void persist.flush();   // takes the pending board now, so the dispose below cannot cancel it
      persist.dispose();
    };
  }, [paperId]);

  useEffect(() => {
    if (state.dirty) persistence.current?.schedule(state.board, state.revision);
  }, [state]);

  const value = useMemo(() => (source ? { state, dispatch, source, notice, paperId } : null), [state, source, notice, paperId]);
  if (!value) return <p className="loading">Loading</p>;
  return <BoardContext.Provider value={value}>{children}</BoardContext.Provider>;
}

export function useBoard(): Ctx {
  const ctx = useContext(BoardContext);
  if (!ctx) throw new Error("useBoard outside BoardProvider");
  return ctx;
}
