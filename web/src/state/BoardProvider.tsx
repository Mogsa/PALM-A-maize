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
    persistence.current = createPersistence({
      save: (board, version) => api.putBoard(paperId, board, version),
      reload: () => api.getBoard(paperId),
      onSaved: (version, revision) => dispatch({ type: "saved", version, revision }),
      onReload: (board) => dispatch({ type: "load", board }),
      onConflict: setNotice,
    });
    const flushOnLeave = () => persistence.current?.flush();
    window.addEventListener("beforeunload", flushOnLeave);
    return () => { live = false; window.removeEventListener("beforeunload", flushOnLeave); persistence.current?.dispose(); };
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
