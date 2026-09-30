import { useEffect, useMemo, useRef } from "react";
import { api } from "../api/client";
import type { PaperViewState } from "../model/paperView";
import { createActivityLog, FLUSH_MS, type LogFn } from "./logger";
import { createDwell, createNoteEdits, type PageDwell } from "./tracking";

export type Activity = {
  log: LogFn;
  flush: (keepalive?: boolean) => Promise<void>;
  /** A note's text as a view first has it, the baseline its next edit is compared with. */
  noteSeen: (id: string, text: string) => void;
  /** A note's editing ended (blur or close): logs its text when it changed. `on`: what it is connected to, if anything. */
  noteEnded: (id: string, text: string, on: string | null) => void;
};

function createActivity(paperId: string, enabled: () => boolean): Activity {
  const { log, flush } = createActivityLog({ send: (events, keepalive) => api.postActivity(paperId, events, { keepalive }), enabled });
  const edits = createNoteEdits();
  return {
    log, flush,
    noteSeen: edits.seen,
    noteEnded: (id, text, on) => { if (edits.ended(id, text)) log("build", "note", { id, text, on }); },
  };
}

/** The page the reader is on, from 0, or null while the paper is not in sight. No scroll yet is the first page. */
const pageInSight = (ready: boolean, view: PaperViewState): number | null =>
  ready && view.view !== "board" ? (view.paper_scroll?.page ?? 0) : null;

/** The open paper's activity log (activity log spec). Also logs what it can see from here: the session's open and close
 *  (pagehide, or another paper chosen), the view switched, and the page the paper rests on. `ready`: the paper and its
 *  view have loaded, so `view.log` is the paper's own. */
export function useActivity(paperId: string, ready: boolean, view: PaperViewState): Activity {
  const enabled = useRef(view.log);
  enabled.current = view.log;
  const activity = useMemo(() => createActivity(paperId, () => enabled.current), [paperId]);
  const dwell = useMemo(() => createDwell(), [paperId]);   // eslint-disable-line react-hooks/exhaustive-deps -- one per paper
  const page = pageInSight(ready, view);
  const pageRef = useRef(page);
  pageRef.current = page;

  useEffect(() => {
    const logPage = (read: PageDwell | null) => { if (read) activity.log("read", "page", read); };
    const movePage = (to: number | null) => logPage(dwell.move(to, Date.now()));
    if (!ready) return;
    const open = () => { activity.log("session", "open"); movePage(pageRef.current); };
    const close = () => { movePage(null); activity.log("session", "close"); void activity.flush(true); };
    const onShow = (event: PageTransitionEvent) => { if (event.persisted) open(); };   // back from the browser's cache
    const onVisibility = () => movePage(document.hidden ? null : pageRef.current);
    open();
    const timer = setInterval(() => void activity.flush(), FLUSH_MS);
    window.addEventListener("pagehide", close);
    window.addEventListener("pageshow", onShow);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(timer);
      window.removeEventListener("pagehide", close);
      window.removeEventListener("pageshow", onShow);
      document.removeEventListener("visibilitychange", onVisibility);
      close();
    };
  }, [activity, dwell, ready]);

  useEffect(() => {
    if (!ready || document.hidden) return;
    const read = dwell.move(page, Date.now());
    if (read) activity.log("read", "page", read);
  }, [activity, dwell, ready, page]);

  const shown = useRef<string | null>(null);
  useEffect(() => {
    if (!ready) return;
    if (shown.current !== null && shown.current !== view.view) activity.log("read", "view", { view: view.view });
    shown.current = view.view;
  }, [activity, ready, view.view]);

  return activity;
}
