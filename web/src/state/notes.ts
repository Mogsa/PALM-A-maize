import { api } from "../api/client";

/** Note text is not in board.json (addendum 4.4). One store per paper, so the paper's margin, the mark popover and
 *  the board's card show the same text without fetching it three times. */
export type NoteStore = {
  peek: (nodeId: string) => string | undefined;
  load: (nodeId: string) => Promise<string>;
  save: (nodeId: string, markdown: string) => Promise<void>;
  settled: () => Promise<void>;
  subscribe: (listener: () => void) => () => void;
};
export type NoteIO = { get: (nodeId: string) => Promise<string>; put: (nodeId: string, markdown: string) => Promise<void> };

export function noteIO(paperId: string): NoteIO {
  return { get: async (id) => (await api.getNote(paperId, id)).markdown, put: (id, markdown) => api.putNote(paperId, id, markdown) };
}

export function createNoteStore(io: NoteIO): NoteStore {
  const texts = new Map<string, string>();
  const loading = new Map<string, Promise<string>>();
  const listeners = new Set<() => void>();
  const failed = new Set<string>();   // notes whose last write did not land
  let writes: Promise<void> = Promise.resolve();
  const emit = () => listeners.forEach((listener) => listener());
  const load = (id: string): Promise<string> => {
    const known = texts.get(id);
    if (known !== undefined) return Promise.resolve(known);
    const inFlight = loading.get(id);
    if (inFlight) return inFlight;
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
  const save = (id: string, markdown: string): Promise<void> => {
    texts.set(id, markdown);
    emit();
    const write = writes.then(() => io.put(id, markdown)).then(
      () => { failed.delete(id); },
      (error: unknown) => { failed.add(id); throw error; });
    writes = write.catch(() => undefined);   // the queue goes on; the caller of save sees the failure
    return write;
  };
  /** Waits for every queued write; rejects while any note's last write has failed, so export and split stop. */
  const settled = () => writes.then(() => {
    if (failed.size) throw new Error(`${failed.size} note${failed.size === 1 ? "" : "s"} could not be saved.`);
  });
  return {
    peek: (id) => texts.get(id), load, save, settled,
    subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}
