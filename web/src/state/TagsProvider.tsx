import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api/client";
import { newId } from "../model/ids";
import type { Tag } from "../model/types";

/** A tag's colour is data in tags.json; a new tag starts slate, the colour of the pass presets (addendum 4.3). */
export const NEW_TAG_COLOUR = "#64748B";
export const TAGS_FAILED_MESSAGE = "Could not load or save the tags. Changes to tags may be lost.";

type TagsCtx = {
  tags: Tag[]; byId: ReadonlyMap<string, Tag>; error: string | null;
  add: (name: string) => Promise<Tag>; update: (tag: Tag) => Promise<void>; remove: (id: string) => Promise<void>;
};
const TagsContext = createContext<TagsCtx | null>(null);

/** Tags are global across boards, never per paper (SPEC 5.2). Loaded once for the whole app. */
export function TagsProvider({ children }: { children: React.ReactNode }) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [error, setError] = useState<string | null>(null);
  const current = useRef<Tag[]>([]);
  const fail = useCallback((cause: unknown) => { console.error(TAGS_FAILED_MESSAGE, cause); setError(TAGS_FAILED_MESSAGE); }, []);
  useEffect(() => {
    api.getTags().then((file) => { current.current = file.tags; setTags(file.tags); }, fail);
  }, [fail]);
  const write = useCallback(async (next: Tag[]) => {
    current.current = next;
    setTags(next);
    try {
      const file = await api.putTags({ schema: 1, tags: next });
      current.current = file.tags;
      setTags(file.tags);
      setError(null);
    } catch (cause) { fail(cause); }
  }, [fail]);
  const add = useCallback(async (name: string) => {
    const tag: Tag = { id: newId("t"), name, colour: NEW_TAG_COLOUR };
    await write([...current.current, tag]);
    return tag;
  }, [write]);
  const update = useCallback((tag: Tag) => write(current.current.map((t) => (t.id === tag.id ? tag : t))), [write]);
  const remove = useCallback((id: string) => write(current.current.filter((t) => t.id !== id)), [write]);
  const value = useMemo(() => ({ tags, byId: new Map(tags.map((t) => [t.id, t])), error, add, update, remove }), [tags, error, add, update, remove]);
  return <TagsContext.Provider value={value}>{children}</TagsContext.Provider>;
}

export function useTags(): TagsCtx {
  const ctx = useContext(TagsContext);
  if (!ctx) throw new Error("useTags outside TagsProvider");
  return ctx;
}
