import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from "react";
import { api } from "../api/client";
import { paperWords } from "../board/marks";
import { boardReducer, initialBoardState, type BoardAction, type BoardState } from "../model/boardReducer";
import type { BoardNode, Source } from "../model/types";
import { createNoteStore, noteIO, type NoteStore } from "./notes";
import { defaultPaperView, withView, type PaperViewState } from "../model/paperView";
import { createPersistence, createViewPersistence } from "./persistence";
import { CLIP_FAILED_MESSAGE, planFirstOpen, planSplit, storeFigureClips } from "./split";

export const FIRST_OPEN_FAILED_MESSAGE = "Could not lay out this paper's sections. Use Split on the board to try again.";
export const NOTE_LOAD_FAILED_MESSAGE = "Could not load this note.";
export const NOTE_SAVE_FAILED_MESSAGE = "Could not save this note. Your text is kept here; edit it again to retry.";
/** Export and Split read what the server has saved; when a change could not be saved first, they must not run. */
export const FLUSH_FAILED_MESSAGE = "Some changes could not be saved yet, so this was not done. Try again once saving works.";

/** `words` is the paper's vocabulary, for reflowing its text (board/marks). */
type Ctx = {
  state: BoardState; dispatch: React.Dispatch<BoardAction>; source: Source; words: ReadonlySet<string>; notice: string | null; paperId: string;
  notes: NoteStore;
  /** How the paper is shown (view, scrolls, filter, split): not the board's, saved at `/view`. */
  view: PaperViewState; setView: (patch: Partial<PaperViewState>) => void;
  /** Saves any pending board change and waits for note writes: what export and split need first (SPEC 6).
   *  Rejects with FLUSH_FAILED_MESSAGE when the board or a note is still not saved. */
  flush: () => Promise<void>;
  /** Split (D16): what the board is missing goes into the tray as one undo step. Resolves to the pieces added. */
  split: () => Promise<number>;
};
const BoardContext = createContext<Ctx | null>(null);

export function BoardProvider({ paperId, children }: { paperId: string; children: React.ReactNode }) {
  const [state, dispatch] = useReducer(boardReducer, initialBoardState);
  const [source, setSource] = useState<Source | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const persistence = useRef<ReturnType<typeof createPersistence> | null>(null);
  const [view, setViewState] = useState<PaperViewState>(defaultPaperView);
  const viewPersistence = useMemo(() => createViewPersistence({
    save: (v) => api.putView(paperId, v),
    onError: (message) => { if (mounted.current) setNotice(message); },
  }), [paperId]);
  useEffect(() => () => { void viewPersistence.flush(); viewPersistence.dispose(); }, [viewPersistence]);
  /** Changes how the paper is shown: saved at `/view`, never dirties the board, never an undo step. */
  const setView = useCallback((patch: Partial<PaperViewState>) => {
    setViewState((current) => {
      const next = withView(current, patch);
      if (next !== current) viewPersistence.schedule(next);
      return next;
    });
  }, [viewPersistence]);

  const latest = useRef(state);
  latest.current = state;
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const notes = useMemo(() => createNoteStore(noteIO(paperId)), [paperId]);

  const storeClips = useCallback(async (nodes: BoardNode[]) => {
    const failed = await storeFigureClips(paperId, nodes, dispatch);
    if (failed.length && mounted.current) setNotice(CLIP_FAILED_MESSAGE(failed.length));
  }, [paperId]);

  useEffect(() => {
    let live = true;
    // First open (D15): a board never written (version 0) is laid out before the views see it. Under StrictMode the
    // first run is cleaned up before its fetch lands, so only one run lays out.
    const layOut = async (s: Source) => {
      try {
        const nodes = await planFirstOpen(paperId, s);
        if (!live) return;
        dispatch({ type: "upsertNodes", nodes });
        void storeClips(nodes);
      } catch (error) {
        console.error(FIRST_OPEN_FAILED_MESSAGE, error);
        if (live) setNotice(FIRST_OPEN_FAILED_MESSAGE);
      }
    };
    const open = async () => {
      // Where the reader left off is a convenience: if it cannot be read, the paper still opens, at the start.
      const view = api.getView(paperId).catch((error: unknown) => { console.error("Could not read the view state", error); return defaultPaperView; });
      const [s, b, v] = await Promise.all([api.getSource(paperId), api.getBoard(paperId), view]);
      if (!live) return;
      setViewState(v);
      dispatch({ type: "load", board: b });
      if (b.version === 0) await layOut(s);
      if (live) setSource(s);
    };
    open().catch((error: unknown) => {
      // An ApiError's message is the server's own ({"error": {code, message}}).
      console.error("Could not open the paper", error);
      if (live) setFailure(error instanceof Error ? error.message : String(error));
    });
    return () => { live = false; };
  }, [paperId, attempt, storeClips]);

  useEffect(() => {
    let live = true;
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
    // Note text typed but not yet written counts too (I1).
    const flushOnLeave = (event: BeforeUnloadEvent) => {
      if (!persist.hasUnsaved() && !notes.hasUnsaved()) return;
      event.preventDefault();
      event.returnValue = "";   // older browsers show the prompt only when returnValue is set
      void persist.flush();
      void notes.flush();
    };
    window.addEventListener("beforeunload", flushOnLeave);
    return () => {
      live = false;
      window.removeEventListener("beforeunload", flushOnLeave);
      void persist.flush();   // takes the pending board now, so the dispose below cannot cancel it
      persist.dispose();
      void notes.flush();     // and the notes typed into, still inside their debounce
    };
  }, [paperId, notes]);

  useEffect(() => {
    if (state.dirty) persistence.current?.schedule(state.board, state.revision);
  }, [state]);

  const flush = useCallback(async () => {
    await persistence.current?.flush();
    if (persistence.current?.hasUnsaved()) throw new Error(FLUSH_FAILED_MESSAGE);
    try {
      await notes.settled();
    } catch (cause) {
      console.error(FLUSH_FAILED_MESSAGE, cause);
      throw new Error(FLUSH_FAILED_MESSAGE);
    }
  }, [notes]);

  const split = useCallback(async () => {
    if (!source) return 0;
    const nodes = await planSplit(paperId, source, () => latest.current.board, flush);
    if (!nodes.length) return 0;
    dispatch({ type: "upsertNodes", nodes });
    void storeClips(nodes);
    return nodes.length - 1;   // the first node is the tray
  }, [paperId, source, flush, storeClips]);

  const words = useMemo(() => paperWords(source?.page_text ?? []), [source]);
  const value = useMemo(() => (source ? { state, dispatch, source, words, notice, paperId, notes, view, setView, flush, split } : null),
    [state, source, words, notice, paperId, notes, view, setView, flush, split]);
  if (!value && failure) {
    return (
      <div className="loading load-failed" role="alert">
        <p>Could not open this paper: {failure}</p>
        <button onClick={() => { setFailure(null); setAttempt((n) => n + 1); }}>Retry</button>
      </div>
    );
  }
  if (!value) return <p className="loading">Loading</p>;
  return <BoardContext.Provider value={value}>{children}</BoardContext.Provider>;
}

export function useBoard(): Ctx {
  const ctx = useContext(BoardContext);
  if (!ctx) throw new Error("useBoard outside BoardProvider");
  return ctx;
}

export type NoteHandle = {
  text: string | undefined; error: string | null; edit: (markdown: string) => void; commit: () => Promise<void>;
  /** The saved text could not be read: nothing may be typed over it until `retry` loads it. */
  loadFailed: boolean; retry: () => void;
  /** The note has a sketch (D23); `sketchVersion` changes with every save of it, for its image's URL. */
  hasSketch: boolean; sketchVersion: number;
  /** Tells every view the sketch was just written (`present`) or removed. Not a board change, so not an undo step. */
  sketchSaved: (present: boolean) => void;
};

/** One note's text, shared by every view that shows it. Loads on first use. `edit` is a keystroke: every view shows it
 *  at once and the store writes it after a pause in typing; `commit` writes it now (addendum 4.4, I1). */
export function useNote(nodeId: string): NoteHandle {
  const { notes } = useBoard();
  const text = useSyncExternalStore(notes.subscribe, () => notes.peek(nodeId));
  const failed = useSyncExternalStore(notes.subscribe, () => notes.failed(nodeId));
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    notes.load(nodeId).catch((cause: unknown) => {
      console.error(NOTE_LOAD_FAILED_MESSAGE, cause);
      if (live) setLoadFailed(true);
    });
    return () => { live = false; };
  }, [notes, nodeId, attempt]);
  const edit = useCallback((markdown: string) => notes.edit(nodeId, markdown), [notes, nodeId]);
  const commit = useCallback(() => notes.commit(nodeId), [notes, nodeId]);
  const retry = useCallback(() => { setLoadFailed(false); setAttempt((n) => n + 1); }, []);
  const sketchVersion = useSyncExternalStore(notes.subscribe, () => notes.sketchVersion(nodeId));
  const sketchSaved = useCallback((present: boolean) => notes.sketchSaved(nodeId, present), [notes, nodeId]);
  const error = loadFailed ? NOTE_LOAD_FAILED_MESSAGE : failed ? NOTE_SAVE_FAILED_MESSAGE : null;
  return { text, error, edit, commit, loadFailed, retry, hasSketch: sketchVersion > 0, sketchVersion, sketchSaved };
}
