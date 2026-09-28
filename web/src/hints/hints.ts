import { useEffect, useState, useSyncExternalStore } from "react";

export type HintId = "drag-cut" | "connect" | "dblclick-note";
export const HINT_TEXT: Record<HintId, string> = {
  "drag-cut": "Drag selected text onto the board to cut it",
  connect: "Drag from a card's edge to connect it",
  "dblclick-note": "Double-click to add a note",
};
/** Which hints were ever shown: a convenience of this browser, not the reader's work (spec A4). */
const STORAGE_KEY = "paperboard.hints.seen";

type Snapshot = { seen: ReadonlySet<string>; closed: ReadonlySet<string> };
const listeners = new Set<() => void>();

function readSeen(): Set<string> {
  try {
    const list: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
    return new Set(Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : []);
  } catch (failure) {
    console.warn("Could not read which hints were seen; showing them this session only", failure);
    return new Set();
  }
}

let snapshot: Snapshot = { seen: readSeen(), closed: new Set() };

function update(next: Snapshot) {
  snapshot = next;
  listeners.forEach((l) => l());
}

function markSeen(id: HintId) {
  if (snapshot.seen.has(id)) return;
  const seen = new Set(snapshot.seen).add(id);
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...seen])); }
  catch (failure) { console.warn("Could not save that a hint was seen", failure); }
  update({ ...snapshot, seen });
}

/** The hint's gesture was done, or it was dismissed: it goes, and is never shown again. */
export function closeHint(id: HintId) {
  markSeen(id);
  if (!snapshot.closed.has(id)) update({ ...snapshot, closed: new Set(snapshot.closed).add(id) });
}

export function resetHintsForTest() { update({ seen: readSeen(), closed: new Set() }); }

const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

/** Whether hint `id` shows now: when it applies, if it was never shown before. Once shown, it is recorded as seen,
 *  and it stays until its moment passes, its gesture is done, or it is dismissed. */
export function useHint(id: HintId, when: boolean): boolean {
  const { seen, closed } = useSyncExternalStore(subscribe, () => snapshot);
  const [shownHere, setShownHere] = useState(false);
  const visible = when && !closed.has(id) && (shownHere || !seen.has(id));
  useEffect(() => {
    if (visible && !shownHere) { setShownHere(true); markSeen(id); }
    if (shownHere && !when) closeHint(id);
  }, [visible, shownHere, when, id]);
  return visible;
}
