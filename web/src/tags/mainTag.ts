import type { Tag } from "../model/types";

/** The first tag is the main tag (spec A2): it sets a mark's colour and a card's edge. The others are extras.
 *  A colour replaces the main tag; plain (null) drops it. A tag is never listed twice. */
export function setMainTag(tags: string[], tagId: string | null): string[] {
  const extras = tags.slice(1).filter((t) => t !== tagId);
  return tagId ? [tagId, ...extras] : extras;
}

/** Add tag (spec A2): appended as an extra, or the main tag when there is none yet. */
export function addTag(tags: string[], tagId: string): string[] {
  return tags.includes(tagId) ? tags : [...tags, tagId];
}

/** The main tag's colour; none when there is no tag or the tag was deleted (addendum 4.3: a deleted id is ignored). */
export function mainTagColour(tags: string[], byId: ReadonlyMap<string, Tag>): string | undefined {
  return tags.length ? byId.get(tags[0])?.colour : undefined;
}
