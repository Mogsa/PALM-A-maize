import type { ActivityDetail, ActivityEvent, ActivityKind } from "./types";

/** The queue is sent this often, and at once when it holds BATCH_MAX events (activity log spec). */
export const FLUSH_MS = 5000;
export const BATCH_MAX = 50;

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

export function createActivityLog({ send, enabled, now = () => new Date() }: Options): ActivityLog {
  let queue: Queued[] = [];

  const flush = async (keepalive = false) => {
    if (!queue.length) return;
    const batch = queue;
    queue = [];   // taken now, so a flush that overlaps this one sends only what came after
    try {
      await send(batch.map((q) => q.event), keepalive);
    } catch (error) {
      const retry = batch.filter((q) => q.tries === 0).map((q) => ({ ...q, tries: 1 }));
      const dropped = batch.length - retry.length;
      if (dropped) console.error(`Could not record ${dropped} activity event${dropped === 1 ? "" : "s"}; dropped`, error);
      queue = [...retry, ...queue];
    }
  };

  const log: LogFn = (kind, action, detail = {}) => {
    try {
      if (!enabled()) return;
      queue.push({ event: { t: now().toISOString(), kind, action, detail }, tries: 0 });
      if (queue.length >= BATCH_MAX) void flush();
    } catch (error) {
      console.error("Could not record an activity event", error);
    }
  };

  return { log, flush };
}
