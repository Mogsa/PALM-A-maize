import { toBoardJson } from "../model/serialize";
import type { PaperViewState } from "../model/paperView";
import type { Board } from "../model/types";

type SaveResult = { version: number } | { conflict: true; current: number };

export type PersistenceOptions = {
  save: (board: Board, version: number) => Promise<SaveResult>;
  reload: () => Promise<Board>;
  /** `revision` is the one passed to `schedule` with the board that was saved. */
  onSaved: (version: number, revision?: number) => void;
  onReload?: (board: Board) => void;
  onConflict: (message: string) => void;
  /** A save or reload threw (network down, server error). Without it the failure goes to console.error. */
  onError?: (message: string) => void;
  delayMs?: number;
};

export const SAVE_DELAY_MS = 500;
export const CONFLICT_MESSAGE = "This board was changed in another window. Reloaded it; your last change was not saved.";
export const SAVE_FAILED_MESSAGE = "Could not save the board. Your change is kept and will be saved with your next change.";
export const CONFLICT_RELOAD_FAILED_MESSAGE = "This board changed in another window, but could not be reloaded. Your local changes remain unsaved. The next change will retry the reload.";

type Pending = { board: Board; revision?: number; seq: number };

/** Debounced, versioned saves. The latest board wins the debounce; a 409 reloads and stops. */
export function createPersistence(opts: PersistenceOptions) {
  const delay = opts.delayMs ?? SAVE_DELAY_MS;
  let pending: Pending | null = null;
  let conflictPending = false; // retry recovery with GET, never overwrite a conflicted board
  let scheduled = 0;   // bumped by every schedule, so a failed run can tell whether a newer board exists
  // The newest version this tab has seen, from a save or a reload. A board scheduled while a save was in
  // flight still carries the version before that save; sending it would 409 against this tab's own write.
  let knownVersion = 0;
  // The version of the last board reloaded after a conflict. Any board older than it was built before the
  // reload, however late it reaches schedule, and must never be saved: its raised If-Match would win.
  let reloadedVersion = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  // Every run waits for the one before it, so there is never more than one PUT in flight.
  let queue: Promise<void> = Promise.resolve();
  let inFlight = 0;   // runs queued or running; a board taken off `pending` is unsaved until its run ends

  const reportError = (error: unknown) => {
    const message = conflictPending ? CONFLICT_RELOAD_FAILED_MESSAGE : SAVE_FAILED_MESSAGE;
    if (opts.onError) opts.onError(message);
    else console.error(message, error);
  };

  const run = async (item: Pending) => {
    const { board, revision } = item;
    if (board.version < reloadedVersion) return;
    let result: SaveResult;
    try {
      result = conflictPending ? { conflict: true, current: knownVersion }
        : await opts.save(toBoardJson(board), Math.max(board.version, knownVersion));
    } catch (error) {
      if (item.seq === scheduled) pending = item;   // keep the change for the next flush unless a newer board exists
      reportError(error);
      return;
    }
    if ("conflict" in result) {
      conflictPending = true;
      let fresh: Board;
      try {
        fresh = await opts.reload();
      } catch (error) {
        if (item.seq === scheduled) pending = item;
        reportError(error);
        return;
      }
      conflictPending = false;
      knownVersion = fresh.version;
      reloadedVersion = fresh.version;
      opts.onReload?.(fresh);
      opts.onConflict(CONFLICT_MESSAGE);
      return;
    }
    knownVersion = result.version;
    opts.onSaved(result.version, revision);
  };

  /** Take the pending board now, so a dispose that follows cannot cancel it, and run it behind any save
   *  in flight. Failures are reported, never rejected: the queue and the caller both keep going. */
  const enqueue = () => {
    const item = pending;
    pending = null;
    if (!item) return queue;
    inFlight++;
    queue = queue.then(() => run(item)).catch(reportError).finally(() => { inFlight--; });
    return queue;
  };

  const fire = () => {
    timer = null;
    enqueue();
  };

  const schedule = (board: Board, revision?: number) => {
    pending = { board, revision, seq: ++scheduled };
    if (timer) clearTimeout(timer);
    timer = setTimeout(fire, delay);
  };

  const flush = async () => {
    if (timer) { clearTimeout(timer); timer = null; }
    await enqueue();
  };

  const dispose = () => { if (timer) clearTimeout(timer); pending = null; };

  /** True while any change of the reader's is not yet on the server: a board waiting for its debounce,
   *  a failed one kept for retry, or a save still in flight. Closing the tab now would lose it. */
  const hasUnsaved = () => conflictPending || pending !== null || timer !== null || inFlight > 0;

  return { schedule, flush, dispose, hasUnsaved };
}

export const VIEW_SAVE_FAILED_MESSAGE = "Could not save where you left this paper. It will be saved with your next move.";

export type ViewPersistenceOptions = {
  save: (view: PaperViewState) => Promise<void>;
  onError?: (message: string) => void;
  delayMs?: number;
};

/** Debounced puts of the view state. Unversioned: the latest view wins, and it never touches the board. */
export function createViewPersistence(opts: ViewPersistenceOptions) {
  const delay = opts.delayMs ?? SAVE_DELAY_MS;
  let pending: PaperViewState | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let queue: Promise<void> = Promise.resolve();

  const run = async (view: PaperViewState) => {
    try {
      await opts.save(view);
    } catch (error) {
      if (opts.onError) opts.onError(VIEW_SAVE_FAILED_MESSAGE);
      else console.error(VIEW_SAVE_FAILED_MESSAGE, error);
    }
  };
  const enqueue = () => {
    const view = pending;
    pending = null;
    if (view) queue = queue.then(() => run(view));
    return queue;
  };
  const schedule = (view: PaperViewState) => {
    pending = view;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; void enqueue(); }, delay);
  };
  const flush = async () => {
    if (timer) { clearTimeout(timer); timer = null; }
    await enqueue();
  };
  const dispose = () => { if (timer) clearTimeout(timer); timer = null; pending = null; };
  return { schedule, flush, dispose };
}
