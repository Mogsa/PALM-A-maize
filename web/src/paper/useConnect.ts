import { useEffect, useState } from "react";
import { api } from "../api/client";
import { linesInside } from "../model/geometry";
import { newId } from "../model/ids";
import { newEdge } from "../model/links";
import type { Section } from "../model/types";
import { useBoard } from "../state/BoardProvider";
import type { PaperHit } from "./hit";

export const CONNECT_FAILED_MESSAGE = "Could not mark that heading. Nothing was connected.";

/** Connect mode on the paper (D12): after Connect on a mark, the next click on another mark or a heading is the
 *  other end. Escape cancels. `onError` shows a failure to the reader. */
export function useConnect(onError: (message: string) => void) {
  const { state, dispatch, paperId } = useBoard();
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  useEffect(() => {
    if (!connectingFrom) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setConnectingFrom(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [connectingFrom]);

  /** Connecting to a heading makes a highlight of it and connects to that (addendum 4.0); a mark already on the heading is reused. */
  const connectToHeading = async (from: string, section: Section) => {
    const existing = state.board.highlights.find((h) => linesInside(h, [section.heading_rect]).length > 0);
    if (existing) return dispatch({ type: "add", edges: [newEdge(from, existing.id)] });
    try {
      const selection = await api.postText(paperId, [section.heading_rect], false, "text");
      const highlight = { id: newId("h"), tags: [], anchor: selection.highlight };
      dispatch({ type: "add", highlights: [highlight], edges: [newEdge(from, highlight.id)] });   // one undo step
    } catch (failure) {
      console.error(CONNECT_FAILED_MESSAGE, failure);
      onError(CONNECT_FAILED_MESSAGE);
    }
  };
  const connectTo = (hit: PaperHit) => {
    const from = connectingFrom;
    setConnectingFrom(null);
    if (!from) return;
    if (hit.mark) dispatch({ type: "add", edges: [newEdge(from, hit.mark.id)] });   // the reducer drops a line to itself
    else if (hit.heading) void connectToHeading(from, hit.heading);
  };
  return { connectingFrom, start: setConnectingFrom, cancel: () => setConnectingFrom(null), connectTo };
}
