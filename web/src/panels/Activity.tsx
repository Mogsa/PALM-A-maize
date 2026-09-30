import { useEffect, useMemo, useState } from "react";
import { clock, describeEvent } from "../activity/sentences";
import type { ActivityEvent } from "../activity/types";
import { api } from "../api/client";
import { useBoard } from "../state/BoardProvider";
import { useTags } from "../state/TagsProvider";

/** How much of the log the panel reads: the latest events. */
export const ACTIVITY_LIMIT = 500;
export const ACTIVITY_READ_FAILED = "Could not read the activity log.";

/** The paper's activity log in plain words, newest first (activity log spec), with its on/off switch. Read when the
 *  panel opens, after what is still queued is sent, so the latest steps are in it. */
export function Activity() {
  const { paperId, view, setView, activity } = useBoard();
  const { tags } = useTags();
  const [events, setEvents] = useState<ActivityEvent[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    activity.flush().then(() => api.getActivity(paperId, ACTIVITY_LIMIT)).then(
      (read) => { if (live) setEvents(read); },
      (error: unknown) => { console.error(ACTIVITY_READ_FAILED, error); if (live) setFailed(true); },
    );
    return () => { live = false; };
  }, [paperId, activity]);
  const tagName = useMemo(() => {
    const names = new Map(tags.map((t) => [t.id, t.name]));
    return (id: string) => names.get(id);
  }, [tags]);
  const newestFirst = useMemo(() => [...(events ?? [])].reverse(), [events]);
  return (
    <section className="activity" aria-label="Activity">
      <h3>Activity</h3>
      <p className="hint">
        {view.log ? "Recording what you do in this paper, on this computer only. " : "Not recording: nothing new is added. "}
        <button type="button" className="quiet" onClick={() => setView({ log: !view.log })}>{view.log ? "Turn off" : "Turn on"}</button>
      </p>
      {failed && <p className="hint" role="alert">{ACTIVITY_READ_FAILED}</p>}
      {events && !events.length && <p className="hint">Nothing recorded yet.</p>}
      <ol>
        {newestFirst.map((e, i) => (
          <li key={`${e.t}-${i}`}><time dateTime={e.t}>{clock(e.t)}</time>{describeEvent(e, tagName)}</li>
        ))}
      </ol>
    </section>
  );
}
