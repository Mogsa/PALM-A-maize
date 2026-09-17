import { ulid } from "ulid";

export type IdKind = "n" | "e" | "h";

/** Client-minted, time-sortable, prefixed by kind (addendum 4.5). */
export function newId(kind: IdKind): string {
  return `${kind}-${ulid()}`;
}
