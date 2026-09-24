import { api } from "../api/client";
import { SAVE_DELAY_MS } from "./persistence";

/** Note text is not in board.json (addendum 4.4). One store per paper, so the paper's margin, the mark popover and
 *  the board's card show the same text without fetching it three times. */
export type NoteStore = {
  peek: (nodeId: string) => string | undefined;
  load: (nodeId: string) => Promise<string>;
  save: (nodeId: string, markdown: string) => Promise<void>;
  /** A keystroke: every view shows the text at once, and it is written SAVE_DELAY_MS after the last one. */
  edit: (nodeId: string, markdown: string) => void;
  /** Writes this note's pending edit now (the field lost focus). Resolves once written; never rejects. */
  commit: (nodeId: string) => Promise<void>;
  /** Writes every pending edit now, tries failed writes again, and waits for every write. Never rejects: a failure
   *  is kept in `failed`. */
  flush: () => Promise<void>;
  /** flush, then rejects while any note's last write has failed, so export and split stop. */
  settled: () => Promise<void>;
  /** True while any note's text is not on the server: an edit waiting to be written, a write in flight, a failed one. */
  hasUnsaved: () => boolean;
  /** True while this note's last write has failed. */
  failed: (nodeId: string) => boolean;
  subscribe: (listener: () => void) => () => void;
};
export type NoteIO = { get: (nodeId: string) => Promise<string>; put: (nodeId: string, markdown: string) => Promise<void> };

export function noteIO(paperId: string): NoteIO {
  return { get: async (id) => (await api.getNote(paperId, id)).markdown, put: (id, markdown) => api.putNote(paperId, id, markdown) };
}

export function createNoteStore(io: NoteIO, delayMs = SAVE_DELAY_MS): NoteStore {
  const texts = new Map<string, string>();
  const loading = new Map<string, Promise<string>>();
  const listeners = new Set<() => void>();
  const failedIds = new Set<string>();   // notes whose last write did not land
  const pending = new Map<string, ReturnType<typeof setTimeout>>();   // notes edited and not yet written
  let inFlight = 0;
  let writes: Promise<void> = Promise.resolve();
  const emit = () => listeners.forEach((listener) => listener());
  const load = (id: string): Promise<string> => {
    const known = texts.get(id);
    if (known !== undefined) return Promise.resolve(known);
    const inFlightLoad = loading.get(id);
    if (inFlightLoad) return inFlightLoad;
    const request = io.get(id).then(
      (text) => {
        loading.delete(id);
        if (texts.has(id)) return texts.get(id)!;   // saved while loading: the reader's text is newer
        texts.set(id, text);
        emit();
        return text;
      },
      (error: unknown) => { loading.delete(id); throw error; });
    loading.set(id, request);
    return request;
  };
  const cancelPending = (id: string) => {
    const timer = pending.get(id);
    if (timer !== undefined) clearTimeout(timer);
    pending.delete(id);
  };
  const save = (id: string, markdown: string): Promise<void> => {
    cancelPending(id);
    texts.set(id, markdown);
    emit();
    inFlight++;
    const write = writes.then(() => io.put(id, markdown)).then(
      () => { if (failedIds.delete(id)) emit(); },
      (error: unknown) => { failedIds.add(id); emit(); throw error; },
    ).finally(() => { inFlight--; });
    writes = write.catch(() => undefined);   // the queue goes on; the caller of save sees the failure
    return write;
  };
  /** Writes the note's text as it stands. A failure is kept in `failedIds` for the views to show, so it is logged, not thrown. */
  const write = (id: string): Promise<void> =>
    save(id, texts.get(id) ?? "").catch((error: unknown) => console.error(`Could not save note ${id}`, error));
  const commit = (id: string): Promise<void> => (pending.has(id) ? write(id) : Promise.resolve());
  const edit = (id: string, markdown: string) => {
    cancelPending(id);
    texts.set(id, markdown);
    pending.set(id, setTimeout(() => { void commit(id); }, delayMs));
    emit();
  };
  /** Failed notes are tried again too: their text is still only here. */
  const flush = async () => {
    await Promise.all([...new Set([...pending.keys(), ...failedIds])].map(write));
    await writes;
  };
  const settled = () => flush().then(() => {
    if (failedIds.size) throw new Error(`${failedIds.size} note${failedIds.size === 1 ? "" : "s"} could not be saved.`);
  });
  return {
    peek: (id) => texts.get(id), load, save, edit, commit, flush, settled,
    hasUnsaved: () => pending.size > 0 || inFlight > 0 || failedIds.size > 0,
    failed: (id) => failedIds.has(id),
    subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}
