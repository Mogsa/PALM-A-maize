import { useCallback, useRef } from "react";
import { api } from "../api/client";
import type { PageRect } from "../model/types";

/** The words under a rect of the paper, read by the existing `POST /text` once per rect for the session (D24, D26,
 *  D28). A failed read is tried again next time. */
export function useWordsUnder(paperId: string) {
  const cache = useRef(new Map<string, Promise<string>>());
  return useCallback((at: PageRect): Promise<string> => {
    const key = `${at.page}:${at.rect.join(",")}`;
    const cached = cache.current.get(key);
    if (cached) return cached;
    const read = api.postText(paperId, [at], false, "text").then((s) => s.text);
    read.catch(() => cache.current.delete(key));
    cache.current.set(key, read);
    return read;
  }, [paperId]);
}
