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
  delayMs?: number;
};

export const SAVE_DELAY_MS = 500;
export const CONFLICT_MESSAGE = "This board was changed in another window. Reloaded it; your last change was not saved.";

/** Debounced, versioned saves. The latest board wins the debounce; a 409 reloads and stops. */
export function createPersistence(opts: PersistenceOptions) {
  const delay = opts.delayMs ?? SAVE_DELAY_MS;
  let pending: { board: Board; revision?: number } | null = null;
  // The newest version this tab has seen, from a save or a reload. A board scheduled while a save was in
  // flight still carries the version before that save; sending it would 409 against this tab's own write.
  let knownVersion = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  // Every run waits for the one before it, so there is never more than one PUT in flight.
  let queue: Promise<void> = Promise.resolve();

  const run = async () => {
    if (!pending) return;
    const { board, revision } = pending;
    pending = null;
    const result = await opts.save(toBoardJson(board), Math.max(board.version, knownVersion));
    if ("conflict" in result) {
      const fresh = await opts.reload();
      // Anything scheduled before the reload lands was built on the stale board; with knownVersion
      // raised it would overwrite the other tab's work. The conflict message tells the reader.
      pending = null;
      knownVersion = fresh.version;
      opts.onReload?.(fresh);
      opts.onConflict(CONFLICT_MESSAGE);
      return;
    }
    knownVersion = result.version;
    opts.onSaved(result.version, revision);
  };

  /** Queue a run behind any in flight. A failed run rejects its own promise but not the queue. */
  const enqueue = () => {
    const job = queue.then(run);
    queue = job.catch(() => {});
    return job;
  };

  const fire = () => {
    timer = null;
    void enqueue();
  };

  const schedule = (board: Board, revision?: number) => {
    pending = { board, revision };
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
