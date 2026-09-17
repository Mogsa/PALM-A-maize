import { toBoardJson } from "../model/serialize";
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

type Pending = { board: Board; revision?: number; seq: number };

/** Debounced, versioned saves. The latest board wins the debounce; a 409 reloads and stops. */
export function createPersistence(opts: PersistenceOptions) {
  const delay = opts.delayMs ?? SAVE_DELAY_MS;
  let pending: Pending | null = null;
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

  const reportError = (error: unknown) => {
    if (opts.onError) opts.onError(SAVE_FAILED_MESSAGE);
    else console.error(SAVE_FAILED_MESSAGE, error);
  };

  const run = async (item: Pending) => {
    const { board, revision } = item;
    if (board.version < reloadedVersion) return;
    let result: SaveResult;
    try {
      result = await opts.save(toBoardJson(board), Math.max(board.version, knownVersion));
    } catch (error) {
      if (item.seq === scheduled) pending = item;   // keep the change for the next flush unless a newer board exists
      reportError(error);
      return;
    }
    if ("conflict" in result) {
      const fresh = await opts.reload();
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
    queue = queue.then(() => run(item)).catch(reportError);
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

  return { schedule, flush, dispose };
}
