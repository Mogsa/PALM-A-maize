import type { ActivityDetail, ActivityEvent, ActivityKind } from "./types";

/** The queue is sent this often, and at once when it holds BATCH_MAX events (activity log spec). */
export const FLUSH_MS = 5000;
export const BATCH_MAX = 50;
/** One request stays under the server's 64 KB limit, with room for the envelope. */
export const BATCH_BYTES = 48_000;
/** The server takes at most this many events in one request. */
export const REQUEST_MAX = 200;
/** A longer text (a very long note) is cut, so one event alone always fits in a request. */
export const TEXT_MAX = 20_000;

export type LogFn = (kind: ActivityKind, action: string, detail?: ActivityDetail) => void;
export type ActivityLog = {
  /** Queues one event with the time now. Never throws; queues nothing while the log is off. */
  log: LogFn;
  /** Sends the queue. `keepalive` for a send on pagehide. Never rejects. */
  flush: (keepalive?: boolean) => Promise<void>;
};
type Options = {
  send: (events: ActivityEvent[], keepalive: boolean) => Promise<void>;
  enabled: () => boolean;
  now?: () => Date;
};
/** `tries` counts failed sends: the log is a record, not the reader's work, so an event is tried twice, then dropped. */
type Queued = { event: ActivityEvent; tries: number };

const cut = (detail: ActivityDetail): ActivityDetail => Object.fromEntries(Object.entries(detail).map(([k, v]) =>
  [k, typeof v === "string" && v.length > TEXT_MAX ? `${v.slice(0, TEXT_MAX)}…` : v]));

const bytes = new TextEncoder();

/** The queue in order, as requests each under BATCH_BYTES (UTF-8, as the server counts) and REQUEST_MAX events. */
function requests(queue: Queued[]): Queued[][] {
  const out: Queued[][] = [];
  let current: Queued[] = [];
  let total = 0;
  for (const q of queue) {
    const size = bytes.encode(JSON.stringify(q.event)).length + 1;
    if (current.length && (total + size > BATCH_BYTES || current.length >= REQUEST_MAX)) { out.push(current); current = []; total = 0; }
    current.push(q);
    total += size;
  }
  if (current.length) out.push(current);
  return out;
}

export function createActivityLog({ send, enabled, now = () => new Date() }: Options): ActivityLog {
  let queue: Queued[] = [];

  const flush = async (keepalive = false) => {
    if (!queue.length) return;
    const taken = queue;
    queue = [];   // taken now, so a flush that overlaps this one sends only what came after
    const retry: Queued[] = [];
    for (const batch of requests(taken)) {
      try {
        await send(batch.map((q) => q.event), keepalive);
      } catch (error) {
        const again = batch.filter((q) => q.tries === 0).map((q) => ({ ...q, tries: 1 }));
        const dropped = batch.length - again.length;
        if (dropped) console.error(`Could not record ${dropped} activity event${dropped === 1 ? "" : "s"}; dropped`, error);
        retry.push(...again);
      }
    }
    queue = [...retry, ...queue];
  };

  const log: LogFn = (kind, action, detail = {}) => {
    try {
      if (!enabled()) return;
      queue.push({ event: { t: now().toISOString(), kind, action, detail: cut(detail) }, tries: 0 });
      if (queue.length >= BATCH_MAX) void flush();
    } catch (error) {
      console.error("Could not record an activity event", error);
    }
  };

  return { log, flush };
}
