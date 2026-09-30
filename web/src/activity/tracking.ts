/** Small state the activity log keeps to decide when something happened: page dwell and a note's edit. */

/** A page counts as read once the paper rested on it this long (activity log spec). */
export const DWELL_MIN_MS = 2000;
export type PageDwell = { page: number; seconds: number };

/** Which page the paper rests on, and since when. `move` gives the page it has just left (counted from 1) when it
 *  rested there DWELL_MIN_MS or more; `null` means nothing is being read (the board alone, the tab hidden, closed). */
export function createDwell() {
  let current: { page: number; since: number } | null = null;
  return {
    move(page: number | null, at: number): PageDwell | null {
      if (current && current.page === page) return null;
      const left = current;
      current = page === null ? null : { page, since: at };
      if (!left || at - left.since < DWELL_MIN_MS) return null;
      return { page: left.page + 1, seconds: Math.round((at - left.since) / 1000) };
    },
  };
}

/** A note's text when its editing began, so the end of an edit can tell whether anything changed. The first text seen
 *  is the note as loaded; each end of an edit is the next baseline. A note never seen was empty. */
export function createNoteEdits() {
  const before = new Map<string, string>();
  return {
    seen(id: string, text: string) {
      if (!before.has(id)) before.set(id, text);
    },
    ended(id: string, text: string): boolean {
      const was = before.get(id) ?? "";
      before.set(id, text);
      return was !== text;
    },
  };
}
